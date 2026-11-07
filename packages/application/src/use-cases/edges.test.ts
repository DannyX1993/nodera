import { describe, expect, it, vi } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { addNode } from "./nodes.js";
import { createEdge, reconnectEdge, updateEdge } from "./edges.js";
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
  for (const id of ["a", "b", "c"]) {
    const result = addNode(editor, { definitionId: "example.node", nodeId: id });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }
  const edge = createEdge(editor, {
    edgeId: "e1",
    source: { nodeId: "a", portId: "out" },
    target: { nodeId: "b", portId: "in" },
    label: "original",
  });
  if (!edge.ok) {
    throw new Error(edge.error.message);
  }
  return editor;
}

describe("updateEdge use case (audit)", () => {
  it("replaces the label and is reversible", () => {
    const editor = makeEditor();

    const result = updateEdge(editor, { edgeId: "e1", label: "changed" });

    expect(result.ok).toBe(true);
    expect(editor.getEdge("e1")?.label).toBe("changed");

    expect(undo(editor)).toBe(true);
    expect(editor.getEdge("e1")?.label).toBe("original");

    expect(redo(editor)).toBe(true);
    expect(editor.getEdge("e1")?.label).toBe("changed");
  });

  it("emits edge.updated and one graph.changed", () => {
    const editor = makeEditor();
    const names: string[] = [];
    editor.events.subscribe("edge.updated", () => names.push("edge.updated"));
    editor.events.subscribe("graph.changed", () => names.push("graph.changed"));

    updateEdge(editor, { edgeId: "e1", label: "x" });

    expect(names).toEqual(["edge.updated", "graph.changed"]);
  });

  it("fails for an unknown edge", () => {
    const editor = makeEditor();
    const result = updateEdge(editor, { edgeId: "ghost", label: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("edge-not-found");
    }
  });
});

describe("reconnectEdge use case (audit)", () => {
  it("moves the target endpoint to another node port", () => {
    const editor = makeEditor();

    const result = reconnectEdge(editor, {
      edgeId: "e1",
      target: { nodeId: "c", portId: "in" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.connection.target.nodeId).toBe("c");
    }
    expect(editor.graph.edgeCount).toBe(1);
  });

  it("is reversible: undo restores the original endpoints", () => {
    const editor = makeEditor();
    reconnectEdge(editor, { edgeId: "e1", target: { nodeId: "c", portId: "in" } });

    expect(undo(editor)).toBe(true);

    const edge = editor.getEdge("e1");
    expect(edge?.connection.source.nodeId).toBe("a");
    expect(edge?.connection.target.nodeId).toBe("b");
    expect(edge?.label).toBe("original");

    expect(redo(editor)).toBe(true);
    expect(editor.getEdge("e1")?.connection.target.nodeId).toBe("c");
  });

  it("keeps the original edge in place when the new connection is invalid", () => {
    const editor = makeEditor();

    const result = reconnectEdge(editor, {
      edgeId: "e1",
      target: { nodeId: "ghost", portId: "in" },
    });

    expect(result.ok).toBe(false);
    // The original edge survives untouched.
    expect(editor.getEdge("e1")?.connection.target.nodeId).toBe("b");
    expect(editor.graph.edgeCount).toBe(1);
  });

  it("fails for an unknown edge", () => {
    const editor = makeEditor();
    const result = reconnectEdge(editor, { edgeId: "ghost", target: { nodeId: "c", portId: "in" } });
    expect(result.ok).toBe(false);
  });
});
