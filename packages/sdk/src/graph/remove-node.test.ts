/**
 * `builder.graph.removeNode`: what removing a node does when the layout owns the
 * graph.
 *
 * Every assertion goes through the public builder surface: the request is the
 * SDK vocabulary, removal answers a §9 instance view, the graph is read back with
 * `nodes()` / `edges()` and the geometry with the positions those views carry.
 * History is read only through `undo()` / `redo()` / `canUndo()`, and the second
 * unit only through `lastAutoArrangement()`, so the tests pin what a host can
 * observe.
 *
 * The two policies S22 names are isolated here: `"detach"` — the default — keeps
 * today's behaviour exactly (node and edges gone, one undo, nothing arranged),
 * and `"splice"` joins every predecessor to every successor inside the same
 * history unit, arranging afterwards only when the downstream policy asks for it.
 */

import { describe, expect, it } from "vitest";
import { err } from "@nodera/contracts";
import type { EdgeDefinitionInput } from "../authoring/edges.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";
import type { BuilderGraphConfiguration } from "../builder/configuration.js";
import type { NodeInstanceView } from "../view/instances.js";
import type { GraphLayoutDiagnostic, GraphLayoutStrategy } from "../vocabulary.js";

const SOURCE = "http.request";
const MIDDLE = "http.middleware";
const TARGET = "http.response";
const FLOW = "http.flow";

function nodeInput(type: string): NodeDefinitionInput {
  return {
    type,
    version: "1.0.0",
    label: type,
    category: "http",
    ports: {
      inputs: [{ id: "in", dataType: "any" }],
      outputs: [{ id: "out", dataType: "any" }],
    },
  };
}

function edgeInput(): EdgeDefinitionInput {
  return { type: FLOW, label: "HTTP flow" };
}

/** Builder with three node definitions and one edge definition registered. */
function create(layout?: unknown): Builder {
  const graph = layout === undefined ? {} : { graph: { layout } as BuilderGraphConfiguration };
  const result = createBuilder({
    registry: {
      nodes: [nodeInput(SOURCE), nodeInput(MIDDLE), nodeInput(TARGET)],
      edges: [edgeInput()],
    },
    ...graph,
  });
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

function added(
  builder: Builder,
  type: string,
  id: string,
  position?: { readonly x: number; readonly y: number },
): NodeInstanceView {
  const result = builder.graph.addNode({
    type,
    nodeId: id,
    ...(position === undefined ? {} : { position }),
  });
  if (!result.ok) {
    throw new Error(
      `unexpected add-node failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

/** One edge between two nodes, in the shape the builder returns it. */
function connectOrThrow(builder: Builder, source: string, target: string): string {
  const connected = builder.graph.connect({
    source,
    target,
    sourcePort: "out",
    targetPort: "in",
    type: FLOW,
  });
  if (!connected.ok) {
    throw new Error(
      `unexpected connect failure: ${connected.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return connected.value.id;
}

/** Endpoints of one edge, keyed by id, in the flat instance vocabulary. */
function flowOf(builder: Builder): readonly string[] {
  return builder.graph
    .edges()
    .map((edge) => `${edge.source}:${edge.sourcePort} -> ${edge.target}:${edge.targetPort}`)
    .sort();
}

/** Positions of every node, keyed by instance id, as the host reads them. */
function positionsOf(
  builder: Builder,
): Record<string, { readonly x: number; readonly y: number } | undefined> {
  return Object.fromEntries(builder.graph.nodes().map((node) => [node.id, node.position]));
}

/** A host strategy that refuses to place anything, with a structured diagnostic. */
function refusingStrategy(diagnostic: GraphLayoutDiagnostic): GraphLayoutStrategy {
  return { id: "acme.refusing", place: () => err(diagnostic) };
}

/** Graph `node-source --> node-middle --> node-target`. */
function chain(builder: Builder): void {
  added(builder, SOURCE, "node-source");
  added(builder, MIDDLE, "node-middle");
  added(builder, TARGET, "node-target");
  connectOrThrow(builder, "node-source", "node-middle");
  connectOrThrow(builder, "node-middle", "node-target");
}

describe("graph.removeNode: the detach policy", () => {
  it("is the default and keeps today's removal exactly", () => {
    const builder = create();
    expect(builder.graphLayout.removalPolicy()).toBe("detach");
    chain(builder);

    const removed = builder.graph.removeNode("node-middle");

    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.id).toBe("node-middle");
    // No splice: the node leaves no relation behind it.
    expect(builder.graph.nodes().map((node) => node.id)).toEqual([
      "node-source",
      "node-target",
    ]);
    expect(flowOf(builder)).toEqual([]);

    // One undo restores the node and both of its edges, ids included.
    expect(builder.graph.undo()).toBe(true);
    expect(flowOf(builder)).toEqual([
      "node-middle:out -> node-target:in",
      "node-source:out -> node-middle:in",
    ]);
    expect(builder.graph.nodeCount()).toBe(3);
  });

  it("arranges nothing afterwards, whatever the downstream policy says", () => {
    const builder = create({ mode: "auto" });
    added(builder, SOURCE, "node-source", { x: 700, y: 700 });
    added(builder, MIDDLE, "node-middle", { x: 900, y: 900 });
    added(builder, TARGET, "node-target", { x: 1300, y: 1300 });
    connectOrThrow(builder, "node-source", "node-middle");
    connectOrThrow(builder, "node-middle", "node-target");
    // The policy is turned on after the graph exists, so the coordinates below
    // are the ones the host declared and the removal is what may change them.
    expect(builder.graphLayout.setArrangeOnChange("downstream").ok).toBe(true);

    builder.graph.removeNode("node-middle");

    expect(positionsOf(builder)).toEqual({
      "node-source": { x: 700, y: 700 },
      "node-target": { x: 1300, y: 1300 },
    });
    expect(builder.graph.lastAutoArrangement()).toEqual({ outcome: "skipped" });
  });
});

describe("graph.removeNode: the splice policy", () => {
  it("joins the predecessor to the successor inside the removal's own unit", () => {
    const builder = create({ onRemove: "splice" });
    expect(builder.graphLayout.removalPolicy()).toBe("splice");
    chain(builder);

    const removed = builder.graph.removeNode("node-middle");

    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.id).toBe("node-middle");
    expect(builder.graph.nodes().map((node) => node.id)).toEqual([
      "node-source",
      "node-target",
    ]);
    // One hop instead of a hole: the predecessor's and the successor's own ports
    // travel on the spliced relation, and it keeps the removed edge's type.
    expect(builder.graph.edgeCount()).toBe(1);
    expect(flowOf(builder)).toEqual(["node-source:out -> node-target:in"]);
    expect(builder.graph.edges()[0]?.type).toBe(FLOW);

    // One undo, not two: the node and both original edges come back and the
    // splice is gone.
    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodeCount()).toBe(3);
    expect(flowOf(builder)).toEqual([
      "node-middle:out -> node-target:in",
      "node-source:out -> node-middle:in",
    ]);

    expect(builder.graph.redo()).toBe(true);
    expect(builder.graph.edgeCount()).toBe(1);
    expect(builder.graph.nodes().map((node) => node.id)).toEqual([
      "node-source",
      "node-target",
    ]);
  });

  it("still refuses an unknown node without side effects", () => {
    const builder = create({ onRemove: "splice" });
    chain(builder);
    const before = { nodes: builder.graph.nodes(), edges: builder.graph.edges() };

    const removed = builder.graph.removeNode("node-missing");

    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      metadata: { useCaseCode: "node-not-found", elementId: "node-missing" },
    });
    expect(builder.graph.nodes()).toEqual(before.nodes);
    expect(builder.graph.edges()).toEqual(before.edges);
    expect(builder.graph.lastAutoArrangement()).toEqual({ outcome: "skipped" });

    // The refusal pushed no unit: one undo still reverts the last connect.
    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.edgeCount()).toBe(1);
    expect(builder.graph.nodeCount()).toBe(3);
  });
});

/**
 * `watchdog --> upstream --> middle --> below`, so the removed node's
 * predecessor is `upstream` and everything written by the automatic arrangement
 * is downstream of it. `watchdog` is upstream of the predecessor, which is what
 * tells a scoped arrangement apart from a whole-graph one.
 */
function chainedBranch(builder: Builder): void {
  added(builder, SOURCE, "node-watchdog", { x: 0, y: 1000 });
  added(builder, MIDDLE, "node-upstream", { x: 500, y: 500 });
  added(builder, MIDDLE, "node-middle", { x: 900, y: 900 });
  added(builder, TARGET, "node-below", { x: 1300, y: 1300 });
  connectOrThrow(builder, "node-watchdog", "node-upstream");
  connectOrThrow(builder, "node-upstream", "node-middle");
  connectOrThrow(builder, "node-middle", "node-below");
}

describe("graph.removeNode: splice plus the downstream policy", () => {
  it("arranges the spliced branch afterwards and leaves the branch above untouched", () => {
    const builder = create({ mode: "auto", onRemove: "splice" });
    chainedBranch(builder);
    expect(builder.graphLayout.setArrangeOnChange("downstream").ok).toBe(true);

    builder.graph.removeNode("node-middle");

    // The predecessor and the successor take the arrangement; the node upstream
    // of the predecessor keeps every coordinate it had.
    expect(positionsOf(builder)).toEqual({
      "node-watchdog": { x: 0, y: 1000 },
      "node-upstream": { x: 240, y: 0 },
      "node-below": { x: 480, y: 0 },
    });
    const outcome = builder.graph.lastAutoArrangement();
    if (outcome.outcome !== "arranged") {
      throw new Error(`expected an arrangement, got ${outcome.outcome}`);
    }
    expect(outcome.nodes.map((node: NodeInstanceView) => node.id)).toEqual([
      "node-upstream",
      "node-below",
    ]);

    // One undo steps the arrangement back, not the removal: it is a unit of its
    // own, applied after the mutation.
    expect(builder.graph.undo()).toBe(true);
    expect(positionsOf(builder)).toEqual({
      "node-watchdog": { x: 0, y: 1000 },
      "node-upstream": { x: 500, y: 500 },
      "node-below": { x: 1300, y: 1300 },
    });

    // A second undo is the removal itself, splice included.
    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodeCount()).toBe(4);
    expect(flowOf(builder)).toContain("node-upstream:out -> node-middle:in");
    expect(flowOf(builder)).toContain("node-middle:out -> node-below:in");
  });

  it("reports a refused arrangement without failing the removal", () => {
    const builder = create({ mode: "auto", onRemove: "splice" });
    chainedBranch(builder);
    expect(builder.graphLayout.setArrangeOnChange("downstream").ok).toBe(true);
    const diagnostic: GraphLayoutDiagnostic = {
      code: "graph-layout.invalid-options",
      message: "acme refuses to arrange this graph",
    };
    builder.graphLayout.register(refusingStrategy(diagnostic));
    builder.graphLayout.setDefault("acme.refusing");

    const removed = builder.graph.removeNode("node-middle");

    expect(removed.ok).toBe(true);
    expect(builder.graph.edgeCount()).toBe(2);
    expect(flowOf(builder)).toEqual([
      "node-upstream:out -> node-below:in",
      "node-watchdog:out -> node-upstream:in",
    ]);
    expect(positionsOf(builder)["node-below"]).toEqual({ x: 1300, y: 1300 });
    const outcome = builder.graph.lastAutoArrangement();
    if (outcome.outcome !== "refused") {
      throw new Error(`expected a refusal, got ${outcome.outcome}`);
    }
    expect(outcome.issues[0]?.code).toBe("sdk.invalid-input");
    expect(outcome.issues[0]?.message).toBe(diagnostic.message);

    // The refusal pushed no unit: one undo removes the splice and the node.
    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodeCount()).toBe(4);
    expect(flowOf(builder)).toContain("node-upstream:out -> node-middle:in");
  });

  it("arranges nothing when the host owns the positions", () => {
    const builder = create({ mode: "free", onRemove: "splice" });
    added(builder, SOURCE, "node-source", { x: 0, y: 0 });
    added(builder, MIDDLE, "node-middle", { x: 700, y: 700 });
    added(builder, TARGET, "node-target", { x: 1300, y: 1300 });
    connectOrThrow(builder, "node-source", "node-middle");
    connectOrThrow(builder, "node-middle", "node-target");
    expect(builder.graphLayout.setArrangeOnChange("downstream").ok).toBe(true);

    builder.graph.removeNode("node-middle");

    expect(positionsOf(builder)).toEqual({
      "node-source": { x: 0, y: 0 },
      "node-target": { x: 1300, y: 1300 },
    });
    expect(builder.graph.lastAutoArrangement()).toEqual({ outcome: "skipped" });
  });
});
