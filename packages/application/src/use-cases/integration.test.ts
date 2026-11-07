import { describe, expect, it } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { addNode, removeNode } from "./nodes.js";
import { createEdge } from "./edges.js";
import { undo, redo } from "./history.js";
import { importDocument, exportDocument } from "./documents.js";

function makeDefinition(id: string): NodeDefinition {
  return {
    id,
    name: id,
    version: "1.0.0",
    ports: [
      { id: "in", name: "in", direction: "input" },
      { id: "out", name: "out", direction: "output" },
    ],
    properties: [],
  } as unknown as NodeDefinition;
}

function makeEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "graph-1" });
  editor.domain.nodes.register(makeDefinition("example.node"));
  return editor;
}

function seed(editor: EditorEngine): void {
  for (const [id, x] of [
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ] as const) {
    const result = addNode(editor, {
      definitionId: "example.node",
      nodeId: id,
      position: { x, y: 0 },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }
  for (const [id, from, to] of [
    ["e1", "a", "b"],
    ["e2", "b", "c"],
  ] as const) {
    const edge = createEdge(editor, {
      edgeId: id,
      source: { nodeId: from, portId: "out" },
      target: { nodeId: to, portId: "in" },
    });
    if (!edge.ok) {
      throw new Error(edge.error.message);
    }
  }
}

describe("end-to-end editing flows", () => {
  it("delete node then undo restores the node AND its connections", () => {
    const editor = makeEditor();
    seed(editor);

    const removed = removeNode(editor, { nodeId: "b" });
    expect(removed.ok).toBe(true);
    expect(editor.graph.nodeCount).toBe(2);
    expect(editor.graph.edgeCount).toBe(0);

    expect(undo(editor)).toBe(true);

    expect(editor.getNode("b")).toBeDefined();
    expect(editor.getEdge("e1")).toBeDefined();
    expect(editor.getEdge("e2")).toBeDefined();
    expect(editor.graph.edgeCount).toBe(2);

    expect(redo(editor)).toBe(true);
    expect(editor.getNode("b")).toBeUndefined();
    expect(editor.graph.edgeCount).toBe(0);
  });

  it("a whole editing session round-trips through a portable document", () => {
    const editor = makeEditor();
    seed(editor);
    editor.graph.setMetadata({ name: "Session", description: "e2e" });

    const exported = exportDocument(editor, { format: "json" });
    expect(exported.ok).toBe(true);
    if (!exported.ok) {
      throw new Error("export failed");
    }

    const other = new EditorEngine({ graphId: "graph-fresh" });
    other.domain.nodes.register(makeDefinition("example.node"));
    const imported = importDocument(other, {
      raw: exported.value as string,
      format: "json",
    });
    expect(imported.ok).toBe(true);
    expect(other.graph.id).toBe("graph-1");
    expect(other.graph.nodeCount).toBe(3);
    expect(other.graph.edgeCount).toBe(2);
    expect(other.graph.metadata).toEqual({ name: "Session", description: "e2e" });
    expect(other.getNode("a")?.position).toBeDefined();
  });

  it("one logical operation emits its documented events exactly once", () => {
    const editor = makeEditor();
    seed(editor);
    const counts = new Map<string, number>();
    for (const name of [
      "node.created",
      "node.deleted",
      "edge.created",
      "edge.deleted",
      "property.changed",
      "graph.changed",
    ] as const) {
      editor.events.subscribe(name, () => {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      });
    }

    addNode(editor, { definitionId: "example.node", nodeId: "d" });
    expect(counts.get("node.created")).toBe(1);
    expect(counts.get("graph.changed")).toBe(1);

    removeNode(editor, { nodeId: "a" });
    expect(counts.get("node.deleted")).toBe(1);
    // Attached edges are removed with the node as part of the same operation:
    // the use case documents them under node.deleted, not as separate deletes.
    expect(counts.get("edge.deleted")).toBeUndefined();
    expect(counts.get("graph.changed")).toBe(2);
  });

  it("event delivery survives handler failures", () => {
    const editor = makeEditor();
    const seen: string[] = [];
    editor.events.subscribe("graph.changed", () => {
      throw new Error("host handler bug");
    });
    editor.events.subscribe("graph.changed", () => {
      seen.push("changed");
    });

    const result = addNode(editor, { definitionId: "example.node", nodeId: "z" });

    expect(result.ok).toBe(true);
    expect(seen).toEqual(["changed"]);
  });

  it("graph.created/loadGraph boundaries: history resets on target change", () => {
    const editor = makeEditor();
    seed(editor);
    expect(editor.canUndo()).toBe(true);

    const result = importDocument(editor, {
      raw: JSON.stringify({
        format: "ggd",
        version: "1.0.0",
        metadata: { id: "graph-2", name: "Other", description: "" },
        extensions: [],
        graph: { nodes: [], edges: [], groups: [] },
      }),
      format: "json",
    });
    expect(result.ok).toBe(true);
    expect(editor.graph.id).toBe("graph-2");
    expect(editor.canUndo()).toBe(false);
  });
});
