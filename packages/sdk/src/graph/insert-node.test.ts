/**
 * `builder.graph.insertNode`: one node inserted on an existing edge.
 *
 * Every assertion goes through the public builder surface: the request is the
 * SDK vocabulary, the answers are §9 instance views, and the graph is read back
 * with `builder.graph.nodes()` / `edges()`. History is read only through
 * `undo()` / `redo()` / `canUndo()`, so the tests pin what a host can observe.
 *
 * The two rules worth isolating are the shape of the insertion (two flat edges
 * carrying the original endpoints and ports) and the position: `mode: "auto"`
 * decides it before the use case runs, so it belongs to the same history unit,
 * and `mode: "free"` invents none.
 */

import { describe, expect, it } from "vitest";
import { err } from "@nodera/contracts";
import type { Result } from "@nodera/contracts";
import type { EdgeDefinitionInput } from "../authoring/edges.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";
import type { BuilderGraphConfiguration } from "../builder/configuration.js";
import type { NodeInstanceView } from "../view/instances.js";
import type {
  GraphLayoutDiagnostic,
  GraphLayoutStrategy,
} from "../vocabulary.js";

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
  extra: { readonly nodeId?: string; readonly position?: { x: number; y: number } } = {},
): NodeInstanceView {
  const result = builder.graph.addNode({
    type,
    ...(extra.nodeId === undefined ? {} : { nodeId: extra.nodeId }),
    ...(extra.position === undefined ? {} : { position: extra.position }),
  });
  if (!result.ok) {
    throw new Error(
      `unexpected add-node failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

/** Graph `source --edge--> target`, and the id of that edge. */
function connectOrThrow(builder: Builder, source: string, target: string): string {
  const connected = builder.graph.connect({
    source,
    target,
    sourcePort: "out",
    targetPort: "in",
    type: FLOW,
    label: "original",
  });
  if (!connected.ok) {
    throw new Error(
      `unexpected connect failure: ${connected.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return connected.value.id;
}

function inserted(builder: Builder, edgeId: string, extra: Record<string, unknown> = {}) {
  const result = builder.graph.insertNode({ edgeId, type: MIDDLE, ...extra });
  if (!result.ok) {
    throw new Error(
      `unexpected insert failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
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

describe("graph.insertNode: the insertion", () => {
  it("returns the node and both new edges in the flat instance vocabulary", () => {
    const builder = create();
    const source = added(builder, SOURCE, { nodeId: "node-source" });
    const target = added(builder, TARGET, { nodeId: "node-target" });
    const edgeId = connectOrThrow(builder, source.id, target.id);

    const insertion = inserted(builder, edgeId, {
      nodeId: "node-middle",
      properties: { retries: 2 },
    });

    expect(insertion.node).toMatchObject({
      id: "node-middle",
      type: MIDDLE,
      properties: { retries: 2 },
    });
    expect(insertion.edges).toHaveLength(2);
    expect(insertion.edges[0]).toMatchObject({
      source: "node-source",
      sourcePort: "out",
      target: "node-middle",
      targetPort: "in",
      type: FLOW,
    });
    expect(insertion.edges[1]).toMatchObject({
      source: "node-middle",
      sourcePort: "out",
      target: "node-target",
      targetPort: "in",
      type: FLOW,
    });

    // The graph holds the insertion, and the original edge is gone.
    expect(builder.graph.nodes().map((node) => node.id)).toEqual([
      "node-source",
      "node-target",
      "node-middle",
    ]);
    expect(builder.graph.edges().map((edge) => edge.id)).toEqual([
      insertion.edges[0].id,
      insertion.edges[1].id,
    ]);
    expect(builder.graph.edgeCount()).toBe(2);
  });

  it("one undo restores the exact original edge and leaves no trace of the insertion", () => {
    const builder = create();
    const source = added(builder, SOURCE, { nodeId: "node-source" });
    const target = added(builder, TARGET, { nodeId: "node-target" });
    const edgeId = connectOrThrow(builder, source.id, target.id);
    const original = builder.graph.edges().find((edge) => edge.id === edgeId);
    expect(original).toBeDefined();
    const insertion = inserted(builder, edgeId, { nodeId: "node-middle" });

    expect(builder.graph.undo()).toBe(true);

    expect(builder.graph.edges()).toEqual([original]);
    expect(builder.graph.nodes().map((node) => node.id)).toEqual([
      "node-source",
      "node-target",
    ]);
    expect(builder.graph.nodeCount()).toBe(2);
    expect(builder.graph.edges().map((edge) => edge.id)).not.toContain(insertion.node.id);

    expect(builder.graph.redo()).toBe(true);
    expect(builder.graph.edgeCount()).toBe(2);
    expect(builder.graph.nodes().map((node) => node.id)).toContain("node-middle");
  });
});

describe("graph.insertNode: refused requests", () => {
  const refusedCases: readonly {
    readonly name: string;
    readonly request: (edgeId: string) => { readonly edgeId: string; readonly type: string } & Record<string, unknown>;
    readonly path?: readonly string[];
    readonly useCaseCode: string;
  }[] = [
    {
      name: "an unknown edge",
      request: () => ({ edgeId: "edge-missing", type: MIDDLE }),
      path: ["edgeId"],
      useCaseCode: "edge-not-found",
    },
    {
      name: "an unknown definition",
      request: (edgeId) => ({ edgeId, type: "http.unknown" }),
      useCaseCode: "node-definition-not-found",
    },
    {
      name: "a taken instance id",
      request: (edgeId) => ({ edgeId, type: MIDDLE, nodeId: "node-source" }),
      useCaseCode: "duplicate-node-id",
    },
  ];

  it.each(refusedCases)("refuses $name and changes nothing", ({ request, path, useCaseCode }) => {
    const builder = create();
    const source = added(builder, SOURCE, { nodeId: "node-source" });
    const target = added(builder, TARGET, { nodeId: "node-target" });
    const edgeId = connectOrThrow(builder, source.id, target.id);
    const before = { nodes: builder.graph.nodes(), edges: builder.graph.edges() };

    const result = builder.graph.insertNode(request(edgeId));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]?.code).toBe("sdk.invalid-input");
    expect(result.error[0]?.path).toEqual(path);
    expect(result.error[0]?.metadata?.["useCaseCode"]).toBe(useCaseCode);
    expect(builder.graph.nodes()).toEqual(before.nodes);
    expect(builder.graph.edges()).toEqual(before.edges);

    // The refusal pushed no history unit: one undo still reverts the connect.
    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.edgeCount()).toBe(0);
  });

  it("refuses an unknown edge id by name, before anything is created", () => {
    const builder = create();

    const result = builder.graph.insertNode({ edgeId: "edge-missing", type: MIDDLE });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]?.message).toContain("edge-missing");
    expect(builder.graph.canUndo()).toBe(false);
  });

  it("refuses a malformed edge id instead of throwing", () => {
    const builder = create();

    const result = builder.graph.insertNode({ edgeId: "not an id", type: MIDDLE });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]?.code).toBe("sdk.invalid-input");
    expect(result.error[0]?.path).toEqual(["edgeId"]);
  });
});

describe("graph.insertNode: placement of the inserted node", () => {
  it("lands one step past the edge source in auto mode, inside the same history unit", () => {
    const builder = create({ mode: "auto", spacing: 240 });
    // The endpoints are two slots apart, so the insertion has its own slot
    // between them.
    const source = added(builder, SOURCE, { position: { x: 0, y: 0 } });
    const target = added(builder, TARGET, { position: { x: 480, y: 0 } });
    const edgeId = connectOrThrow(builder, source.id, target.id);

    const insertion = inserted(builder, edgeId, { nodeId: "node-middle" });

    expect(insertion.node.position).toEqual({ x: 240, y: 0 });

    // The position belongs to the insertion: one undo takes the node with it.
    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodes().map((node) => node.id)).not.toContain("node-middle");

    expect(builder.graph.redo()).toBe(true);
    expect(
      builder.graph.nodes().find((node) => node.id === "node-middle")?.position,
    ).toEqual({ x: 240, y: 0 });
  });

  it("leaves the node unpositioned in free mode", () => {
    const builder = create();
    const source = added(builder, SOURCE, { position: { x: 0, y: 0 } });
    const target = added(builder, TARGET, { position: { x: 480, y: 0 } });
    const edgeId = connectOrThrow(builder, source.id, target.id);

    const insertion = inserted(builder, edgeId, { nodeId: "node-middle" });

    expect(insertion.node.position).toBeUndefined();
    expect(
      builder.graph.nodes().find((node) => node.id === "node-middle")?.position,
    ).toBeUndefined();
  });
});

/**
 * `source --edge--> target`, plus a sibling branch off the same source.
 *
 * The sibling is a descendant of the source but **not** of the node inserted on
 * the edge, so it is what tells a scoped arrangement apart from a whole-graph
 * one. The coordinates are chosen so every written position differs from the
 * one the node carried before.
 */
function fork(builder: Builder): string {
  const source = added(builder, SOURCE, {
    nodeId: "node-source",
    position: { x: 0, y: 500 },
  });
  const sibling = added(builder, MIDDLE, {
    nodeId: "node-sibling",
    position: { x: 1000, y: 1000 },
  });
  const target = added(builder, TARGET, {
    nodeId: "node-target",
    position: { x: 900, y: 900 },
  });
  const edgeId = connectOrThrow(builder, source.id, target.id);
  connectOrThrow(builder, source.id, sibling.id);
  return edgeId;
}

describe("graph.insertNode: the downstream auto policy", () => {
  it("re-places the inserted node and its descendants as their own history unit", () => {
    const builder = create({ mode: "auto" });
    const edgeId = fork(builder);
    expect(builder.graphLayout.arrangeOnChange()).toBe("never");

    // The policy is host configuration: the host can turn it on without a rebuild.
    expect(builder.graphLayout.setArrangeOnChange("downstream").ok).toBe(true);

    inserted(builder, edgeId, { nodeId: "node-middle" });

    // The inserted node and its descendant take the arrangement; the source
    // anchors it and the sibling branch keeps every coordinate it had. Rewritten
    // by the alignment rule: the target has one parent, so it takes that parent's
    // column `0` (old: 140, half a pitch — the default 40-tall box plus the 240
    // gap — because its one-node rank was centred over the wider one).
    expect(positionsOf(builder)).toEqual({
      "node-source": { x: 0, y: 500 },
      "node-sibling": { x: 1000, y: 1000 },
      "node-target": { x: 480, y: 0 },
      "node-middle": { x: 240, y: 0 },
    });
    const outcome = builder.graph.lastAutoArrangement();
    if (outcome.outcome !== "arranged") {
      throw new Error(`expected an arrangement, got ${outcome.outcome}`);
    }
    expect(outcome.nodes.map((node: NodeInstanceView) => node.id).sort()).toEqual([
      "node-middle",
      "node-target",
    ]);

    // One undo steps the arrangement back, not the insertion: it is a unit of
    // its own, applied after the mutation.
    expect(builder.graph.undo()).toBe(true);
    expect(positionsOf(builder)).toEqual({
      "node-source": { x: 0, y: 500 },
      "node-sibling": { x: 1000, y: 1000 },
      "node-target": { x: 900, y: 900 },
      "node-middle": { x: 240, y: 500 },
    });

    // A second undo is the insertion itself.
    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodeCount()).toBe(3);
    expect(builder.graph.nodes().map((node) => node.id)).not.toContain("node-middle");
  });

  it("leaves every other node where it was when the policy is never", () => {
    const builder = create({ mode: "auto" });
    const edgeId = fork(builder);

    inserted(builder, edgeId, { nodeId: "node-middle" });

    expect(positionsOf(builder)).toEqual({
      "node-source": { x: 0, y: 500 },
      "node-sibling": { x: 1000, y: 1000 },
      "node-target": { x: 900, y: 900 },
      "node-middle": { x: 240, y: 500 },
    });
    expect(builder.graph.lastAutoArrangement()).toEqual({ outcome: "skipped" });

    // One undo removes the insertion: there is no second unit to step through.
    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodeCount()).toBe(3);
  });

  it("arranges nothing when an unconnected node is added", () => {
    const builder = create({ mode: "auto", arrangeOnChange: "downstream" });
    const source = added(builder, SOURCE, { nodeId: "node-source" });
    const target = added(builder, TARGET, { nodeId: "node-target" });

    expect(positionsOf(builder)).toEqual({
      "node-source": { x: 0, y: 0 },
      "node-target": { x: 240, y: 0 },
    });
    expect(builder.graph.lastAutoArrangement()).toEqual({ outcome: "skipped" });

    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodeCount()).toBe(1);
    expect(target.id).toBe("node-target");
    expect(source.id).toBe("node-source");
  });

  it("arranges a connected target and its descendants as their own history unit", () => {
    const builder = create({ mode: "auto", arrangeOnChange: "downstream" });
    const first = added(builder, SOURCE, { nodeId: "node-first", position: { x: 0, y: 0 } });
    const second = added(builder, MIDDLE, {
      nodeId: "node-second",
      position: { x: 700, y: 800 },
    });
    const third = added(builder, TARGET, {
      nodeId: "node-third",
      position: { x: 710, y: 810 },
    });

    connectOrThrow(builder, first.id, second.id);
    expect(positionsOf(builder)).toEqual({
      "node-first": { x: 0, y: 0 },
      "node-second": { x: 240, y: 0 },
      "node-third": { x: 710, y: 810 },
    });

    connectOrThrow(builder, second.id, third.id);
    expect(positionsOf(builder)["node-third"]).toEqual({ x: 480, y: 0 });

    const outcome = builder.graph.lastAutoArrangement();
    if (outcome.outcome !== "arranged") {
      throw new Error(`expected an arrangement, got ${outcome.outcome}`);
    }
    expect(outcome.nodes.map((node: NodeInstanceView) => node.id)).toEqual(["node-third"]);

    // One undo steps the placement back and leaves the edge where it is.
    expect(builder.graph.undo()).toBe(true);
    expect(positionsOf(builder)["node-third"]).toEqual({ x: 710, y: 810 });
    expect(builder.graph.edgeCount()).toBe(2);
  });

  it("arranges nothing when the host owns the positions", () => {
    const builder = create({ mode: "free", arrangeOnChange: "downstream" });
    const source = added(builder, SOURCE, {
      nodeId: "node-source",
      position: { x: 0, y: 0 },
    });
    const target = added(builder, TARGET, {
      nodeId: "node-target",
      position: { x: 900, y: 900 },
    });
    const edgeId = connectOrThrow(builder, source.id, target.id);

    inserted(builder, edgeId, { nodeId: "node-middle" });

    expect(positionsOf(builder)).toEqual({
      "node-source": { x: 0, y: 0 },
      "node-target": { x: 900, y: 900 },
      "node-middle": undefined,
    });
    expect(builder.graph.lastAutoArrangement()).toEqual({ outcome: "skipped" });
  });

  it("reports a refused arrangement without failing the insertion", () => {
    const builder = create({ mode: "auto" });
    const edgeId = fork(builder);
    const diagnostic: GraphLayoutDiagnostic = {
      code: "graph-layout.invalid-options",
      message: "acme refuses to arrange this graph",
    };
    builder.graphLayout.register(refusingStrategy(diagnostic));
    builder.graphLayout.setDefault("acme.refusing");
    expect(builder.graphLayout.setArrangeOnChange("downstream").ok).toBe(true);

    inserted(builder, edgeId, { nodeId: "node-middle" });

    expect(builder.graph.nodeCount()).toBe(4);
    expect(positionsOf(builder)).toEqual({
      "node-source": { x: 0, y: 500 },
      "node-sibling": { x: 1000, y: 1000 },
      "node-target": { x: 900, y: 900 },
      "node-middle": { x: 240, y: 500 },
    });
    const outcome = builder.graph.lastAutoArrangement();
    if (outcome.outcome !== "refused") {
      throw new Error(`expected a refusal, got ${outcome.outcome}`);
    }
    expect(outcome.issues[0]?.code).toBe("sdk.invalid-input");
    expect(outcome.issues[0]?.message).toBe(diagnostic.message);
    expect(outcome.issues[0]?.metadata?.["strategyCode"]).toBe(diagnostic.code);

    // The refusal pushed no unit: one undo removes the insertion.
    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodes().map((node) => node.id)).not.toContain("node-middle");
  });
});
