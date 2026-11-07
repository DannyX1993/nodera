import { describe, expect, it } from "vitest";
import {
  addNode,
  createEdge,
  clearSelection,
  selectNode,
  selectEdge,
  EditorEngine,
} from "@nodera/application";
import { renderHook } from "@testing-library/react";
import type { NodeDefinition } from "@nodera/node-registry";

import { useEditorGraph } from "./use-editor-graph.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Create an EditorEngine seeded with a test node definition. */
function buildEngine(): EditorEngine {
  const engine = new EditorEngine();
  const def: NodeDefinition = {
    id: "test.app-node",
    name: "Test Node",
    category: "test",
    version: "1.0.0",
    ports: [
      { id: "in-1", name: "Input 1", direction: "input" as const, dataType: "string" },
      { id: "out-1", name: "Output 1", direction: "output" as const, dataType: "string" },
    ],
    properties: [],
  };
  engine.domain.nodes.register(def);
  return engine;
}

/* ------------------------------------------------------------------ */
/*  useEditorGraph hook tests                                          */
/* ------------------------------------------------------------------ */

describe("useEditorGraph hook", () => {
  describe("initial state", () => {
    it("returns empty nodes and edges when the engine graph is empty", () => {
      const engine = buildEngine();
      const { result } = renderHook(() => useEditorGraph(engine));

      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
      expect(result.current.selectedNodeIds).toEqual(new Set<string>());
      expect(result.current.selectedEdgeIds).toEqual(new Set<string>());
    });

    it("returns nodes when engine already has nodes (proving derive works)", () => {
      const engine = buildEngine();
      addNode(engine, { definitionId: "test.app-node", nodeId: "node-1", position: { x: 10, y: 20 } });

      const { result } = renderHook(() => useEditorGraph(engine));

      // Hook derives from editor.graph synchronously on first render.
      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0]?.id).toBe("node-1");
      expect(result.current.nodes[0]?.data.definitionId).toBe("test.app-node");
      expect(result.current.nodes[0]?.data.label).toBe("Test Node");
    });

    it("returns edges when engine already has edges", () => {
      const engine = buildEngine();
      addNode(engine, { definitionId: "test.app-node", nodeId: "node-1" });
      addNode(engine, { definitionId: "test.app-node", nodeId: "node-2" });
      createEdge(engine, { source: { nodeId: "node-1", portId: "out-1" }, target: { nodeId: "node-2", portId: "in-1" } });

      const { result } = renderHook(() => useEditorGraph(engine));

      expect(result.current.edges).toHaveLength(1);
      const edges = result.current.edges;
      expect(edges.length).toBe(1);
      const edge0 = edges[0]!;
      expect(edge0.source).toBe("node-1");
      expect(edge0.target).toBe("node-2");
    });

    it("returns selected node ids when engine selection is set", () => {
      const engine = buildEngine();
      addNode(engine, { definitionId: "test.app-node", nodeId: "node-1" });
      selectNode(engine, { nodeId: "node-1" });

      const { result } = renderHook(() => useEditorGraph(engine));

      expect(result.current.selectedNodeIds).toContain("node-1");
    });

    it("returns selected edge ids when engine selection is set", () => {
      const engine = buildEngine();
      addNode(engine, { definitionId: "test.app-node", nodeId: "node-1" });
      addNode(engine, { definitionId: "test.app-node", nodeId: "node-2" });
      createEdge(engine, { source: { nodeId: "node-1", portId: "out-1" }, target: { nodeId: "node-2", portId: "in-1" } });

      const edges = engine.graph.getEdges();
      const edgeId = edges[0]!.id;
      selectEdge(engine, { edgeId });

      const { result } = renderHook(() => useEditorGraph(engine));

      expect(result.current.selectedEdgeIds).toContain(edgeId);
    });
  });
});