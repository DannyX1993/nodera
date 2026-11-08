import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, createEvent, act, waitFor, cleanup } from "@testing-library/react";
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
import { NodeRendererRegistry } from "../registries/renderer-registries.js";
import { createNodeId } from "@nodera/contracts";

import { GraphCanvas, commitDraggedNodes, commitSelectionFromReactFlow } from "./graph-canvas.js";
import type { GraphCanvasProps } from "./graph-canvas.js";
import { NODE_DEFINITION_MIME_TYPE } from "./definition-drop.js";

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

/* ------------------------------------------------------------------ */
/*  T8 audit fixes                                                     */
/* ------------------------------------------------------------------ */

describe("GraphCanvas audit fixes", () => {
  it("renders a registered custom node renderer through the canvas", () => {
    const engine = makeEngine();
    // Definition declares renderer id "custom-x" (the mapper carries it in data).
    const customDef = {
      ...def,
      id: "test.app-node",
      renderer: "custom-x",
    } as unknown as NodeDefinition;
    engine.domain.nodes.unregister("test.app-node");
    engine.domain.nodes.register(customDef);
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });

    const nodeRenderers = new NodeRendererRegistry();
    nodeRenderers.register("custom-x", (({ data }: { data: { label: string } }) =>
      createElement("div", { "data-testid": "custom-marker" }, data.label)) as never);

    renderCanvas(engine, { nodeRenderers });
    expect(screen.getByTestId("custom-marker")).toBeDefined();
    cleanup();
  });

  it("commitSelectionFromReactFlow syncs RF selection into the engine", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1" });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2" });
    const created = createEdge(engine, { source: { nodeId: "n1", portId: "out-1" }, target: { nodeId: "n2", portId: "in-1" } });
    if (!created.ok) throw new Error("edge failed");
    const edgeId = String(created.value.id);

    commitSelectionFromReactFlow(engine, {
      nodes: [{ id: "n1" }, { id: "n2" }],
      edges: [{ id: edgeId }],
    });

    expect(engine.getSelectedNodes()).toEqual(["n1", "n2"]);
    expect(engine.getSelectedEdges()).toEqual([edgeId]);
  });

  it("commitSelectionFromReactFlow clears the engine selection when RF selects nothing", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1" });
    selectNode(engine, { nodeId: "n1" });
    expect(engine.getSelectedNodes()).toEqual(["n1"]);

    commitSelectionFromReactFlow(engine, { nodes: [], edges: [] });

    expect(engine.getSelectedNodes()).toEqual([]);
  });
});

describe("T9 audit round 2 fixes", () => {
  it("falls back to the default node-type wrapper when a definition renderer id is not registered", () => {
    const engine = makeEngine();
    const unregisteredDef = {
      ...def,
      id: "test.app-node",
      renderer: "no-such-renderer",
    } as unknown as NodeDefinition;
    engine.domain.nodes.unregister("test.app-node");
    engine.domain.nodes.register(unregisteredDef);
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });

    // Empty registry: the renderer id is unregistered. The node must still
    // render through the default wrapper WITH its port handles.
    const { container } = renderCanvas(engine, { nodeRenderers: new NodeRendererRegistry() });
    const handles = container.querySelectorAll("[data-nodera-port-id]");
    expect(handles.length).toBe(2);
    cleanup();
  });

  it("removes a selected node when Delete is pressed", async () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 50, y: 0 } });
    selectNode(engine, { nodeId: "n1" });

    const { container } = renderCanvas(engine);
    fireEvent.keyDown(container, { key: "Delete", code: "Delete" });
    await waitFor(() => {
      expect(engine.graph.nodeCount).toBe(1);
 expect(engine.graph.getNode(createNodeId("n1"))).toBeUndefined();
    });
    cleanup();
  });
});

/* ------------------------------------------------------------------ */
/*  Palette → canvas drop (D7)                                         */
/* ------------------------------------------------------------------ */

describe("GraphCanvas node definition drop", () => {
  /** The element that owns the drop handlers (the canvas wrapper). */
  function dropTarget(container: HTMLElement): HTMLElement {
    const target = container.querySelector("[data-color-mode]");
    if (!(target instanceof HTMLElement)) {
      throw new Error("canvas wrapper not rendered");
    }
    return target;
  }

  /**
   * Build a drop event carrying a payload and pointer coordinates.
   *
   * jsdom has no `DragEvent`, so `fireEvent.drop` falls back to a plain
   * `Event` that ignores the MouseEvent init (no clientX/clientY). The
   * coordinates are therefore defined on the event explicitly.
   */
  function dropEvent(
    target: HTMLElement,
    dataTransfer: { types: readonly string[]; getData(type: string): string },
    position: { readonly clientX: number; readonly clientY: number } = {
      clientX: 120,
      clientY: 80,
    },
  ) {
    const event = createEvent.drop(target, { dataTransfer });
    Object.defineProperty(event, "clientX", { value: position.clientX });
    Object.defineProperty(event, "clientY", { value: position.clientY });
    return event;
  }

  it("calls onDropNodeDefinition with the payload definition id and a canvas position", () => {
    const engine = makeEngine();
    const onDropNodeDefinition = vi.fn();
    const { container } = renderCanvas(engine, { onDropNodeDefinition });

    const target = dropTarget(container);
    const event = dropEvent(target, {
      types: [NODE_DEFINITION_MIME_TYPE],
      getData: () => "acme.node",
    });
    fireEvent(target, event);

    expect(onDropNodeDefinition).toHaveBeenCalledTimes(1);
    const call = onDropNodeDefinition.mock.calls[0] as unknown as [
      string,
      { x: number; y: number },
    ];
    expect(call[0]).toBe("acme.node");
    expect(call[1]).toEqual({ x: 120, y: 80 });
    cleanup();
  });

  it("ignores a drop carrying an unknown payload", () => {
    const engine = makeEngine();
    const onDropNodeDefinition = vi.fn();
    const { container } = renderCanvas(engine, { onDropNodeDefinition });

    fireEvent.drop(dropTarget(container), {
      dataTransfer: { types: ["text/plain"], getData: () => "" },
      clientX: 10,
      clientY: 10,
    });

    expect(onDropNodeDefinition).not.toHaveBeenCalled();
    cleanup();
  });

  it("prevents the default dragover for a node definition drag when a drop handler exists", () => {
    const engine = makeEngine();
    const { container } = renderCanvas(engine, { onDropNodeDefinition: vi.fn() });

    const notPrevented = fireEvent.dragOver(dropTarget(container), {
      dataTransfer: { types: [NODE_DEFINITION_MIME_TYPE] },
    });

    expect(notPrevented).toBe(false);
    cleanup();
  });

  it("does not prevent the default dragover when no drop handler exists", () => {
    const engine = makeEngine();
    const { container } = renderCanvas(engine);

    const notPrevented = fireEvent.dragOver(dropTarget(container), {
      dataTransfer: { types: [NODE_DEFINITION_MIME_TYPE] },
    });

    expect(notPrevented).toBe(true);
    cleanup();
  });
});
