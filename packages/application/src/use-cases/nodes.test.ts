import { describe, expect, it, vi } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { createEdge } from "./edges.js";
import {
  addNode,
  duplicateNode,
  moveNode,
  removeNode,
  updateNodeMetadata,
  updateNodeProperties,
} from "./nodes.js";

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

/** Adds one node through the use case and returns its id. */
function seedNode(editor: EditorEngine, nodeId: string): string {
  const result = addNode(editor, { definitionId: "example.node", nodeId });
  if (!result.ok) {
    throw new Error(`seed failed: ${result.error.message}`);
  }
  return result.value.id;
}

describe("addNode use case", () => {
  it("adds a node from a registered definition and records one undo unit", () => {
    const editor = makeEditor();

    const result = addNode(editor, {
      definitionId: "example.node",
      nodeId: "node-1",
      properties: { url: "https://example.com" },
      position: { x: 10, y: 20 },
    });

    expect(result.ok).toBe(true);
    const node = editor.getNode("node-1");
    expect(node?.definitionId).toBe("example.node");
    expect(node?.getProperties()).toEqual({ url: "https://example.com" });
    expect(node?.position).toEqual({ x: 10, y: 20 });
    expect(editor.canUndo()).toBe(true);
  });

  it("emits node.created and exactly one graph.changed", () => {
    const editor = makeEditor();
    const names: string[] = [];
    editor.events.subscribe("node.created", () => names.push("node.created"));
    editor.events.subscribe("graph.changed", () => names.push("graph.changed"));

    addNode(editor, { definitionId: "example.node", nodeId: "node-1" });

    expect(names).toEqual(["node.created", "graph.changed"]);
  });

  it("fails with a structured error for an unknown definition and mutates nothing", () => {
    const editor = makeEditor();
    const onCreated = vi.fn();
    editor.events.subscribe("node.created", onCreated);

    const result = addNode(editor, { definitionId: "missing.node" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("node-definition-not-found");
      expect(result.error.message).toContain("missing.node");
    }
    expect(editor.graph.nodeCount).toBe(0);
    expect(editor.canUndo()).toBe(false);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("fails on a duplicate node id without a second history entry", () => {
    const editor = makeEditor();
    seedNode(editor, "node-1");

    const result = addNode(editor, { definitionId: "example.node", nodeId: "node-1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("duplicate-node-id");
    }
    expect(editor.graph.nodeCount).toBe(1);
    expect(editor.history.size()).toBe(1);
  });

  it("undo removes the added node; redo restores it", () => {
    const editor = makeEditor();
    seedNode(editor, "node-1");
    expect(editor.graph.nodeCount).toBe(1);

    editor.history.undo(editor.editorState);
    expect(editor.getNode("node-1")).toBeUndefined();

    editor.history.redo(editor.editorState);
    expect(editor.getNode("node-1")).toBeDefined();
  });
});

describe("removeNode use case", () => {
  it("removes the node and its attached edges as one undo unit", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    seedNode(editor, "b");
    createEdge(editor, {
      edgeId: "e1",
      source: { nodeId: "a", portId: "out" },
      target: { nodeId: "b", portId: "in" },
    });
    expect(editor.graph.edgeCount).toBe(1);

    const result = removeNode(editor, { nodeId: "a" });

    expect(result.ok).toBe(true);
    expect(editor.getNode("a")).toBeUndefined();
    expect(editor.graph.edgeCount).toBe(0);
    // One unit reverses node and edges together.
    expect(editor.history.size()).toBe(4); // a, b, e1, remove-a
  });

  it("undo of a removal restores the node and its connections", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    seedNode(editor, "b");
    createEdge(editor, {
      edgeId: "e1",
      source: { nodeId: "a", portId: "out" },
      target: { nodeId: "b", portId: "in" },
    });
    removeNode(editor, { nodeId: "a" });

    editor.history.undo(editor.editorState);

    expect(editor.getNode("a")).toBeDefined();
    expect(editor.getEdge("e1")).toBeDefined();
    expect(editor.graph.edgeCount).toBe(1);
  });

  it("fails for an unknown node", () => {
    const editor = makeEditor();
    const result = removeNode(editor, { nodeId: "ghost" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("node-not-found");
    }
  });
});

describe("duplicateNode use case", () => {
  it("creates an independent copy with its own id, properties and position", () => {
    const editor = makeEditor();
    seedNode(editor, "node-1");
    moveNode(editor, { nodeId: "node-1", position: { x: 5, y: 5 } });
    updateNodeProperties(editor, { nodeId: "node-1", name: "url", value: "x" });

    const result = duplicateNode(editor, { nodeId: "node-1", newId: "node-1-copy" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe("node-1-copy");
      expect(result.value.definitionId).toBe("example.node");
      expect(result.value.getProperties()).toEqual({ url: "x" });
      expect(result.value.position).toEqual({ x: 5, y: 5 });
    }
    expect(editor.graph.nodeCount).toBe(2);
  });

  it("fails for an unknown source node", () => {
    const editor = makeEditor();
    const result = duplicateNode(editor, { nodeId: "ghost" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("node-not-found");
    }
  });

  it("undo removes the duplicate; redo recreates it", () => {
    const editor = makeEditor();
    seedNode(editor, "node-1");
    duplicateNode(editor, { nodeId: "node-1", newId: "copy" });
    expect(editor.getNode("copy")).toBeDefined();

    editor.history.undo(editor.editorState);
    expect(editor.getNode("copy")).toBeUndefined();
    expect(editor.getNode("node-1")).toBeDefined();

    editor.history.redo(editor.editorState);
    expect(editor.getNode("copy")).toBeDefined();
  });
});

describe("moveNode use case", () => {
  it("moves the node and is reversible to the previous position", () => {
    const editor = makeEditor();
    seedNode(editor, "node-1");
    moveNode(editor, { nodeId: "node-1", position: { x: 1, y: 1 } });

    const result = moveNode(editor, { nodeId: "node-1", position: { x: 9, y: 9 } });

    expect(result.ok).toBe(true);
    expect(editor.getNode("node-1")?.position).toEqual({ x: 9, y: 9 });

    editor.history.undo(editor.editorState);
    expect(editor.getNode("node-1")?.position).toEqual({ x: 1, y: 1 });
  });

  it("fails for an unknown node", () => {
    const editor = makeEditor();
    const result = moveNode(editor, { nodeId: "ghost", position: { x: 0, y: 0 } });
    expect(result.ok).toBe(false);
  });
});

describe("updateNodeProperties use case", () => {
  it("sets one property, emits property.changed and node.updated, and is reversible", () => {
    const editor = makeEditor();
    seedNode(editor, "node-1");
    const names: string[] = [];
    editor.events.subscribe("property.changed", () => names.push("property.changed"));
    editor.events.subscribe("node.updated", () => names.push("node.updated"));

    const result = updateNodeProperties(editor, { nodeId: "node-1", name: "url", value: "a" });
    expect(result.ok).toBe(true);
    expect(names).toEqual(["property.changed", "node.updated"]);
    expect(editor.getNode("node-1")?.getProperties()).toEqual({ url: "a" });

    editor.history.undo(editor.editorState);
    expect(editor.getNode("node-1")?.getProperties()).toEqual({});
  });

  it("restores the previous value when overwriting an existing property", () => {
    const editor = makeEditor();
    seedNode(editor, "node-1");
    updateNodeProperties(editor, { nodeId: "node-1", name: "url", value: "first" });

    updateNodeProperties(editor, { nodeId: "node-1", name: "url", value: "second" });
    editor.history.undo(editor.editorState);

    expect(editor.getNode("node-1")?.getProperties()).toEqual({ url: "first" });
  });

  it("fails for an unknown node", () => {
    const editor = makeEditor();
    const result = updateNodeProperties(editor, { nodeId: "ghost", name: "url", value: "a" });
    expect(result.ok).toBe(false);
  });
});

describe("updateNodeMetadata use case", () => {
  it("replaces node metadata and is reversible", () => {
    const editor = makeEditor();
    seedNode(editor, "node-1");

    const result = updateNodeMetadata(editor, { nodeId: "node-1", metadata: { group: "io" } });
    expect(result.ok).toBe(true);
    expect(editor.getNode("node-1")?.metadata).toEqual({ group: "io" });

    editor.history.undo(editor.editorState);
    expect(editor.getNode("node-1")?.metadata).toBeUndefined();
  });
});
