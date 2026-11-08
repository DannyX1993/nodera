/**
 * `insertNodeOnEdge`: one node plus two edges replacing an existing edge.
 *
 * Every assertion goes through the public surface the application layer owns:
 * the use case result, the graph the editor exposes, the history unit count and
 * labels, the event bus and `undo`/`redo`. Nothing reads a private store.
 *
 * The rules pinned here are the ones the use case exists for: the endpoints and
 * ports of the original edge survive on the two new edges, the whole change is
 * **one** reversible unit, and a refusal writes nothing, pushes nothing and
 * emits nothing (AGENTS.md §12, §13).
 */

import { describe, expect, it } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import type { PortDirection } from "@nodera/graph-model";
import { EditorEngine } from "../editor-engine.js";
import { createEdge } from "./edges.js";
import { undo, redo } from "./history.js";
import { insertNodeOnEdge } from "./insert-node-on-edge.js";
import { addNode } from "./nodes.js";

/** Definition with exactly the given port directions, ids `in` / `out`. */
function makeDefinition(
  id: string,
  directions: readonly PortDirection[],
): NodeDefinition {
  return {
    id,
    name: id,
    version: "1.0.0",
    ports: directions.map((direction) => ({
      id: direction === "input" ? "in" : "out",
      name: direction,
      direction,
    })),
    properties: [],
  } as unknown as NodeDefinition;
}

/**
 * Graph `a --e1--> b` where `a` only emits, `b` only receives and
 * `example.node` (an input and an output) is the definition the insertion uses.
 */
function makeEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "graph-1" });
  editor.domain.nodes.register(makeDefinition("example.node", ["input", "output"]));
  editor.domain.nodes.register(makeDefinition("example.source", ["output"]));
  editor.domain.nodes.register(makeDefinition("example.sink", ["input"]));
  seedNode(editor, "a", "example.source");
  seedNode(editor, "b", "example.sink");
  const edge = createEdge(editor, {
    edgeId: "e1",
    source: { nodeId: "a", portId: "out" },
    target: { nodeId: "b", portId: "in" },
    label: "original",
  });
  if (!edge.ok) {
    throw new Error(`seed failed: ${edge.error.message}`);
  }
  return editor;
}

function seedNode(editor: EditorEngine, nodeId: string, definitionId: string): void {
  const result = addNode(editor, { definitionId, nodeId });
  if (!result.ok) {
    throw new Error(`seed failed: ${result.error.message}`);
  }
}

/** Every event name the insertion may touch, as an ordered log. */
function eventLog(editor: EditorEngine): string[] {
  const names: string[] = [];
  for (const name of [
    "node.created",
    "node.deleted",
    "edge.created",
    "edge.deleted",
    "graph.changed",
  ] as const) {
    editor.events.subscribe(name, () => names.push(name));
  }
  return names;
}

describe("insertNodeOnEdge use case", () => {
  it("replaces the edge with a node between its endpoints, keeping their ports", () => {
    const editor = makeEditor();

    const result = insertNodeOnEdge(editor, {
      edgeId: "e1",
      definitionId: "example.node",
      nodeId: "middle",
      properties: { url: "https://example.test" },
      position: { x: 240, y: 0 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.node.id).toBe("middle");
    expect(result.value.node.definitionId).toBe("example.node");
    expect(result.value.node.getProperties()).toEqual({ url: "https://example.test" });
    expect(result.value.node.position).toEqual({ x: 240, y: 0 });

    // The original relation survives as two halves through the new node.
    expect(editor.getEdge("e1")).toBeUndefined();
    expect(editor.graph.edgeCount).toBe(2);
    expect(editor.graph.nodeCount).toBe(3);
    const [toMiddle, fromMiddle] = result.value.edges;
    expect(toMiddle.connection.source.nodeId).toBe("a");
    expect(toMiddle.connection.source.portId).toBe("out");
    expect(toMiddle.connection.target.nodeId).toBe("middle");
    expect(toMiddle.connection.target.portId).toBe("in");
    expect(fromMiddle.connection.source.nodeId).toBe("middle");
    expect(fromMiddle.connection.source.portId).toBe("out");
    expect(fromMiddle.connection.target.nodeId).toBe("b");
    expect(fromMiddle.connection.target.portId).toBe("in");
    expect(editor.getEdge(toMiddle.id)).toBeDefined();
    expect(editor.getEdge(fromMiddle.id)).toBeDefined();
  });

  it("is one history unit: a single undo restores the original edge", () => {
    const editor = makeEditor();
    const seeded = editor.history.size();
    const inserted = insertNodeOnEdge(editor, {
      edgeId: "e1",
      definitionId: "example.node",
      nodeId: "middle",
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    expect(editor.history.size()).toBe(seeded + 1);
    expect(editor.history.labels().at(-1)).toBe("insert-node-on-edge");

    expect(undo(editor)).toBe(true);

    // The original edge is back, byte for byte: same id, endpoints and label.
    const restored = editor.getEdge("e1");
    expect(restored?.id).toBe("e1");
    expect(restored?.connection.source.nodeId).toBe("a");
    expect(restored?.connection.source.portId).toBe("out");
    expect(restored?.connection.target.nodeId).toBe("b");
    expect(restored?.connection.target.portId).toBe("in");
    expect(restored?.label).toBe("original");
    expect(editor.graph.edgeCount).toBe(1);
    // No trace of the insertion: neither the node nor the two new edges.
    expect(editor.getNode("middle")).toBeUndefined();
    expect(editor.getEdge(inserted.value.edges[0].id)).toBeUndefined();
    expect(editor.getEdge(inserted.value.edges[1].id)).toBeUndefined();
    expect(editor.graph.nodeCount).toBe(2);

    expect(redo(editor)).toBe(true);
    expect(editor.getNode("middle")).toBeDefined();
    expect(editor.getEdge("e1")).toBeUndefined();
    expect(editor.graph.edgeCount).toBe(2);
  });

  it("emits node.created, one edge.created per new edge, edge.deleted and one graph.changed", () => {
    const editor = makeEditor();
    const names = eventLog(editor);

    insertNodeOnEdge(editor, {
      edgeId: "e1",
      definitionId: "example.node",
      nodeId: "middle",
    });

    expect(names).toEqual([
      "node.created",
      "edge.created",
      "edge.created",
      "edge.deleted",
      "graph.changed",
    ]);
    expect(editor.history.size()).toBe(4);
  });

  it("refuses an unknown edge, an unknown definition and a taken instance id without side effects", () => {
    const editor = makeEditor();
    const names = eventLog(editor);

    const unknownEdge = insertNodeOnEdge(editor, {
      edgeId: "ghost",
      definitionId: "example.node",
      nodeId: "middle",
    });
    const unknownDefinition = insertNodeOnEdge(editor, {
      edgeId: "e1",
      definitionId: "missing.node",
      nodeId: "middle",
    });
    const duplicateId = insertNodeOnEdge(editor, {
      edgeId: "e1",
      definitionId: "example.node",
      nodeId: "a",
    });

    expect(unknownEdge.ok ? undefined : unknownEdge.error.kind).toBe("edge-not-found");
    expect(unknownDefinition.ok ? undefined : unknownDefinition.error.kind).toBe(
      "node-definition-not-found",
    );
    expect(duplicateId.ok ? undefined : duplicateId.error.kind).toBe("duplicate-node-id");

    // Nothing written, nothing pushed, nothing emitted.
    expect(editor.graph.nodeCount).toBe(2);
    expect(editor.graph.edgeCount).toBe(1);
    expect(editor.getNode("middle")).toBeUndefined();
    expect(editor.getEdge("e1")).toBeDefined();
    expect(editor.history.size()).toBe(3);
    expect(names).toEqual([]);
  });

  it("refuses a definition without the ports the two halves need", () => {
    const editor = makeEditor();
    const names = eventLog(editor);

    // `example.source` has no input port to receive the edge's source side.
    const noInput = insertNodeOnEdge(editor, {
      edgeId: "e1",
      definitionId: "example.source",
      nodeId: "middle",
    });
    // `example.sink` has no output port to reach the edge's target side.
    const noOutput = insertNodeOnEdge(editor, {
      edgeId: "e1",
      definitionId: "example.sink",
      nodeId: "middle",
    });

    expect(noInput.ok ? undefined : noInput.error.kind).toBe("invalid-input");
    expect(noInput.ok ? undefined : noInput.error.message).toContain("example.source");
    expect(noOutput.ok ? undefined : noOutput.error.kind).toBe("invalid-input");
    expect(noOutput.ok ? undefined : noOutput.error.message).toContain("example.sink");

    expect(editor.graph.nodeCount).toBe(2);
    expect(editor.graph.edgeCount).toBe(1);
    expect(editor.history.size()).toBe(3);
    expect(names).toEqual([]);
  });
});
