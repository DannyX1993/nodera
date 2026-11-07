import { describe, expect, it, vi } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { addNode } from "./nodes.js";
import { createEdge } from "./edges.js";
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
  return editor;
}

function seed(editor: EditorEngine): void {
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
}

describe("undo/redo use cases", () => {
  it("undo reverts the last operation; redo reapplies it", () => {
    const editor = makeEditor();
    seed(editor);

    expect(undo(editor)).toBe(true);
    expect(editor.getEdge("e1")).toBeUndefined();

    expect(redo(editor)).toBe(true);
    expect(editor.getEdge("e1")).toBeDefined();
    expect(editor.graph.edgeCount).toBe(1);
  });

  it("returns false when there is nothing to undo or redo", () => {
    const editor = makeEditor();
    expect(undo(editor)).toBe(false);
    expect(redo(editor)).toBe(false);
  });

  it("emits graph.changed with an undo/redo cause", () => {
    const editor = makeEditor();
    seed(editor);
    const causes: string[] = [];
    editor.events.subscribe("graph.changed", (event) => {
      causes.push(event.payload.cause);
    });

    undo(editor);
    redo(editor);

    expect(causes.slice(-2)).toEqual(["undo", "redo"]);
  });
});
