import { describe, expect, it } from "vitest";
import { createNodeId, ok } from "@nodera/contracts";
import type { RegistryError, Result } from "@nodera/contracts";

import {
  BUILT_IN_STRATEGY_IDS,
  DEFAULT_STRATEGY_ID,
  FREE_STRATEGY_ID,
  LAYERED_STRATEGY_ID,
  LayoutStrategyRegistry,
  type GraphLayoutDiagnostic,
  type GraphLayoutInput,
  type GraphLayoutOptions,
  type GraphLayoutResult,
  type GraphLayoutStrategy,
} from "./index.js";

/**
 * A third-party strategy, deliberately fake: it answers one constant position per
 * node, in input order, so a test can tell its geometry apart from any built-in
 * strategy. It stands in for the adapter a host would write around `dagre` — the
 * framework ships no such dependency (odd task T2, S9), and nothing here names or
 * imports one.
 */
const ACME_STRATEGY_ID = "acme.dagre";

function fakeThirdPartyStrategy(id: string = ACME_STRATEGY_ID): GraphLayoutStrategy {
  return {
    id,
    place(input: GraphLayoutInput): Result<GraphLayoutResult, GraphLayoutDiagnostic> {
      return ok<GraphLayoutResult>({
        positions: input.nodes.map((node, index) => ({
          nodeId: node.id,
          position: { x: 900 + index, y: 1000 + index },
        })),
      });
    },
  };
}

function options(): GraphLayoutOptions {
  return { direction: "horizontal", nodeSpacing: 40, rankSpacing: 100, scope: "all" };
}

/** A tiny two-node graph, enough to observe what a strategy answers. */
function input(): GraphLayoutInput {
  return {
    nodes: [{ id: createNodeId("start") }, { id: createNodeId("work") }],
    edges: [{ source: createNodeId("start"), target: createNodeId("work") }],
    options: options(),
  };
}

/** The value of a successful call; fails the test when it was rejected. */
function valueOf<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`expected a value, got the error ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** The error of a rejected registry call, pinning that it carries no value. */
function errorOf<T>(result: Result<T, RegistryError>): RegistryError {
  if (result.ok) {
    throw new Error("expected a registry error, got a value");
  }
  expect(Object.hasOwn(result, "value")).toBe(false);
  return result.error;
}

describe("LayoutStrategyRegistry", () => {
  it("registers the built-in strategies by default", () => {
    const registry = new LayoutStrategyRegistry();

    expect(registry.all().map((strategy) => strategy.id)).toEqual([...BUILT_IN_STRATEGY_IDS]);
    expect(registry.size).toBe(2);
    expect(registry.has(FREE_STRATEGY_ID)).toBe(true);
    expect(registry.has(LAYERED_STRATEGY_ID)).toBe(true);
  });

  it("selects the layered strategy when the host names none", () => {
    const registry = new LayoutStrategyRegistry();

    expect(registry.defaultStrategyId).toBe(DEFAULT_STRATEGY_ID);
    expect(registry.getDefault().id).toBe(LAYERED_STRATEGY_ID);
  });

  it("honours defaultStrategyId when the host names one", () => {
    const registry = new LayoutStrategyRegistry({ defaultStrategyId: FREE_STRATEGY_ID });

    expect(registry.defaultStrategyId).toBe(FREE_STRATEGY_ID);
    expect(registry.getDefault().id).toBe(FREE_STRATEGY_ID);
    expect(registry.size).toBe(2);
  });

  it("falls back to the first supplied strategy when the host replaces the list", () => {
    const first = fakeThirdPartyStrategy("acme.first");
    const second = fakeThirdPartyStrategy("acme.second");
    const registry = new LayoutStrategyRegistry({ strategies: [first, second] });

    expect(registry.defaultStrategyId).toBe("acme.first");
    expect(registry.getDefault()).toBe(first);
    expect(registry.has(FREE_STRATEGY_ID)).toBe(false);
    expect(registry.has(LAYERED_STRATEGY_ID)).toBe(false);
    expect(registry.size).toBe(2);
  });

  it("makes a registered custom strategy retrievable and runs it through the registry", () => {
    const registry = new LayoutStrategyRegistry();
    const custom = fakeThirdPartyStrategy();

    expect(valueOf(registry.register(custom))).toBe(custom);
    expect(registry.has(ACME_STRATEGY_ID)).toBe(true);
    expect(registry.get(ACME_STRATEGY_ID)).toBe(custom);
    expect(registry.all().map((strategy) => strategy.id)).toContain(ACME_STRATEGY_ID);
    expect(registry.size).toBe(3);

    const placement = valueOf(valueOf(registry.require(ACME_STRATEGY_ID)).place(input()));

    expect(placement.positions).toEqual([
      { nodeId: "start", position: { x: 900, y: 1000 } },
      { nodeId: "work", position: { x: 901, y: 1001 } },
    ]);
  });

  it("rejects a duplicate id and leaves the original entry registered", () => {
    const registry = new LayoutStrategyRegistry();
    const original = registry.get(LAYERED_STRATEGY_ID);

    const error = errorOf(registry.register(fakeThirdPartyStrategy(LAYERED_STRATEGY_ID)));

    expect(error.kind).toBe("duplicate-id");
    expect(error.id).toBe(LAYERED_STRATEGY_ID);
    expect(registry.get(LAYERED_STRATEGY_ID)).toBe(original);
    expect(registry.size).toBe(2);
  });

  it("changes the default for a registered id and keeps it for an unknown one", () => {
    const registry = new LayoutStrategyRegistry();

    expect(valueOf(registry.setDefault(FREE_STRATEGY_ID)).id).toBe(FREE_STRATEGY_ID);
    expect(registry.defaultStrategyId).toBe(FREE_STRATEGY_ID);
    expect(registry.getDefault().id).toBe(FREE_STRATEGY_ID);

    const error = errorOf(registry.setDefault("acme.unknown"));

    expect(error.kind).toBe("not-found");
    expect(error.id).toBe("acme.unknown");
    expect(registry.defaultStrategyId).toBe(FREE_STRATEGY_ID);
    expect(registry.getDefault().id).toBe(FREE_STRATEGY_ID);
  });

  it("removes an entry on unregister so require then answers not-found", () => {
    const registry = new LayoutStrategyRegistry();

    expect(valueOf(registry.unregister(FREE_STRATEGY_ID)).id).toBe(FREE_STRATEGY_ID);
    expect(registry.has(FREE_STRATEGY_ID)).toBe(false);
    expect(registry.size).toBe(1);
    expect(registry.all().map((strategy) => strategy.id)).toEqual([LAYERED_STRATEGY_ID]);

    const error = errorOf(registry.require(FREE_STRATEGY_ID));

    expect(error.kind).toBe("not-found");
    expect(error.id).toBe(FREE_STRATEGY_ID);
  });
});

describe("LayoutStrategyRegistry: keeping the default registered", () => {
  it("moves the default to the remaining strategy when the default entry is unregistered", () => {
    const registry = new LayoutStrategyRegistry();

    expect(valueOf(registry.unregister(LAYERED_STRATEGY_ID)).id).toBe(LAYERED_STRATEGY_ID);
    expect(registry.defaultStrategyId).toBe(FREE_STRATEGY_ID);
    expect(registry.getDefault().id).toBe(FREE_STRATEGY_ID);
  });

  it("leaves no default once every strategy is unregistered", () => {
    const registry = new LayoutStrategyRegistry();

    valueOf(registry.unregister(LAYERED_STRATEGY_ID));
    valueOf(registry.unregister(FREE_STRATEGY_ID));

    expect(registry.size).toBe(0);
    expect(() => registry.getDefault()).toThrow(/has no strategies/);
  });

  it("refuses to build a registry with no strategy at all", () => {
    expect(() => new LayoutStrategyRegistry({ strategies: [] })).toThrow(/at least one strategy/);
  });
});
