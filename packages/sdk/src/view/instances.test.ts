import { describe, expect, it } from "vitest";

import type { NodeDefinitionInput } from "../authoring/nodes.js";
import type { EdgeDefinitionInput } from "../authoring/edges.js";
import { createBuilder, type Builder } from "../builder/builder.js";
import { toEdgeInstanceView, toNodeInstanceView } from "./instances.js";

/**
 * The instance half of the §9 vocabulary.
 *
 * A node instance view renames `definitionId` to `type` and may omit the
 * position; an edge instance view is flat, because nested endpoints are a
 * property of the serialized document, not of what a host reads from the SDK.
 */

const REQUEST = "http.request";
const RESPONSE = "http.response";
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

function create(): Builder {
  const result = createBuilder({
    registry: { nodes: [nodeInput(REQUEST), nodeInput(RESPONSE)], edges: [edgeInput()] },
  });
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

function addedNodeId(builder: Builder, type: string): string {
  const added = builder.graph.addNode({ type });
  if (!added.ok) {
    throw new Error(
      `unexpected addNode failure: ${added.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return added.value.id;
}

describe("toNodeInstanceView", () => {
  it("renames definitionId to type and keeps the instance fields", () => {
    const builder = create();
    const added = builder.graph.addNode({
      type: REQUEST,
      nodeId: "node-request",
      properties: { url: "https://example.test" },
      position: { x: 10, y: 20 },
    });

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value).toMatchObject({
      id: "node-request",
      type: REQUEST,
      position: { x: 10, y: 20 },
      properties: { url: "https://example.test" },
    });
    expect("definitionId" in added.value).toBe(false);
    // A node the builder creates carries no definition version, and the view
    // reports that instead of inventing one.
    expect("version" in added.value).toBe(false);
  });

  it("carries the definition version when the instance pins one", () => {
    const builder = create();
    const imported = builder.document.import({
      format: "ggd",
      version: "1.0.0",
      metadata: { id: "graph-versioned" },
      extensions: [],
      graph: {
        nodes: [
          {
            id: "n1",
            type: REQUEST,
            version: "1.0.0",
            ports: [{ id: "out", direction: "output" }],
          },
        ],
        edges: [],
      },
    });

    expect(imported.ok).toBe(true);

    const [view] = builder.graph.nodes();
    expect(view?.version).toBe("1.0.0");
    expect(view?.type).toBe(REQUEST);
  });

  it("omits the position key when the node has not been placed", () => {
    const builder = create();
    const added = builder.graph.addNode({ type: REQUEST, nodeId: "unplaced" });

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect("position" in added.value).toBe(false);
    expect(Object.values(added.value).every((value) => value !== undefined)).toBe(true);
  });

  it("maps a node the editor holds, including its metadata", () => {
    const builder = create();
    const nodeId = addedNodeId(builder, REQUEST);
    const node = builder.editor.getNode(nodeId);
    if (node === undefined) {
      throw new Error("the editor must expose the node it just created");
    }
    node.setMetadata({ vendor: "acme" });

    expect(toNodeInstanceView(node)).toMatchObject({
      id: nodeId,
      type: REQUEST,
      properties: {},
      metadata: { vendor: "acme" },
    });
  });

  it("has no undefined optional keys and no core keys", () => {
    const builder = create();
    const added = builder.graph.addNode({ type: REQUEST });

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    for (const value of Object.values(added.value)) {
      expect(value).not.toBeUndefined();
    }
    expect(Object.keys(added.value)).not.toContain("definitionId");
    expect(Object.keys(added.value)).not.toContain("getProperties");
  });
});

describe("toEdgeInstanceView", () => {
  function connected(builder: Builder, label?: string): ReturnType<typeof toEdgeInstanceView> {
    const source = addedNodeId(builder, REQUEST);
    const target = addedNodeId(builder, RESPONSE);
    const edge = builder.graph.connect({
      source,
      target,
      sourcePort: "out",
      targetPort: "in",
      type: FLOW,
      ...(label === undefined ? {} : { label }),
    });
    if (!edge.ok) {
      throw new Error(
        `unexpected connect failure: ${edge.error.map((issue) => issue.code).join(", ")}`,
      );
    }
    return edge.value;
  }

  it("is flat: endpoints become source, target and their port ids", () => {
    const builder = create();
    const source = addedNodeId(builder, REQUEST);
    const target = addedNodeId(builder, RESPONSE);
    const edge = builder.graph.connect({
      source,
      target,
      sourcePort: "out",
      targetPort: "in",
      type: FLOW,
      label: "request to response",
    });

    expect(edge.ok).toBe(true);
    if (!edge.ok) return;
    expect(edge.value).toMatchObject({
      type: FLOW,
      source,
      sourcePort: "out",
      target,
      targetPort: "in",
      label: "request to response",
    });
    expect(typeof edge.value.source).toBe("string");
    expect(typeof edge.value.target).toBe("string");
    expect("connection" in edge.value).toBe(false);
    expect("definitionId" in edge.value).toBe(false);
  });

  it("never exposes the nested endpoints of the domain connection", () => {
    const builder = create();
    const view = connected(builder);

    for (const value of Object.values(view)) {
      expect(typeof value === "object" && value !== null).toBe(false);
    }
    expect(Object.keys(view)).not.toContain("sourcePortId");
  });

  it("omits absent optional keys instead of setting them to undefined", () => {
    const builder = create();
    const source = addedNodeId(builder, REQUEST);
    const target = addedNodeId(builder, RESPONSE);
    const edge = builder.graph.connect({ source, target });

    expect(edge.ok).toBe(true);
    if (!edge.ok) return;
    expect(Object.values(edge.value).every((value) => value !== undefined)).toBe(true);
    expect(Object.keys(edge.value)).toEqual(["id", "source", "sourcePort", "target", "targetPort"]);
  });

  it("maps an edge the editor holds, including its metadata", () => {
    const builder = create();
    connected(builder);
    const stored = builder.editor.graph.getEdges()[0];
    if (stored === undefined) {
      throw new Error("the editor must expose the edge it just created");
    }
    stored.setMetadata({ vendor: "acme" });

    const view = toEdgeInstanceView(stored);

    expect(view.metadata).toEqual({ vendor: "acme" });
    expect(view.source).toBe(stored.connection.source.nodeId);
    expect(view.sourcePort).toBe(stored.connection.source.portId);
    expect(view.target).toBe(stored.connection.target.nodeId);
    expect(view.targetPort).toBe(stored.connection.target.portId);
  });
});
