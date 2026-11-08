import { describe, expect, it } from "vitest";
import type { EdgeDefinitionInput } from "../authoring/edges.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";

const REQUEST = "http.request";
const RESPONSE = "http.response";
const FLOW = "http.flow";

function nodeInput(
  type: string,
  overrides: Partial<NodeDefinitionInput> = {},
): NodeDefinitionInput {
  return {
    type,
    version: "1.0.0",
    label: type,
    category: "http",
    ports: {
      inputs: [{ id: "in", dataType: "any" }],
      outputs: [{ id: "out", dataType: "any" }],
    },
    ...overrides,
  };
}

function edgeInput(overrides: Partial<EdgeDefinitionInput> = {}): EdgeDefinitionInput {
  return { type: FLOW, label: "HTTP flow", ...overrides };
}

/** Builder with two node definitions and one edge definition registered. */
function create(): Builder {
  const result = createBuilder({
    registry: {
      nodes: [nodeInput(REQUEST), nodeInput(RESPONSE)],
      edges: [edgeInput()],
    },
  });
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

function addNodeOrThrow(builder: Builder, type: string): string {
  const added = builder.graph.addNode({ type });
  if (!added.ok) {
    throw new Error(
      `unexpected addNode failure: ${added.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return String(added.value.id);
}

describe("node operations", () => {
  it("adds a node of a registered definition and reports it in the counts", () => {
    const builder = create();

    expect(builder.graph.nodeCount()).toBe(0);
    const added = builder.graph.addNode({ type: REQUEST });

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.definitionId).toBe(REQUEST);
    expect(builder.graph.nodeCount()).toBe(1);
    expect(
      builder.editor.graph.getNodes().map((node) => node.definitionId),
    ).toEqual([REQUEST]);
  });

  it("honours an explicit node id, its properties and its position", () => {
    const builder = create();

    const added = builder.graph.addNode({
      type: REQUEST,
      nodeId: "node-request",
      properties: { url: "https://example.test" },
      position: { x: 10, y: 20 },
    });

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(String(added.value.id)).toBe("node-request");
    expect(added.value.getProperties()["url"]).toBe("https://example.test");
    expect(added.value.position).toEqual({ x: 10, y: 20 });
    expect(builder.editor.getNode("node-request")).toBe(added.value);
  });

  it("rejects an unknown definition type without touching the graph", () => {
    const builder = create();

    const added = builder.graph.addNode({ type: "http.unknown" });

    expect(added.ok).toBe(false);
    if (added.ok) return;
    expect(added.error).toHaveLength(1);
    expect(added.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      severity: "error",
      metadata: { useCaseCode: "node-definition-not-found" },
    });
    expect(added.error[0]?.message).toContain("http.unknown");
    expect(builder.graph.nodeCount()).toBe(0);
    expect(builder.graph.canUndo()).toBe(false);
  });

  it("removes a node and reports its id when the use case cannot find it", () => {
    const builder = create();
    const nodeId = addNodeOrThrow(builder, REQUEST);

    const removed = builder.graph.removeNode(nodeId);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(String(removed.value.id)).toBe(nodeId);
    expect(builder.graph.nodeCount()).toBe(0);

    const missing = builder.graph.removeNode("node-missing");
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      metadata: { useCaseCode: "node-not-found", elementId: "node-missing" },
    });
  });

  it("moves a node and writes the property values the editor reports", () => {
    const builder = create();
    const nodeId = addNodeOrThrow(builder, REQUEST);

    const moved = builder.graph.moveNode(nodeId, { x: 5, y: 6 });
    expect(moved.ok).toBe(true);
    expect(builder.editor.getNode(nodeId)?.position).toEqual({ x: 5, y: 6 });

    const updated = builder.graph.updateProperties(nodeId, {
      url: "https://example.test",
      method: "GET",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(builder.editor.getNode(nodeId)?.getProperties()).toMatchObject({
      url: "https://example.test",
      method: "GET",
    });
    expect(updated.value.getProperties()["method"]).toBe("GET");
  });

  it("maps a malformed identifier to an issue instead of throwing", () => {
    const builder = create();

    const result = builder.graph.removeNode("not an id");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({ code: "sdk.invalid-input", severity: "error" });
    expect(builder.graph.nodeCount()).toBe(0);
  });
});

describe("edge operations", () => {
  it("connects two nodes, disconnects and undoes the removal", () => {
    const builder = create();
    const source = addNodeOrThrow(builder, REQUEST);
    const target = addNodeOrThrow(builder, RESPONSE);

    expect(builder.graph.edgeCount()).toBe(0);
    const connected = builder.graph.connect({
      source,
      target,
      sourcePort: "out",
      targetPort: "in",
      type: FLOW,
      label: "request to response",
    });

    expect(connected.ok).toBe(true);
    if (!connected.ok) return;
    const edgeId = String(connected.value.id);
    expect(connected.value.definitionId).toBe(FLOW);
    expect(connected.value.label).toBe("request to response");
    expect(builder.graph.edgeCount()).toBe(1);

    const removed = builder.graph.disconnect(edgeId);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(String(removed.value.id)).toBe(edgeId);
    expect(builder.graph.edgeCount()).toBe(0);
    expect(builder.graph.canUndo()).toBe(true);

    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.edgeCount()).toBe(1);
    expect(builder.graph.canRedo()).toBe(true);

    expect(builder.graph.redo()).toBe(true);
    expect(builder.graph.edgeCount()).toBe(0);
  });

  it("defaults an omitted port to the node's first port of the matching direction", () => {
    const builder = create();
    const source = addNodeOrThrow(builder, REQUEST);
    const target = addNodeOrThrow(builder, RESPONSE);

    const connected = builder.graph.connect({ source, target });

    expect(connected.ok).toBe(true);
    if (!connected.ok) return;
    expect(connected.value.connection.source.portId).toBe("out");
    expect(connected.value.connection.target.portId).toBe("in");
  });

  it("rejects a connection the graph rules refuse without mutating the graph", () => {
    const builder = create();
    const source = addNodeOrThrow(builder, REQUEST);

    const connected = builder.graph.connect({
      source,
      target: "node-missing",
      sourcePort: "out",
      targetPort: "in",
    });

    expect(connected.ok).toBe(false);
    if (connected.ok) return;
    expect(connected.error[0]?.code).toBe("sdk.invalid-input");
    expect(builder.graph.edgeCount()).toBe(0);
  });
});

describe("selection", () => {
  it("selects a node, reports it and clears the whole selection", () => {
    const builder = create();
    const nodeId = addNodeOrThrow(builder, REQUEST);

    const selected = builder.graph.select({ nodes: [nodeId] });

    expect(selected.ok).toBe(true);
    expect(builder.graph.selectedNodes()).toEqual([nodeId]);
    expect(builder.graph.selectedEdges()).toEqual([]);

    expect(builder.graph.clearSelection().ok).toBe(true);
    expect(builder.graph.selectedNodes()).toEqual([]);
    expect(builder.graph.selectedEdges()).toEqual([]);
  });

  it("selects an edge as well as nodes", () => {
    const builder = create();
    const source = addNodeOrThrow(builder, REQUEST);
    const target = addNodeOrThrow(builder, RESPONSE);
    const connected = builder.graph.connect({ source, target });
    if (!connected.ok) {
      throw new Error("unexpected connect failure");
    }
    const edgeId = String(connected.value.id);

    const selected = builder.graph.select({ nodes: [source], edges: [edgeId] });

    expect(selected.ok).toBe(true);
    expect(builder.graph.selectedNodes()).toEqual([source]);
    expect(builder.graph.selectedEdges()).toEqual([edgeId]);
  });
});

describe("history", () => {
  it("returns the engine booleans without wrapping them in a result", () => {
    const builder = create();

    expect(builder.graph.canUndo()).toBe(false);
    expect(builder.graph.canRedo()).toBe(false);
    expect(builder.graph.undo()).toBe(false);
    expect(builder.graph.redo()).toBe(false);

    addNodeOrThrow(builder, REQUEST);
    expect(builder.graph.canUndo()).toBe(true);

    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodeCount()).toBe(0);
    expect(builder.graph.canRedo()).toBe(true);
    expect(builder.graph.redo()).toBe(true);
    expect(builder.graph.nodeCount()).toBe(1);
  });
});

describe("validation", () => {
  it("validates a consistent graph through the domain pipeline", () => {
    const builder = create();
    addNodeOrThrow(builder, REQUEST);

    const report = builder.graph.validate();

    expect(report.isValid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("reports a node whose definition is no longer registered", () => {
    const builder = create();
    const nodeId = addNodeOrThrow(builder, REQUEST);

    const unregistered = builder.registries.nodes.unregister(REQUEST);
    expect(unregistered.ok).toBe(true);

    const report = builder.graph.validate();

    expect(report.isValid).toBe(false);
    expect(report.structurallyValid).toBe(false);
    const unknown = report.issues.find(
      (issue) => issue.code === "structural.unknown-node-definition",
    );
    expect(unknown).toBeDefined();
    expect(String(unknown?.elementId)).toBe(nodeId);
    expect(unknown?.metadata).toEqual({ definitionId: REQUEST });
  });

  it("filters the pipeline by the requested levels", () => {
    const builder = create();
    addNodeOrThrow(builder, REQUEST);

    const report = builder.graph.validate({ levels: ["structural"] });

    expect(report.structurallyValid).toBe(true);
    expect(report.issues).toEqual([]);
  });
});
