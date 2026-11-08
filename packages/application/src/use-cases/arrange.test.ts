import { describe, expect, it, vi } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import type { NodePosition } from "@nodera/graph-model";
import { EditorEngine } from "../editor-engine.js";
import { arrangeGraph } from "./arrange.js";
import { addNode } from "./nodes.js";

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

/** Adds one node through the add-node use case. */
function seedNode(editor: EditorEngine, nodeId: string): void {
  const result = addNode(editor, { definitionId: "example.node", nodeId });
  if (!result.ok) {
    throw new Error(`seed failed: ${result.error.message}`);
  }
}

/** Subscribes to every event the graph editing API can emit. */
function recordEvents(editor: EditorEngine): string[] {
  const names: string[] = [];
  editor.events.subscribe("node.created", () => names.push("node.created"));
  editor.events.subscribe("node.updated", () => names.push("node.updated"));
  editor.events.subscribe("graph.changed", () => names.push("graph.changed"));
  return names;
}

describe("arrangeGraph use case", () => {
  it("applies every requested position in request order as one history unit", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    seedNode(editor, "b");
    seedNode(editor, "c");
    const before = editor.history.size();

    const result = arrangeGraph(editor, {
      moves: [
        { nodeId: "c", position: { x: 30, y: 0 } },
        { nodeId: "a", position: { x: 0, y: 40 } },
        { nodeId: "b", position: { x: 10, y: 40 } },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((node) => node.id)).toEqual(["c", "a", "b"]);
    }
    expect(editor.getNode("a")?.position).toEqual({ x: 0, y: 40 });
    expect(editor.getNode("b")?.position).toEqual({ x: 10, y: 40 });
    expect(editor.getNode("c")?.position).toEqual({ x: 30, y: 0 });
    // Three writes, one undo unit.
    expect(editor.history.size()).toBe(before + 1);
  });

  it("restores every previous position with one undo and reapplies them all with redo", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    seedNode(editor, "b");
    arrangeGraph(editor, {
      moves: [
        { nodeId: "a", position: { x: 1, y: 1 } },
        { nodeId: "b", position: { x: 2, y: 2 } },
      ],
    });
    const unitsBeforeSecondArrange = editor.history.size();

    arrangeGraph(editor, {
      moves: [
        { nodeId: "a", position: { x: 100, y: 100 } },
        { nodeId: "b", position: { x: 200, y: 200 } },
      ],
    });
    expect(editor.history.size()).toBe(unitsBeforeSecondArrange + 1);

    expect(editor.history.undo(editor.editorState)).toBe(true);
    expect(editor.getNode("a")?.position).toEqual({ x: 1, y: 1 });
    expect(editor.getNode("b")?.position).toEqual({ x: 2, y: 2 });
    // One undo unit rewound, not two.
    expect(editor.history.redoSize()).toBe(1);
    expect(editor.history.size()).toBe(unitsBeforeSecondArrange + 1);

    expect(editor.history.redo(editor.editorState)).toBe(true);
    expect(editor.getNode("a")?.position).toEqual({ x: 100, y: 100 });
    expect(editor.getNode("b")?.position).toEqual({ x: 200, y: 200 });
  });

  it("emits node.updated per moved node and exactly one graph.changed", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    seedNode(editor, "b");
    const names = recordEvents(editor);

    arrangeGraph(editor, {
      moves: [
        { nodeId: "a", position: { x: 0, y: 0 } },
        { nodeId: "b", position: { x: 80, y: 0 } },
      ],
    });

    expect(names).toEqual([
      "node.updated",
      "node.updated",
      "graph.changed",
    ]);
  });

  it("fails on an unknown node and leaves graph, history and events untouched", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    const historyBefore = editor.history.size();
    const names = recordEvents(editor);
    const onUpdated = vi.fn();
    editor.events.subscribe("node.updated", onUpdated);

    const result = arrangeGraph(editor, {
      moves: [
        { nodeId: "a", position: { x: 50, y: 50 } },
        { nodeId: "ghost", position: { x: 0, y: 0 } },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("node-not-found");
      expect(result.error.message).toContain("ghost");
      expect(result.error.elementId).toBe("ghost");
    }
    // Nothing was applied, not even the valid first move.
    expect(editor.getNode("a")?.position).toBeUndefined();
    expect(editor.history.size()).toBe(historyBefore);
    expect(names).toEqual([]);
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("rejects a duplicated nodeId without writing, pushing or emitting", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    const historyBefore = editor.history.size();
    const names = recordEvents(editor);

    const result = arrangeGraph(editor, {
      moves: [
        { nodeId: "a", position: { x: 10, y: 10 } },
        { nodeId: "a", position: { x: 20, y: 20 } },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-input");
      expect(result.error.message).toContain("a");
      expect(result.error.elementId).toBe("a");
    }
    expect(editor.getNode("a")?.position).toBeUndefined();
    expect(editor.history.size()).toBe(historyBefore);
    expect(names).toEqual([]);
  });

  it("rejects an invalid position without writing, pushing or emitting", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    const historyBefore = editor.history.size();
    const names = recordEvents(editor);

    const invalidPositions: unknown[] = [
      { x: Number.NaN, y: 0 },
      { x: 0, y: Number.POSITIVE_INFINITY },
      { x: "0", y: 0 },
      { y: 0 },
      null,
    ];
    for (const position of invalidPositions) {
      const result = arrangeGraph(editor, {
        moves: [
          { nodeId: "a", position: position as NodePosition },
        ],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("invalid-input");
        expect(result.error.elementId).toBe("a");
      }
    }

    expect(editor.getNode("a")?.position).toBeUndefined();
    expect(editor.history.size()).toBe(historyBefore);
    expect(names).toEqual([]);
  });

  it("treats an empty moves list as a successful no-op", () => {
    const editor = makeEditor();
    seedNode(editor, "a");
    const historyBefore = editor.history.size();
    const names = recordEvents(editor);

    const result = arrangeGraph(editor, { moves: [] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
    expect(editor.history.size()).toBe(historyBefore);
    expect(editor.canUndo()).toBe(true);
    expect(names).toEqual([]);
  });

  it("returns a node that had no position to having none after undo", () => {
    const editor = makeEditor();
    seedNode(editor, "positioned");
    seedNode(editor, "unpositioned");
    arrangeGraph(editor, {
      moves: [{ nodeId: "positioned", position: { x: 5, y: 5 } }],
    });

    arrangeGraph(editor, {
      moves: [
        { nodeId: "positioned", position: { x: 7, y: 7 } },
        { nodeId: "unpositioned", position: { x: 80, y: 7 } },
      ],
    });
    expect(editor.getNode("unpositioned")?.position).toEqual({ x: 80, y: 7 });

    editor.history.undo(editor.editorState);

    expect(editor.getNode("positioned")?.position).toEqual({ x: 5, y: 5 });
    expect(editor.getNode("unpositioned")?.position).toBeUndefined();
  });
});
