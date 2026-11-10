import { describe, expect, it, vi } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { addNode } from "./nodes.js";
import { createEdge, updateEdgeWaypoints } from "./edges.js";
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

describe("updateEdgeWaypoints use case (audit)", () => {
  it("replaces the edge's waypoints and is reversible", () => {
    const editor = makeEditor();

    const result = updateEdgeWaypoints(editor, {
      edgeId: "e1",
      waypoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
    });

    expect(result.ok).toBe(true);
    expect(editor.getEdge("e1")?.waypoints).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);

    expect(undo(editor)).toBe(true);
    expect(editor.getEdge("e1")?.waypoints).toBeUndefined();

    expect(redo(editor)).toBe(true);
    expect(editor.getEdge("e1")?.waypoints).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it("undoes from undefined → waypoints back to undefined", () => {
    const editor = makeEditor();

    // Apply waypoints
    updateEdgeWaypoints(editor, {
      edgeId: "e1",
      waypoints: [{ x: 50, y: 50 }],
    });
    expect(editor.getEdge("e1")?.waypoints).toEqual([{ x: 50, y: 50 }]);

    // Clear via undefined
    const clearResult = updateEdgeWaypoints(editor, {
      edgeId: "e1",
      waypoints: undefined,
    });
    expect(clearResult.ok).toBe(true);
    expect(editor.getEdge("e1")?.waypoints).toBeUndefined();

    // Undo the clear → waypoints are back
    expect(undo(editor)).toBe(true);
    expect(editor.getEdge("e1")?.waypoints).toEqual([{ x: 50, y: 50 }]);
  });

  it("clears waypoints when set to undefined; undo restores previous shape", () => {
    const editor = makeEditor();
    updateEdgeWaypoints(editor, {
      edgeId: "e1",
      waypoints: [{ x: 10, y: 20 }],
    });
    expect(editor.getEdge("e1")?.waypoints).toEqual([{ x: 10, y: 20 }]);

    updateEdgeWaypoints(editor, { edgeId: "e1", waypoints: undefined });
    expect(editor.getEdge("e1")?.waypoints).toBeUndefined();

    expect(undo(editor)).toBe(true);
    expect(editor.getEdge("e1")?.waypoints).toEqual([{ x: 10, y: 20 }]);
  });

  it("normalises empty array to undefined (clear)", () => {
    const editor = makeEditor();
    updateEdgeWaypoints(editor, {
      edgeId: "e1",
      waypoints: [{ x: 10, y: 20 }],
    });
    expect(editor.getEdge("e1")?.waypoints).toEqual([{ x: 10, y: 20 }]);

    updateEdgeWaypoints(editor, { edgeId: "e1", waypoints: [] });
    expect(editor.getEdge("e1")?.waypoints).toBeUndefined();

    // undo should restore the previous shape
    expect(undo(editor)).toBe(true);
    expect(editor.getEdge("e1")?.waypoints).toEqual([{ x: 10, y: 20 }]);
  });

  it("emits edge.updated and one graph.changed", () => {
    const editor = makeEditor();
    const names: string[] = [];
    editor.events.subscribe("edge.updated", () => names.push("edge.updated"));
    editor.events.subscribe("graph.changed", () => names.push("graph.changed"));

    updateEdgeWaypoints(editor, {
      edgeId: "e1",
      waypoints: [{ x: 0, y: 0 }],
    });

    expect(names).toEqual(["edge.updated", "graph.changed"]);
  });

  it("edge.updated payload contains the correct edgeId", () => {
    const editor = makeEditor();
    let payload: Record<string, unknown> | undefined;
    editor.events.subscribe("edge.updated", (e: any) => {
      payload = e.payload;
    });

    updateEdgeWaypoints(editor, {
      edgeId: "e1",
      waypoints: [{ x: 0, y: 0 }],
    });

    expect(payload).toEqual({ edgeId: "e1" });
  });

  it("fails for an unknown edge without mutating or emitting", () => {
    const editor = makeEditor();
    const names: string[] = [];
    editor.events.subscribe("edge.updated", () => names.push("edge.updated"));
    editor.events.subscribe("graph.changed", () => names.push("graph.changed"));

    const result = updateEdgeWaypoints(editor, {
      edgeId: "ghost",
      waypoints: [{ x: 0, y: 0 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("edge-not-found");
    }
    expect(names).toEqual([]);
    expect(editor.graph.edgeCount).toBe(1);
  });

  it("rejects non-finite x coordinate (NaN) before any state change", () => {
    const editor = makeEditor();
    const result = updateEdgeWaypoints(editor, {
      edgeId: "e1",
      waypoints: [{ x: NaN, y: 10 }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-input");
    }
    // State untouched
    expect(editor.getEdge("e1")?.waypoints).toBeUndefined();
  });

  it("rejects non-finite y coordinate (Infinity) before any state change", () => {
    const editor = makeEditor();
    const result = updateEdgeWaypoints(editor, {
      edgeId: "e1",
      waypoints: [{ x: 10, y: Infinity }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-input");
    }
    expect(editor.getEdge("e1")?.waypoints).toBeUndefined();
  });

  it("rejects a non-{x, y} entry before any state change", () => {
    const editor = makeEditor();
    // Intentionally bypass TypeScript to test runtime validation
    const result = updateEdgeWaypoints(editor, {
      edgeId: "e1",
      waypoints: [{ x: 10 } as any],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-input");
    }
    expect(editor.getEdge("e1")?.waypoints).toBeUndefined();
  });

  it("rejects null entry before any state change", () => {
    const editor = makeEditor();
    const result = updateEdgeWaypoints(editor, {
      edgeId: "e1",
      waypoints: [null as any],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid-input");
    }
    expect(editor.getEdge("e1")?.waypoints).toBeUndefined();
  });
});