import { describe, expect, it } from "vitest";
import { NodeRegistry, type NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "./editor-engine.js";

function makeDefinition(id: string): NodeDefinition {
  return {
    id,
    name: id,
    version: "1.0.0",
    ports: [
      { id: "in", name: "in", direction: "input" },
      { id: "out", name: "out", direction: "output" },
    ],
  } as unknown as NodeDefinition;
}

describe("EditorEngine", () => {
  it("creates an empty graph with a generated id when none is given", () => {
    const editor = new EditorEngine();

    expect(editor.graph).toBeDefined();
    expect(editor.graph.nodeCount).toBe(0);
    expect(editor.graph.id).toBeTruthy();
    expect(editor.events).toBeDefined();
    expect(editor.history).toBeDefined();
    expect(editor.domain).toBeDefined();
  });

  it("accepts an initial graph id", () => {
    const editor = new EditorEngine({ graphId: "graph-001" });
    expect(editor.graph.id).toBe("graph-001");
  });

  it("starts with empty selection and clipboard", () => {
    const editor = new EditorEngine();

    expect(editor.getSelectedNodes()).toEqual([]);
    expect(editor.getSelectedEdges()).toEqual([]);
    expect(editor.getClipboard()).toEqual([]);
  });

  it("registers node definitions through the composed domain", () => {
    const editor = new EditorEngine();
    const definition = makeDefinition("http.request");
    editor.domain.nodes.register(definition);

    expect(editor.domain.nodes.get("http.request")).toBe(definition);
  });

  it("exposes undo/redo availability from the history engine", () => {
    const editor = new EditorEngine();
    expect(editor.canUndo()).toBe(false);
    expect(editor.canRedo()).toBe(false);
  });

  it("keeps editor state out of the portable graph document", () => {
    const editor = new EditorEngine();
    // Selection and clipboard are application state: querying them must not
    // touch the domain graph's serializable content.
    editor.selectNode("node-x");
    expect(editor.getSelectedNodes()).toEqual(["node-x"]);
    expect(editor.graph.nodeCount).toBe(0);
  });

  it("is isolated per instance", () => {
    const a = new EditorEngine();
    const b = new EditorEngine();
    a.selectNode("node-a");

    expect(a.getSelectedNodes()).toEqual(["node-a"]);
    expect(b.getSelectedNodes()).toEqual([]);
  });
});
