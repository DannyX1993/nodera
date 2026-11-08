/**
 * Explicit `Arrange` over the selected layout strategy.
 *
 * Every assertion goes through the public builder surface — `createBuilder`,
 * `builder.graph` and `builder.graphLayout` — and reads back the §9 instance
 * views. Nothing here reads internal storage or reaches into a registry the
 * host cannot see, and nothing arranges unless the host asks for it.
 */

import { describe, expect, it } from "vitest";
import { err, ok } from "@nodera/contracts";
import type { Result } from "@nodera/contracts";

import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";
import type { BuilderConfiguration, BuilderGraphConfiguration } from "../builder/configuration.js";
import type { SdkIssues } from "../errors.js";
import type { ArrangeRequest } from "./graph-api.js";
import type { NodeInstanceView } from "../view/instances.js";
import type {
  GraphLayoutDiagnostic,
  GraphLayoutInput,
  GraphLayoutOptions,
  GraphLayoutResult,
  GraphLayoutStrategy,
} from "../vocabulary.js";

const STEP = "flow.step";
const LAYERED = "nodera.graph-layout.layered";
const FREE = "nodera.graph-layout.free";

function nodeInput(type: string): NodeDefinitionInput {
  return {
    type,
    version: "1.0.0",
    label: type,
    category: "flow",
    ports: {
      inputs: [{ id: "in", dataType: "any" }],
      outputs: [{ id: "out", dataType: "any" }],
    },
  };
}

/** Configuration of a host that declares only the `flow.step` definition. */
function configured(layout?: unknown): BuilderConfiguration {
  const registry = { nodes: [nodeInput(STEP)] };
  return layout === undefined
    ? { registry }
    : { registry, graph: { layout } as BuilderGraphConfiguration };
}

function builderWith(layout?: unknown): Builder {
  const result = createBuilder(configured(layout));
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

function buildFailure(
  layout: unknown,
): readonly { readonly code: string; readonly path?: readonly string[] }[] {
  const result = createBuilder(configured(layout));
  if (result.ok) {
    throw new Error("expected the builder to refuse an invalid graph layout");
  }
  return result.error;
}

function added(builder: Builder, nodeId: string, position?: { x: number; y: number }): void {
  const result = builder.graph.addNode({
    type: STEP,
    nodeId,
    ...(position === undefined ? {} : { position }),
  });
  if (!result.ok) {
    throw new Error(
      `unexpected add-node failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
}

function connected(builder: Builder, source: string, target: string): void {
  const result = builder.graph.connect({ source, target });
  if (!result.ok) {
    throw new Error(
      `unexpected connect failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
}

/** Positions of every node, keyed by instance id, as the host reads them. */
function positions(
  builder: Builder,
): Record<string, { readonly x: number; readonly y: number } | undefined> {
  return Object.fromEntries(builder.graph.nodes().map((node) => [node.id, node.position]));
}

/** The value of a successful `arrange`, failing the test when it was refused. */
function arranged(builder: Builder): readonly NodeInstanceView[] {
  const result = builder.graph.arrange();
  if (!result.ok) {
    throw new Error(
      `unexpected arrange failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

/** A two-node chain, the smallest graph with two ranks. */
function chain(builder: Builder): void {
  added(builder, "start");
  added(builder, "work");
  connected(builder, "start", "work");
}

/**
 * A host strategy, deliberately fake: it places the two known instance ids at
 * fixed coordinates, so the test can tell its geometry apart from the in-house
 * layered arrangement. It stands in for the adapter a host would write around a
 * third-party layouter; the framework ships no such dependency.
 */
function hostStrategy(id = "acme.dagre"): GraphLayoutStrategy {
  return {
    id,
    place(input: GraphLayoutInput): Result<GraphLayoutResult, GraphLayoutDiagnostic> {
      return ok<GraphLayoutResult>({
        positions: input.nodes.map((node, index) => ({
          nodeId: node.id,
          position: node.id === "start" ? { x: 10, y: 30 } : { x: 20 + index, y: 30 },
        })),
      });
    },
  };
}

/** A host strategy that refuses to arrange, with a structured diagnostic. */
function refusingStrategy(diagnostic: GraphLayoutDiagnostic): GraphLayoutStrategy {
  return { id: "acme.refusing", place: () => err(diagnostic) };
}

/**
 * A host strategy that records the options it was asked with.
 *
 * It observes the placement request an override produces without the test
 * reading anything the host cannot see.
 */
function recordingStrategy(calls: GraphLayoutOptions[]): GraphLayoutStrategy {
  return {
    id: "acme.recording",
    place(input: GraphLayoutInput): Result<GraphLayoutResult, GraphLayoutDiagnostic> {
      calls.push(input.options);
      return ok<GraphLayoutResult>({
        positions: input.nodes.map((node) => ({ nodeId: node.id, position: { x: 0, y: 0 } })),
      });
    },
  };
}

/**
 * Calls `arrange` with a request the SDK types would reject.
 *
 * The refusal tables below describe hosts that bypass the types; the runtime
 * boundary is what has to hold, so the cast stays here and nowhere else.
 */
function arrangeUnchecked(
  builder: Builder,
  request: unknown,
): Result<readonly NodeInstanceView[], SdkIssues> {
  return builder.graph.arrange(request as ArrangeRequest | undefined);
}

/** Two sources feeding one node: two ranks, and two nodes in the first one. */
function diamond(builder: Builder): void {
  added(builder, "a");
  added(builder, "b");
  added(builder, "c");
  connected(builder, "a", "c");
  connected(builder, "b", "c");
}

describe("graph arrange: the strategy the host selected", () => {
  it("places the default layered strategy's ranks on the horizontal axis", () => {
    const builder = builderWith();
    chain(builder);

    expect(builder.graphLayout.active()).toBe(LAYERED);
    const moved = arranged(builder);
    expect(moved).toHaveLength(2);
    expect(positions(builder)).toEqual({
      start: { x: 0, y: 0 },
      work: { x: 240, y: 0 },
    });
  });

  it("swaps the axes when the host declares a vertical direction", () => {
    const builder = builderWith({ direction: "vertical" });
    chain(builder);

    arranged(builder);
    expect(positions(builder)).toEqual({
      start: { x: 0, y: 0 },
      work: { x: 0, y: 240 },
    });
  });

  it("runs the strategy the host registered and selected by id", () => {
    const builder = builderWith();
    chain(builder);

    expect(builder.graphLayout.register(hostStrategy()).ok).toBe(true);
    expect(builder.graphLayout.setDefault("acme.dagre").ok).toBe(true);
    expect(builder.graphLayout.active()).toBe("acme.dagre");
    expect(builder.graphLayout.all().map((strategy) => strategy.id)).toContain("acme.dagre");

    arranged(builder);
    expect(positions(builder)).toEqual({
      start: { x: 10, y: 30 },
      work: { x: 21, y: 30 },
    });
  });
});

describe("graph arrange: the free strategy", () => {
  it("answers nothing and leaves every position and the history untouched", () => {
    const builder = builderWith({ strategy: FREE });
    added(builder, "start", { x: 5, y: 7 });
    added(builder, "work", { x: 50, y: 70 });

    expect(builder.graph.arrange()).toEqual(ok([]));
    expect(positions(builder)).toEqual({
      start: { x: 5, y: 7 },
      work: { x: 50, y: 70 },
    });
    // One undo still reverts the last add: arranging pushed no history entry.
    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodes()).toHaveLength(1);
  });
});

describe("graph arrange: history", () => {
  it("restores every previous position with one undo", () => {
    const builder = builderWith();
    added(builder, "start", { x: 500, y: 300 });
    added(builder, "work", { x: 650, y: 300 });
    connected(builder, "start", "work");

    arranged(builder);
    expect(positions(builder)).toEqual({
      start: { x: 0, y: 0 },
      work: { x: 240, y: 0 },
    });

    expect(builder.graph.undo()).toBe(true);
    expect(positions(builder)).toEqual({
      start: { x: 500, y: 300 },
      work: { x: 650, y: 300 },
    });
    expect(builder.graph.edgeCount()).toBe(1);

    expect(builder.graph.redo()).toBe(true);
    expect(positions(builder)).toEqual({
      start: { x: 0, y: 0 },
      work: { x: 240, y: 0 },
    });
  });

  it("returns an empty result for an empty graph and pushes no history entry", () => {
    const builder = builderWith();

    expect(builder.graph.arrange()).toEqual(ok([]));
    expect(builder.graph.canUndo()).toBe(false);
  });
});

describe("graph arrange: a strategy that refuses", () => {
  it("moves nothing and reports the strategy diagnostic", () => {
    const builder = builderWith();
    added(builder, "start", { x: 5, y: 7 });
    added(builder, "work", { x: 50, y: 70 });
    connected(builder, "start", "work");

    const diagnostic: GraphLayoutDiagnostic = {
      code: "graph-layout.invalid-options",
      message: "acme refuses to arrange this graph",
    };
    builder.graphLayout.register(refusingStrategy(diagnostic));
    builder.graphLayout.setDefault("acme.refusing");

    const result = builder.graph.arrange();
    if (result.ok) {
      throw new Error("expected the refusing strategy to be reported");
    }
    expect(result.error[0]?.code).toBe("sdk.invalid-input");
    expect(result.error[0]?.message).toBe(diagnostic.message);
    expect(result.error[0]?.metadata).toMatchObject({
      strategyId: "acme.refusing",
      strategyCode: diagnostic.code,
    });
    expect(positions(builder)).toEqual({
      start: { x: 5, y: 7 },
      work: { x: 50, y: 70 },
    });
  });
});

describe("graph arrange: per-call overrides", () => {
  it("applies a per-call direction override on top of the configured direction", () => {
    const builder = builderWith();
    chain(builder);
    arranged(builder);
    expect(positions(builder)).toEqual({
      start: { x: 0, y: 0 },
      work: { x: 240, y: 0 },
    });

    const moved = builder.graph.arrange({ direction: "vertical" });
    if (!moved.ok) {
      throw new Error(
        `unexpected arrange failure: ${moved.error.map((issue) => issue.code).join(", ")}`,
      );
    }
    expect(moved.value).toHaveLength(2);
    expect(positions(builder)).toEqual({
      start: { x: 0, y: 0 },
      work: { x: 0, y: 240 },
    });
  });

  it("persists nothing: the configured direction wins again on the next arrange", () => {
    const builder = builderWith({ direction: "horizontal" });
    chain(builder);

    builder.graph.arrange({ direction: "vertical" });
    expect(positions(builder)).toEqual({
      start: { x: 0, y: 0 },
      work: { x: 0, y: 240 },
    });

    arranged(builder);
    expect(positions(builder)).toEqual({
      start: { x: 0, y: 0 },
      work: { x: 240, y: 0 },
    });
  });

  it("passes per-call spacing and rankSpacing to the selected strategy", () => {
    const calls: GraphLayoutOptions[] = [];
    const builder = builderWith({ direction: "vertical", spacing: 120, rankSpacing: 300 });
    chain(builder);
    expect(builder.graphLayout.register(recordingStrategy(calls)).ok).toBe(true);
    expect(builder.graphLayout.setDefault("acme.recording").ok).toBe(true);

    builder.graph.arrange({ spacing: 90, rankSpacing: 400 });
    expect(calls).toEqual([
      { direction: "vertical", nodeSpacing: 90, rankSpacing: 400, scope: "all" },
    ]);

    arranged(builder);
    expect(calls[1]).toEqual({
      direction: "vertical",
      nodeSpacing: 120,
      rankSpacing: 300,
      scope: "all",
    });
  });

  it("changes the applied positions of the layered strategy with the overrides", () => {
    const builder = builderWith();
    diamond(builder);

    arranged(builder);
    expect(positions(builder)).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 0, y: 240 },
      c: { x: 240, y: 0 },
    });

    builder.graph.arrange({ spacing: 100, rankSpacing: 500 });
    expect(positions(builder)).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 0, y: 100 },
      c: { x: 500, y: 0 },
    });
  });

  const invalidOverrides: readonly {
    readonly request: unknown;
    readonly path: readonly string[];
  }[] = [
    { request: { direction: "diagonal" }, path: ["direction"] },
    { request: { spacing: 0 }, path: ["spacing"] },
    { request: { spacing: Number.NaN }, path: ["spacing"] },
    { request: { spacing: "240" }, path: ["spacing"] },
    { request: { rankSpacing: -240 }, path: ["rankSpacing"] },
    { request: { rankSpacing: Number.POSITIVE_INFINITY }, path: ["rankSpacing"] },
    { request: null, path: ["request"] },
  ];

  it.each(invalidOverrides)("refuses an invalid override at $path and moves nothing", ({
    request,
    path,
  }) => {
    const builder = builderWith();
    chain(builder);
    arranged(builder);
    const before = positions(builder);

    const result = arrangeUnchecked(builder, request);
    if (result.ok) {
      throw new Error("expected the invalid override to be refused");
    }
    expect(result.error[0]?.code).toBe("sdk.invalid-input");
    expect(result.error[0]?.path).toEqual(path);
    expect(positions(builder)).toEqual(before);
  });
});

describe("graph arrange: lifecycle", () => {
  it("refuses to arrange with an override on a disposed builder", () => {
    const builder = builderWith();
    chain(builder);
    builder.dispose();

    const result = builder.graph.arrange({ direction: "vertical" });
    if (result.ok) {
      throw new Error("expected a disposed builder to refuse an override");
    }
    expect(result.error[0]?.code).toBe("sdk.disposed");
    expect(builder.graph.nodes().every((node) => node.position === undefined)).toBe(true);
  });

  it("refuses to arrange on a disposed builder", () => {
    const builder = builderWith();
    chain(builder);
    builder.dispose();

    const result = builder.graph.arrange();
    if (result.ok) {
      throw new Error("expected a disposed builder to refuse arranging");
    }
    expect(result.error[0]?.code).toBe("sdk.disposed");
    expect(builder.graph.nodes().every((node) => node.position === undefined)).toBe(true);
  });
});

describe("graph arrange: configuration diagnostics", () => {
  it("refuses a strategy id no registry entry matches", () => {
    const issues = buildFailure({ strategy: "acme.unknown" });
    expect(issues[0]?.code).toBe("sdk.invalid-input");
    expect(issues[0]?.path).toEqual(["graph", "layout", "strategy"]);
  });

  it.each([0, -240, Number.NaN, Number.POSITIVE_INFINITY, "240"])(
    "refuses an invalid rankSpacing (%s)",
    (rankSpacing) => {
      const issues = buildFailure({ rankSpacing });
      expect(issues[0]?.code).toBe("sdk.invalid-input");
      expect(issues[0]?.path).toEqual(["graph", "layout", "rankSpacing"]);
    },
  );
});
