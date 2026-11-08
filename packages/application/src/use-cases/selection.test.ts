import { describe, expect, it, vi } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { addNode } from "./nodes.js";
import { createEdge } from "./edges.js";
import {
  clearSelection,
  selectEdge,
  selectMultiple,
  selectNode,
} from "./selection.js";

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
  });
  if (!edge.ok) {
    throw new Error(edge.error.message);
  }
}

describe("selectNode use case", () => {
  it("selects one node replacing the previous selection", () => {
    const editor = makeEditor();
    seed(editor);
    selectNode(editor, { nodeId: "a" });

    const result = selectNode(editor, { nodeId: "b" });

    expect(result.ok).toBe(true);
    expect(editor.getSelectedNodes()).toEqual(["b"]);
    expect(editor.getSelectedEdges()).toEqual([]);
  });

  it("supports additive selection", () => {
    const editor = makeEditor();
    seed(editor);
    selectNode(editor, { nodeId: "a" });

    selectNode(editor, { nodeId: "b", additive: true });

    expect([...editor.getSelectedNodes()].sort()).toEqual(["a", "b"]);
  });

  it("emits node.selected with the node id", () => {
    const editor = makeEditor();
    seed(editor);
    const onSelected = vi.fn();
    editor.events.subscribe("node.selected", onSelected);

    selectNode(editor, { nodeId: "a" });

    expect(onSelected).toHaveBeenCalledWith({ name: "node.selected", payload: { nodeId: "a" } });
  });

  it("fails for an unknown node without changing the selection", () => {
    const editor = makeEditor();
    seed(editor);
    selectNode(editor, { nodeId: "a" });

    const result = selectNode(editor, { nodeId: "ghost" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("node-not-found");
    }
    expect(editor.getSelectedNodes()).toEqual(["a"]);
  });

  it("does not create history units: selection is editor state, not document", () => {
    const editor = makeEditor();
    seed(editor);
    const sizeBefore = editor.history.size();

    selectNode(editor, { nodeId: "a" });

    expect(editor.history.size()).toBe(sizeBefore);
  });
});

describe("selection.changed event", () => {
  it("selectNode emits the resulting selection", () => {
    const editor = makeEditor();
    seed(editor);
    const onChanged = vi.fn();
    editor.events.subscribe("selection.changed", onChanged);

    selectNode(editor, { nodeId: "a" });

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith({
      name: "selection.changed",
      payload: { selectedNodes: ["a"], selectedEdges: [] },
    });
  });

  it("selectEdge emits the resulting selection", () => {
    const editor = makeEditor();
    seed(editor);
    const onChanged = vi.fn();
    editor.events.subscribe("selection.changed", onChanged);

    selectEdge(editor, { edgeId: "e1" });

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith({
      name: "selection.changed",
      payload: { selectedNodes: [], selectedEdges: ["e1"] },
    });
  });

  it("selectMultiple emits the resulting selection", () => {
    const editor = makeEditor();
    seed(editor);
    const onChanged = vi.fn();
    editor.events.subscribe("selection.changed", onChanged);

    selectMultiple(editor, { nodeIds: ["a", "b"], edgeIds: ["e1"] });

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith({
      name: "selection.changed",
      payload: { selectedNodes: ["a", "b"], selectedEdges: ["e1"] },
    });
  });

  it("clearSelection emits the resulting empty selection", () => {
    const editor = makeEditor();
    seed(editor);
    selectMultiple(editor, { nodeIds: ["a"], edgeIds: ["e1"] });
    const onChanged = vi.fn();
    editor.events.subscribe("selection.changed", onChanged);

    clearSelection(editor);

    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledWith({
      name: "selection.changed",
      payload: { selectedNodes: [], selectedEdges: [] },
    });
  });

  it("emits nothing when the selection use case fails", () => {
    const editor = makeEditor();
    seed(editor);
    const onChanged = vi.fn();
    editor.events.subscribe("selection.changed", onChanged);

    selectNode(editor, { nodeId: "ghost" });
    selectEdge(editor, { edgeId: "ghost" });
    selectMultiple(editor, { nodeIds: ["ghost"] });

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("keeps emitting node.selected with its unchanged payload", () => {
    const editor = makeEditor();
    seed(editor);
    const onSelected = vi.fn();
    const onChanged = vi.fn();
    editor.events.subscribe("node.selected", onSelected);
    editor.events.subscribe("selection.changed", onChanged);

    selectNode(editor, { nodeId: "a" });

    expect(onSelected).toHaveBeenCalledTimes(1);
    expect(onSelected).toHaveBeenCalledWith({ name: "node.selected", payload: { nodeId: "a" } });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});

describe("selectEdge use case", () => {
  it("selects one edge replacing the previous selection", () => {
    const editor = makeEditor();
    seed(editor);
    selectEdge(editor, { edgeId: "e1" });
    selectEdge(editor, { edgeId: "e1", additive: true });

    expect(editor.getSelectedEdges()).toEqual(["e1"]);
  });

  it("fails for an unknown edge", () => {
    const editor = makeEditor();
    const result = selectEdge(editor, { edgeId: "ghost" });
    expect(result.ok).toBe(false);
  });
});

describe("selectMultiple use case", () => {
  it("replaces the whole selection with the given nodes and edges", () => {
    const editor = makeEditor();
    seed(editor);
    selectNode(editor, { nodeId: "a" });

    const result = selectMultiple(editor, { nodeIds: ["a", "b"], edgeIds: ["e1"] });

    expect(result.ok).toBe(true);
    expect([...editor.getSelectedNodes()].sort()).toEqual(["a", "b"]);
    expect(editor.getSelectedEdges()).toEqual(["e1"]);
  });

  it("fails and changes nothing when any id is unknown", () => {
    const editor = makeEditor();
    seed(editor);
    selectNode(editor, { nodeId: "a" });

    const result = selectMultiple(editor, { nodeIds: ["a", "ghost"] });

    expect(result.ok).toBe(false);
    expect(editor.getSelectedNodes()).toEqual(["a"]);
  });
});

describe("clearSelection use case", () => {
  it("clears nodes and edges", () => {
    const editor = makeEditor();
    seed(editor);
    selectMultiple(editor, { nodeIds: ["a"], edgeIds: ["e1"] });

    const result = clearSelection(editor);

    expect(result.ok).toBe(true);
    expect(editor.getSelectedNodes()).toEqual([]);
    expect(editor.getSelectedEdges()).toEqual([]);
  });
});
