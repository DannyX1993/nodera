import { describe, expect, it, vi } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { addNode } from "./nodes.js";
import {
  clearGraph,
  createGraph,
  deleteGraph,
  loadGraph,
  updateGraphMetadata,
} from "./graphs.js";

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

function seedNode(editor: EditorEngine, nodeId: string): void {
  const result = addNode(editor, { definitionId: "example.node", nodeId });
  if (!result.ok) {
    throw new Error(`seed failed: ${result.error.message}`);
  }
}

describe("createGraph use case", () => {
  it("replaces the current graph with a fresh empty one", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    expect(editor.graph.nodeCount).toBe(1);

    const result = createGraph(editor, { graphId: "graph-2" });

    expect(result.ok).toBe(true);
    expect(editor.graph.id).toBe("graph-2");
    expect(editor.graph.nodeCount).toBe(0);
  });

  it("emits graph.created once", () => {
    const editor = makeEditor();
    const onCreated = vi.fn();
    editor.events.subscribe("graph.created", onCreated);

    createGraph(editor, { graphId: "graph-2" });

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated.mock.calls[0]![0]!.payload).toEqual({ graphId: "graph-2" });
  });

  it("is reversible: undo restores the previous graph", () => {
    const editor = makeEditor();
    seedNode(editor, "a");

    createGraph(editor, { graphId: "graph-2" });
    editor.history.undo(editor.editorState);

    expect(editor.graph.id).toBe("graph-1");
    expect(editor.graph.nodeCount).toBe(1);
  });
});

describe("loadGraph use case", () => {
  it("replaces the editing target with the loaded graph", () => {
    const editor = makeEditor();
    seedNode(editor, "a");

    const result = loadGraph(editor, { graphId: "graph-9" });

    expect(result.ok).toBe(true);
    expect(editor.graph.id).toBe("graph-9");
    expect(editor.graph.nodeCount).toBe(0);
  });

  it("emits graph.loaded", () => {
    const editor = makeEditor();
    const onLoaded = vi.fn();
    editor.events.subscribe("graph.loaded", onLoaded);

    loadGraph(editor, { graphId: "graph-9" });

    expect(onLoaded).toHaveBeenCalledTimes(1);
  });
});

describe("clearGraph use case", () => {
  it("removes every node and edge; undo restores them", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    seedNode(editor, "b");

    const result = clearGraph(editor);

    expect(result.ok).toBe(true);
    expect(editor.graph.nodeCount).toBe(0);

    editor.history.undo(editor.editorState);
    expect(editor.graph.nodeCount).toBe(2);
  });

  it("is a no-op without history or events on an empty graph", () => {
    const editor = makeEditor();
    const onChanged = vi.fn();
    editor.events.subscribe("graph.changed", onChanged);

    const result = clearGraph(editor);

    expect(result.ok).toBe(true);
    expect(editor.canUndo()).toBe(false);
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("deleteGraph use case", () => {
  it("clears every element and resets metadata, reversibly", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    editor.graph.setMetadata({ name: "Important" });

    const result = deleteGraph(editor);

    expect(result.ok).toBe(true);
    expect(editor.graph.nodeCount).toBe(0);
    expect(editor.graph.metadata).toEqual({});

    editor.history.undo(editor.editorState);
    expect(editor.graph.nodeCount).toBe(1);
    expect(editor.graph.metadata).toEqual({ name: "Important" });
  });
});

describe("updateGraphMetadata use case", () => {
  it("replaces metadata and is reversible", () => {
    const editor = makeEditor();

    const result = updateGraphMetadata(editor, {
      metadata: { name: "New name", description: "d" },
    });

    expect(result.ok).toBe(true);
    expect(editor.graph.metadata).toEqual({ name: "New name", description: "d" });

    editor.history.undo(editor.editorState);
    expect(editor.graph.metadata).toEqual({});
  });
});
