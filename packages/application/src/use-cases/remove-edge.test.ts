import { describe, expect, it } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { addNode } from "./nodes.js";
import { createEdge, removeEdge } from "./edges.js";
import { undo, redo } from "./history.js";

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
  for (const id of ["a", "b"]) {
    const result = addNode(editor, { definitionId: "example.node", nodeId: id });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }
  const edge = createEdge(editor, {
    edgeId: "e1",
    source: { nodeId: "a", portId: "out" },
    target: { nodeId: "b", portId: "in" },
  });
  if (!edge.ok) {
    throw new Error(edge.error.message);
  }
  return editor;
}

describe("removeEdge use case (audit)", () => {
  it("actually removes the edge from the graph", () => {
    const editor = makeEditor();

    const result = removeEdge(editor, { edgeId: "e1" });

    expect(result.ok).toBe(true);
    expect(editor.getEdge("e1")).toBeUndefined();
    expect(editor.graph.edgeCount).toBe(0);
  });

  it("undo restores the removed edge; redo removes it again", () => {
    const editor = makeEditor();
    removeEdge(editor, { edgeId: "e1" });

    expect(undo(editor)).toBe(true);
    expect(editor.getEdge("e1")).toBeDefined();

    expect(redo(editor)).toBe(true);
    expect(editor.getEdge("e1")).toBeUndefined();
  });

  it("fails for an unknown edge without emitting", () => {
    const editor = makeEditor();
    const result = removeEdge(editor, { edgeId: "ghost" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("edge-not-found");
    }
  });
});
