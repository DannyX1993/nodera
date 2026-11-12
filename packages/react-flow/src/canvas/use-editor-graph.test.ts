import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { EditorEngine, addNode, createEdge, clearSelection, selectEdge, selectNode } from "@nodera/application";
import type { NodeDefinition } from "@nodera/node-registry";

import { applyEdgeSelection, applyNodeSelection, useEditorGraph } from "./use-editor-graph.js";

const def = {
  id: "test.app-node",
  name: "App",
  version: "1.0.0",
  category: "test",
  ports: [
    { id: "in-1", name: "In", direction: "input" },
    { id: "out-1", name: "Out", direction: "output" },
  ],
  properties: [],
} as unknown as NodeDefinition;

function makeEngine(): EditorEngine {
  const engine = new EditorEngine({ graphId: "graph-test" });
  engine.domain.nodes.register(def);
  return engine;
}

/** Seeds two nodes joined by one edge and returns the edge id. */
function seedGraph(engine: EditorEngine): string {
  addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
  addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 10, y: 0 } });
  const created = createEdge(engine, {
    source: { nodeId: "n1", portId: "out-1" },
    target: { nodeId: "n2", portId: "in-1" },
  });
  if (!created.ok) {
    throw new Error("edge creation failed");
  }
  return created.value.id;
}

describe("useEditorGraph", () => {
  it("derives nodes and edges from the engine", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 10, y: 0 } });
    const created = createEdge(engine, { source: { nodeId: "n1", portId: "out-1" }, target: { nodeId: "n2", portId: "in-1" } });
    expect(created.ok).toBe(true);

    const { result } = renderHook(() => useEditorGraph(engine));
    expect(result.current.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(result.current.edges).toHaveLength(1);
  });

  it("re-derives when the engine emits events", () => {
    const engine = makeEngine();
    const { result } = renderHook(() => useEditorGraph(engine));
    expect(result.current.nodes).toHaveLength(0);

    act(() => {
      addNode(engine, { definitionId: "test.app-node", nodeId: "n1" });
    });
    expect(result.current.nodes).toHaveLength(1);
  });

  /* ---------------------------------------------------------------- */
  /*  Selection isolation (S7/D10)                                     */
  /* ---------------------------------------------------------------- */

  it("keeps the derived nodes and edges referentially stable across a selection change", () => {
    const engine = makeEngine();
    seedGraph(engine);

    const { result } = renderHook(() => useEditorGraph(engine));
    const nodesBefore = result.current.nodes;
    const edgesBefore = result.current.edges;
    expect(nodesBefore).toHaveLength(2);

    act(() => {
      selectNode(engine, { nodeId: "n1" });
    });

    // The whole point of the isolation: selecting is editor state, so it must
    // never rebuild the React Flow elements (that re-derivation is what made
    // every node/edge object of a large graph churn on one click).
    expect(result.current.nodes).toBe(nodesBefore);
    expect(result.current.edges).toBe(edgesBefore);
  });

  it("keeps the derived elements referentially stable when an edge is selected", () => {
    const engine = makeEngine();
    const edgeId = seedGraph(engine);

    const { result } = renderHook(() => useEditorGraph(engine));
    const nodesBefore = result.current.nodes;
    const edgesBefore = result.current.edges;

    act(() => {
      selectEdge(engine, { edgeId });
    });

    expect(result.current.nodes).toBe(nodesBefore);
    expect(result.current.edges).toBe(edgesBefore);
  });

  it("publishes the engine selection separately from the derived elements", () => {
    const engine = makeEngine();
    seedGraph(engine);

    const { result } = renderHook(() => useEditorGraph(engine));
    expect(result.current.selectedNodeIds.size).toBe(0);

    act(() => {
      selectNode(engine, { nodeId: "n1" });
    });
    expect([...result.current.selectedNodeIds]).toEqual(["n1"]);
    // Selection never travels inside the derived elements: React Flow owns the
    // `selected` flag of the nodes it renders.
    expect(result.current.nodes.every((node) => node.selected !== true)).toBe(true);

    act(() => {
      clearSelection(engine);
    });
    expect(result.current.selectedNodeIds.size).toBe(0);
  });

  it("publishes the selected edges separately from the derived elements", () => {
    const engine = makeEngine();
    const edgeId = seedGraph(engine);

    const { result } = renderHook(() => useEditorGraph(engine));
    expect(result.current.selectedEdgeIds.size).toBe(0);

    act(() => {
      selectEdge(engine, { edgeId });
    });

    expect([...result.current.selectedEdgeIds]).toEqual([edgeId]);
    expect(result.current.edges.every((edge) => edge.selected !== true)).toBe(true);
  });

  it("re-derives when the document itself changes", () => {
    const engine = makeEngine();
    seedGraph(engine);

    const { result } = renderHook(() => useEditorGraph(engine));
    const nodesBefore = result.current.nodes;

    act(() => {
      addNode(engine, { definitionId: "test.app-node", nodeId: "n3", position: { x: 20, y: 0 } });
    });

    expect(result.current.nodes).not.toBe(nodesBefore);
    expect(result.current.nodes.map((node) => node.id)).toEqual(["n1", "n2", "n3"]);
  });

  it("refresh re-derives the elements for engine changes that emit no event", () => {
    const engine = makeEngine();
    seedGraph(engine);

    const { result } = renderHook(() => useEditorGraph(engine));
    const nodesBefore = result.current.nodes;

    act(() => {
      result.current.refresh();
    });

    expect(result.current.nodes).not.toBe(nodesBefore);
    expect(result.current.nodes).toHaveLength(2);
  });

  it("unsubscribes on unmount without throwing", () => {
    const engine = makeEngine();
    vi.spyOn(engine.events, "subscribe");
    const { unmount } = renderHook(() => useEditorGraph(engine));
    expect(engine.events.subscribe).toHaveBeenCalled();
    expect(() => unmount()).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  Selection application (canvas side)                                */
/* ------------------------------------------------------------------ */

describe("applyNodeSelection", () => {
  const nodes = [
    { id: "a", position: { x: 0, y: 0 }, data: {} },
    { id: "b", position: { x: 1, y: 0 }, data: {} },
    { id: "c", position: { x: 2, y: 0 }, data: {} },
  ] as unknown as import("@xyflow/react").Node[];

  it("returns the very same array when the selection already matches", () => {
    expect(applyNodeSelection(nodes, new Set())).toBe(nodes);
    expect(applyNodeSelection(nodes, new Set(["missing"]))).toBe(nodes);
  });

  it("flags only the selected node and leaves every other node object untouched", () => {
    const next = applyNodeSelection(nodes, new Set(["b"]));

    expect(next).not.toBe(nodes);
    expect(next.map((node) => node.id)).toEqual(["a", "b", "c"]);
    expect(next[1]?.selected).toBe(true);
    // Untouched nodes keep their identity, so React Flow's own equality check
    // keeps their internal node (and everything measured on it).
    expect(next[0]).toBe(nodes[0]);
    expect(next[2]).toBe(nodes[2]);
  });

  it("clears a stale selection flag when the node leaves the selection", () => {
    const selected = applyNodeSelection(nodes, new Set(["a"]));
    expect(selected[0]?.selected).toBe(true);

    const cleared = applyNodeSelection(selected, new Set());
    expect(cleared[0]?.selected).toBe(false);
    expect(cleared[1]).toBe(selected[1]);
  });
});

describe("applyEdgeSelection", () => {
  const edges = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "c" },
  ] as unknown as import("@xyflow/react").Edge[];

  it("returns the very same array when the selection already matches", () => {
    expect(applyEdgeSelection(edges, new Set())).toBe(edges);
  });

  it("flags only the selected edge and leaves every other edge object untouched", () => {
    const next = applyEdgeSelection(edges, new Set(["e2"]));

    expect(next).not.toBe(edges);
    expect(next[0]).toBe(edges[0]);
    expect(next[1]?.selected).toBe(true);
  });
});
