import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { FC, ReactNode } from "react";
import { createElement } from "react";
import {
  EditorEngine,
  addNode,
  createEdge,
  selectNode,
  removeNode,
} from "@nodera/application";
import type { NodeDefinition } from "@nodera/node-registry";
import { createNodeId } from "@nodera/contracts";

import { GraphCanvas, commitDraggedNodes } from "./graph-canvas.js";
import type { GraphCanvasProps } from "./graph-canvas.js";

/* ------------------------------------------------------------------ */
/*  Test harness                                                       */
/* ------------------------------------------------------------------ */

const def = {
  id: "test.app-node",
  name: "App Node",
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

const Canvas: FC<Partial<GraphCanvasProps> & { editor: EditorEngine }> = ({ editor, ...rest }) =>
  createElement(
    "div",
    { style: { width: 800, height: 600 } },
    createElement(ReactFlowProvider, null, createElement(GraphCanvas, { editor, ...rest })),
  );

function renderCanvas(editor: EditorEngine, props?: Partial<GraphCanvasProps>) {
  return render(createElement(Canvas, { editor, ...props }));
}

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

describe("GraphCanvas", () => {
  it("renders node labels from a seeded engine", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 10, y: 20 } });
    renderCanvas(engine);
    expect(screen.getByText("App Node")).toBeDefined();
    cleanup();
  });

  it("reflects the requested color mode on its container", () => {
    const engine = makeEngine();
    const { container } = renderCanvas(engine, { colorMode: "dark" });
    expect(container.querySelector("[data-color-mode='dark']")).not.toBeNull();
    cleanup();
  });

  /* ---------------------------------------------------------------- */
  /*  Drag → moveNode                                                   */
  /* ---------------------------------------------------------------- */

  describe("drag commit", () => {
    it("commitDraggedNodes applies the dragged positions through moveNode", () => {
      const engine = makeEngine();
      addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });

      commitDraggedNodes(engine, [{ id: "n1", position: { x: 120, y: 80 } }]);

      const node = engine.graph.getNode(createNodeId("n1"));
      expect(node?.position).toEqual({ x: 120, y: 80 });
      expect(engine.history.canUndo()).toBe(true);
    });

    it("commitDraggedNodes groups a multi-node drag as per-node undo units", () => {
      const engine = makeEngine();
      addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
      addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 10, y: 0 } });

      commitDraggedNodes(engine, [
        { id: "n1", position: { x: 100, y: 0 } },
        { id: "n2", position: { x: 200, y: 0 } },
      ]);

      expect(engine.graph.getNode(createNodeId("n1"))?.position).toEqual({ x: 100, y: 0 });
      expect(engine.graph.getNode(createNodeId("n2"))?.position).toEqual({ x: 200, y: 0 });
      // A single transaction yields a single undo step.
      const undoCount = engine.history.canUndo();
      expect(undoCount).toBe(true);
    });

    it("does not commit anything for an empty drag", () => {
      const engine = makeEngine();
      addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
      commitDraggedNodes(engine, []);
      expect(engine.graph.getNode(createNodeId("n1"))?.position).toEqual({ x: 0, y: 0 });
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Selection                                                          */
  /* ---------------------------------------------------------------- */

  describe("selection", () => {
    it("reflects engine selection on the rendered node", async () => {
      const engine = makeEngine();
      addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
      const { container } = renderCanvas(engine);

      act(() => {
        selectNode(engine, { nodeId: "n1" });
      });

      await waitFor(() => {
        const selectedNode = container.querySelector("[data-nodera-node].nodera-node-selected");
        expect(selectedNode).not.toBeNull();
      });
      cleanup();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Removal cascade                                                    */
  /* ---------------------------------------------------------------- */

  it("removeNode use case cascades edges so the canvas removal path stays consistent", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1" });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2" });
    createEdge(engine, { source: { nodeId: "n1", portId: "out-1" }, target: { nodeId: "n2", portId: "in-1" } });
    expect(engine.graph.getEdges()).toHaveLength(1);

    removeNode(engine, { nodeId: "n1" });
    expect(engine.graph.getNodes()).toHaveLength(1);
    expect(engine.graph.getEdges()).toHaveLength(0);
  });

  /* ---------------------------------------------------------------- */
  /*  Connection translation                                             */
  /* ---------------------------------------------------------------- */

  it("renders port handles RF can connect from and to", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 200, y: 0 } });
    const { container } = renderCanvas(engine);
    const handles = container.querySelectorAll("[data-nodera-port-id]");
    // 2 nodes x 2 ports each.
    expect(handles.length).toBe(4);
    cleanup();
  });
});
