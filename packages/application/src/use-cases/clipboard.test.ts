import { describe, expect, it, vi } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { addNode } from "./nodes.js";
import { createEdge } from "./edges.js";
import { selectMultiple } from "./selection.js";
import { copySelection, cutSelection, pasteSelection } from "./clipboard.js";

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
    const result = addNode(editor, {
      definitionId: "example.node",
      nodeId: id,
      position: { x: 0, y: 0 },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }
  const edge = createEdge(editor, {
    edgeId: "e-internal",
    source: { nodeId: "a", portId: "out" },
    target: { nodeId: "b", portId: "in" },
  });
  const external = createEdge(editor, {
    edgeId: "e-external",
    source: { nodeId: "b", portId: "out" },
    target: { nodeId: "c", portId: "in" },
  });
  if (!edge.ok || !external.ok) {
    throw new Error("seed edges failed");
  }
}

describe("copySelection use case", () => {
  it("stores portable node payloads of the selected nodes", () => {
    const editor = makeEditor();
    seed(editor);
    selectMultiple(editor, { nodeIds: ["a", "b"] });

    const result = copySelection(editor);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3); // a, b, e-internal
      const nodeEntry = result.value[0]!;
      expect(nodeEntry.kind).toBe("node");
      // Portable payload: plain data, no class instances.
      expect(JSON.parse(JSON.stringify(nodeEntry.payload)).type).toBe("example.node");
    }
  });

  it("captures internal edges among selected nodes but drops external ones", () => {
    const editor = makeEditor();
    seed(editor);
    selectMultiple(editor, { nodeIds: ["a", "b"] });

    const result = copySelection(editor);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const edgeEntries = result.value.filter((entry) => entry.kind === "edge");
      expect(edgeEntries).toHaveLength(1);
      expect(edgeEntries[0]!.payload).toMatchObject({ sourceNodeId: "a", targetNodeId: "b" });
    }
  });

  it("fails on an empty selection", () => {
    const editor = makeEditor();
    const result = copySelection(editor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("empty-selection");
    }
  });
});

describe("cutSelection use case", () => {
  it("copies to the clipboard and removes the nodes as one undo unit", () => {
    const editor = makeEditor();
    seed(editor);
    selectMultiple(editor, { nodeIds: ["a", "b"] });

    const result = cutSelection(editor);

    expect(result.ok).toBe(true);
    expect(editor.getClipboard()).toHaveLength(3); // a, b, e-internal
    expect(editor.getNode("a")).toBeUndefined();
    expect(editor.getNode("b")).toBeUndefined();
    expect(editor.getEdge("e-internal")).toBeUndefined();
    expect(editor.getEdge("e-external")).toBeUndefined();
    expect(editor.history.size()).toBe(6); // a, b, 2 edges, 1 node removed inside cut txn
    expect(editor.history.labels().at(-1)).toBe("cut-selection");
  });

  it("undo restores the cut nodes, their edge and the external edge", () => {
    const editor = makeEditor();
    seed(editor);
    selectMultiple(editor, { nodeIds: ["a", "b"] });
    cutSelection(editor);

    editor.history.undo(editor.editorState);

    expect(editor.getNode("a")).toBeDefined();
    expect(editor.getNode("b")).toBeDefined();
    expect(editor.getEdge("e-internal")).toBeDefined();
    expect(editor.getEdge("e-external")).toBeDefined();
  });

  it("fails on an empty selection", () => {
    const editor = makeEditor();
    const result = cutSelection(editor);
    expect(result.ok).toBe(false);
    expect(editor.canUndo()).toBe(false);
  });
});

describe("pasteSelection use case", () => {
  it("recreates the copied nodes with new ids and rewires internal edges", () => {
    const editor = makeEditor();
    seed(editor);
    selectMultiple(editor, { nodeIds: ["a", "b"] });
    copySelection(editor);

    const result = pasteSelection(editor, { offset: { x: 100, y: 0 } });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(2);
      const [first, second] = result.value.nodes;
      expect(first!.id).not.toBe("a");
      expect(second!.id).not.toBe("b");
      expect(first!.definitionId).toBe("example.node");
      expect(first!.position).toEqual({ x: 100, y: 0 });
      // The internal edge was rewired to the new node ids.
      const pastedEdge = result.value.edges[0]!;
      expect(pastedEdge.connection.source.nodeId).toBe(first!.id);
      expect(pastedEdge.connection.target.nodeId).toBe(second!.id);
    }
    expect(editor.graph.nodeCount).toBe(5);
    expect(editor.graph.edgeCount).toBe(3);
  });

  it("is one undo unit and does not paste external connections", () => {
    const editor = makeEditor();
    seed(editor);
    selectMultiple(editor, { nodeIds: ["a", "b"] });
    copySelection(editor);

    pasteSelection(editor, {});
    expect(editor.history.size()).toBe(6); // a, b, c, 2 edges, paste unit

    editor.history.undo(editor.editorState);
    expect(editor.graph.nodeCount).toBe(3);
    expect(editor.graph.edgeCount).toBe(2);
  });

  it("emits node.created for each pasted node and one graph.changed", () => {
    const editor = makeEditor();
    seed(editor);
    selectMultiple(editor, { nodeIds: ["a"] });
    copySelection(editor);
    const onCreated = vi.fn();
    const onChanged = vi.fn();
    editor.events.subscribe("node.created", onCreated);
    editor.events.subscribe("graph.changed", onChanged);

    pasteSelection(editor, {});

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("fails with an empty clipboard", () => {
    const editor = makeEditor();
    const result = pasteSelection(editor, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("empty-clipboard");
    }
  });
});
