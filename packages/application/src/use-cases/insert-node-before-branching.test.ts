/**
 * `insertNodeBeforeBranching`: one node inserted between a parent and **all** of
 * its successors.
 *
 * Every assertion goes through the public surface the application layer owns:
 * the use case result, the graph the editor exposes, the history unit count and
 * labels, the event bus and `undo`/`redo`. Nothing reads a private store.
 *
 * The rules pinned here are the ones the use case exists for (odd S23): the
 * parent points at one new node and every former successor edge leaves from it,
 * the ports of the replaced edges are carried over, the whole change is **one**
 * reversible unit, and a refusal writes nothing, pushes nothing and emits
 * nothing (AGENTS.md §12, §13).
 */

import { describe, expect, it } from "vitest";
import { createNodeId } from "@nodera/contracts";
import type { NodeDefinition } from "@nodera/node-registry";
import type { PortDirection } from "@nodera/graph-model";
import { EditorEngine } from "../editor-engine.js";
import { createEdge } from "./edges.js";
import { redo, undo } from "./history.js";
import { insertNodeBeforeBranching } from "./insert-node-before-branching.js";
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

function seedNode(editor: EditorEngine, nodeId: string, definitionId: string): void {
  const result = addNode(editor, { definitionId, nodeId });
  if (!result.ok) {
    throw new Error(`seed failed: ${result.error.message}`);
  }
}

function seedEdge(
  editor: EditorEngine,
  edgeId: string,
  from: string,
  to: string,
  definitionId = "example.flow",
): void {
  const created = createEdge(editor, {
    edgeId,
    source: { nodeId: from, portId: "out" },
    target: { nodeId: to, portId: "in" },
    definitionId,
    label: `${from}->${to}`,
  });
  if (!created.ok) {
    throw new Error(`seed failed: ${created.error.message}`);
  }
}

/**
 * Graph `z --> a --> { b1, b2 }`: the branching parent is `a`, its incoming edge
 * is `e0` and its two successor edges are `e1` and `e2`.
 */
function makeEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "graph-1" });
  editor.domain.nodes.register(makeDefinition("example.node", ["input", "output"]));
  editor.domain.nodes.register(makeDefinition("example.source", ["output"]));
  editor.domain.nodes.register(makeDefinition("example.sink", ["input"]));
  seedNode(editor, "z", "example.source");
  seedNode(editor, "a", "example.node");
  seedNode(editor, "b1", "example.sink");
  seedNode(editor, "b2", "example.sink");
  seedEdge(editor, "e0", "z", "a");
  seedEdge(editor, "e1", "a", "b1");
  seedEdge(editor, "e2", "a", "b2");
  return editor;
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

/** Successor edges of a node, in graph order. */
function successorsOf(editor: EditorEngine, nodeId: string): readonly string[] {
  return editor.graph
    .getEdgesOf(createNodeId(nodeId))
    .filter((edge) => edge.connection.source.nodeId === nodeId)
    .map((edge) => String(edge.id));
}

describe("insertNodeBeforeBranching use case", () => {
  it("points the parent at one node and re-points every successor edge to leave from it", () => {
    const editor = makeEditor();

    const result = insertNodeBeforeBranching(editor, {
      nodeId: "a",
      definitionId: "example.node",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.node.id).toBeDefined();

    // The parent now reaches the inserted node and nothing else…
    expect(successorsOf(editor, "a").length).toBe(1);
    expect(successorsOf(editor, "a")).toEqual([String(result.value.edge.id)]);
    expect(result.value.edge.connection.source.nodeId).toBe("a");
    expect(result.value.edge.connection.source.portId).toBe("out");
    expect(result.value.edge.connection.target.nodeId).toBe(result.value.node.id);
    expect(result.value.edge.connection.target.portId).toBe("in");

    // …and every former successor edge leaves from it, ports carried over.
    expect(result.value.edges.map((edge) => edge.connection.target.nodeId)).toEqual([
      "b1",
      "b2",
    ]);
    for (const edge of result.value.edges) {
      expect(edge.connection.source.nodeId).toBe(result.value.node.id);
      expect(edge.connection.source.portId).toBe("out");
      expect(edge.connection.target.portId).toBe("in");
      expect(edge.definitionId).toBe("example.flow");
    }
    for (const replaced of result.value.replacedEdges) {
      expect(editor.getEdge(replaced.id)).toBeUndefined();
    }
    // The incoming relation is untouched: only the parent's outgoing side moved.
    expect(editor.getEdge("e0")).toBeDefined();
  });

  it("is one history unit: a single undo restores the parent's original edges and removes the node", () => {
    const editor = makeEditor();
    const seeded = editor.history.size();
    const inserted = insertNodeBeforeBranching(editor, {
      nodeId: "a",
      definitionId: "example.node",
      newNodeId: "middle",
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    expect(editor.history.size()).toBe(seeded + 1);
    expect(editor.history.labels().at(-1)).toBe("insert-node-before-branching");

    expect(undo(editor)).toBe(true);

    // Both originals are back, byte for byte: same ids, endpoints and labels.
    const restored = editor.graph
      .getEdgesOf(createNodeId("a"))
      .filter((edge) => edge.connection.source.nodeId === "a")
      .map((edge) => String(edge.id));
    expect([...restored].sort()).toEqual(["e1", "e2"]);
    expect(editor.getEdge("e2")?.label).toBe("a->b2");
    expect(editor.getEdge("e2")?.definitionId).toBe("example.flow");
    // No trace of the insertion: neither the node nor the edges it carried.
    expect(editor.getNode("middle")).toBeUndefined();
    expect(editor.getEdge(inserted.value.edge.id)).toBeUndefined();
    for (const edge of inserted.value.edges) {
      expect(editor.getEdge(edge.id)).toBeUndefined();
    }
    expect(editor.graph.nodeCount).toBe(4);
    expect(editor.graph.edgeCount).toBe(3);

    expect(redo(editor)).toBe(true);
    expect(editor.getNode("middle")).toBeDefined();
    expect(editor.getEdge("e1")).toBeUndefined();
    expect(editor.getEdge("e2")).toBeUndefined();
    // e0 plus the parent's one relation plus the two re-pointed successors.
    expect(editor.graph.edgeCount).toBe(4);
  });

  it("emits node.created, one edge.created per new edge, one edge.deleted per replaced edge and one graph.changed", () => {
    const editor = makeEditor();
    const names = eventLog(editor);

    insertNodeBeforeBranching(editor, {
      nodeId: "a",
      definitionId: "example.node",
      newNodeId: "middle",
    });

    expect(names).toEqual([
      "node.created",
      "edge.created",
      "edge.created",
      "edge.created",
      "edge.deleted",
      "edge.deleted",
      "graph.changed",
    ]);
  });

  it("skips a successor pair that would duplicate an edge it already wrote", () => {
    const editor = makeEditor();
    // A second, equivalent edge to the same successor and port: the graph allows
    // it, but re-pointing it would leave two identical relations from the node.
    seedEdge(editor, "e3", "a", "b1");

    const inserted = insertNodeBeforeBranching(editor, {
      nodeId: "a",
      definitionId: "example.node",
      newNodeId: "middle",
    });

    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.value.edges.map((edge) => edge.connection.target.nodeId)).toEqual([
      "b1",
      "b2",
    ]);
    // Three successor edges replaced, two relations written: the duplicate is gone.
    expect(inserted.value.replacedEdges.map((edge) => String(edge.id)).sort()).toEqual([
      "e1",
      "e2",
      "e3",
    ]);
    expect(editor.graph.edgeCount).toBe(4);
  });

  it("leaves a parent with no successor joined to the inserted node in the same one unit", () => {
    const editor = new EditorEngine({ graphId: "graph-2" });
    editor.domain.nodes.register(makeDefinition("example.node", ["input", "output"]));
    seedNode(editor, "a", "example.node");
    const seeded = editor.history.size();

    const inserted = insertNodeBeforeBranching(editor, {
      nodeId: "a",
      definitionId: "example.node",
      newNodeId: "middle",
    });

    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.value.replacedEdges).toEqual([]);
    expect(inserted.value.edges).toEqual([]);
    expect(editor.graph.edgeCount).toBe(1);
    expect(editor.history.size()).toBe(seeded + 1);
    expect(undo(editor)).toBe(true);
    expect(editor.graph.edgeCount).toBe(0);
    expect(editor.getNode("middle")).toBeUndefined();
  });

  it("refuses an unknown parent node, an unknown definition and a taken instance id without side effects", () => {
    const editor = makeEditor();
    const seeded = editor.history.size();
    const names = eventLog(editor);

    const unknownParent = insertNodeBeforeBranching(editor, {
      nodeId: "ghost",
      definitionId: "example.node",
      newNodeId: "middle",
    });
    const unknownDefinition = insertNodeBeforeBranching(editor, {
      nodeId: "a",
      definitionId: "missing.node",
      newNodeId: "middle",
    });
    const duplicateId = insertNodeBeforeBranching(editor, {
      nodeId: "a",
      definitionId: "example.node",
      newNodeId: "b1",
    });

    expect(unknownParent.ok ? undefined : unknownParent.error.kind).toBe("node-not-found");
    expect(unknownDefinition.ok ? undefined : unknownDefinition.error.kind).toBe(
      "node-definition-not-found",
    );
    expect(duplicateId.ok ? undefined : duplicateId.error.kind).toBe("duplicate-node-id");

    // Nothing written, nothing pushed, nothing emitted.
    expect(editor.graph.nodeCount).toBe(4);
    expect(editor.graph.edgeCount).toBe(3);
    expect(editor.getNode("middle")).toBeUndefined();
    expect(editor.getEdge("e1")).toBeDefined();
    expect(editor.getEdge("e2")).toBeDefined();
    expect(editor.history.size()).toBe(seeded);
    expect(names).toEqual([]);
  });

  it("refuses a definition without the ports the insertion needs", () => {
    const editor = makeEditor();
    const seeded = editor.history.size();
    const names = eventLog(editor);

    // `example.source` has no input port to receive the parent's relation.
    const noInput = insertNodeBeforeBranching(editor, {
      nodeId: "a",
      definitionId: "example.source",
      newNodeId: "middle",
    });
    // `example.sink` has no output port to reach the successors.
    const noOutput = insertNodeBeforeBranching(editor, {
      nodeId: "a",
      definitionId: "example.sink",
      newNodeId: "middle",
    });

    expect(noInput.ok ? undefined : noInput.error.kind).toBe("invalid-input");
    expect(noInput.ok ? undefined : noInput.error.message).toContain("example.source");
    expect(noOutput.ok ? undefined : noOutput.error.kind).toBe("invalid-input");
    expect(noOutput.ok ? undefined : noOutput.error.message).toContain("example.sink");

    expect(editor.graph.nodeCount).toBe(4);
    expect(editor.graph.edgeCount).toBe(3);
    expect(editor.history.size()).toBe(seeded);
    expect(names).toEqual([]);
  });
});
