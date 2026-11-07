import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { EditorEngine, addNode, createEdge, selectNode, selectEdge } from "@nodera/application";
import type { NodeDefinition } from "@nodera/node-registry";

import { useEditorGraph } from "./use-editor-graph.js";

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

  it("marks nodes selected according to engine selection state", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1" });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2" });

    const { result } = renderHook(() => useEditorGraph(engine));
    expect(result.current.nodes.every((n) => n.selected !== true)).toBe(true);

    act(() => {
      selectNode(engine, { nodeId: "n1" });
    });

    const selected = result.current.nodes.find((n) => n.id === "n1");
    const other = result.current.nodes.find((n) => n.id === "n2");
    expect(selected?.selected).toBe(true);
    expect(other?.selected).not.toBe(true);
  });

  it("marks edges selected according to engine selection state", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1" });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2" });
    const created = createEdge(engine, { source: { nodeId: "n1", portId: "out-1" }, target: { nodeId: "n2", portId: "in-1" } });
    if (!created.ok) throw new Error("edge creation failed");
    const edgeId = created.value.id;

    const { result } = renderHook(() => useEditorGraph(engine));
    expect(result.current.edges.every((e) => e.selected !== true)).toBe(true);

    act(() => {
      selectEdge(engine, { edgeId });
      result.current.refresh();
    });

    expect(result.current.edges[0]?.selected).toBe(true);
  });

  it("unsubscribes on unmount without throwing", () => {
    const engine = makeEngine();
    vi.spyOn(engine.events, "subscribe");
    const { unmount } = renderHook(() => useEditorGraph(engine));
    expect(engine.events.subscribe).toHaveBeenCalled();
    expect(() => unmount()).not.toThrow();
  });
});
