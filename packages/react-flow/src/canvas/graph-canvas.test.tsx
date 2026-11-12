import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, createEvent, act, waitFor, cleanup } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider, useEdges, useNodes, useStoreApi } from "@xyflow/react";
import type { NodeChange } from "@xyflow/react";
import type { FC, ReactNode } from "react";
import { createElement, useEffect } from "react";
import {
  EditorEngine,
  addNode,
  createEdge,
  selectNode,
  removeNode,
  undo,
  clearSelection,
} from "@nodera/application";
import type { NodeDefinition } from "@nodera/node-registry";
import type { EdgeDefinition } from "@nodera/edge-registry";
import { EdgeRendererRegistry, NodeRendererRegistry } from "../registries/renderer-registries.js";
import { DEFAULT_EDGE_RENDERER_ID } from "../registries/renderer-registries.js";
import { DefaultEdgeRenderer } from "../renderers/default-edge-renderer.js";
import { createNodeId } from "@nodera/contracts";
import type { ViewportConfiguration } from "@nodera/sdk";
import {
  CREATE_NODE_DIALOG,
  DEFAULT_SHORTCUTS,
  DialogRegistry,
  NODERA_CREATE_NODE_DIALOG_ID,
  UiStateStore,
  type ShortcutMap,
} from "@nodera/ui-core";
import { NoderaUiProvider } from "@nodera/ui-react";

import {
  GraphCanvas,
  canvasBackgroundOptions,
  canvasEdgeTypes,
  canvasPlaceholders,
  commitConnection,
  commitDraggedNodes,
  commitSelectionFromReactFlow,
  DefaultEdgeInsertButton,
  DefaultPlaceholderBox,
  removeNodeForRemovalPolicy,
} from "./graph-canvas.js";
import type { GraphCanvasProps, PhantomPlaceholder } from "./graph-canvas.js";
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

  it("keeps the hidden and inert handles on the same side as a painted one", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 10, y: 20 } });

    const hidden = renderCanvas(engine, {
      layoutDirection: "vertical",
      portsPolicy: "hidden",
    });
    expect(hidden.container.querySelector("[data-handlepos='top']")).not.toBeNull();
    expect(hidden.container.querySelector("[data-handlepos='bottom']")).not.toBeNull();
    expect(hidden.container.querySelector("[data-handlepos='left']")).toBeNull();
    expect(hidden.container.querySelector("[data-handlepos='right']")).toBeNull();
    cleanup();

    const inert = renderCanvas(engine, {
      layoutDirection: "vertical",
      connectionsPolicy: "fixed",
    });
    expect(inert.container.querySelector("[data-handlepos='top']")).not.toBeNull();
    expect(inert.container.querySelector("[data-handlepos='bottom']")).not.toBeNull();
    expect(inert.container.querySelector("[data-handlepos='left']")).toBeNull();
    cleanup();
  });

  it("anchors a hidden handle on the border of the side it occupies", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 10, y: 20 } });

    const { container } = renderCanvas(engine, {
      layoutDirection: "vertical",
      portsPolicy: "hidden",
    });

    const top = container.querySelector("[data-handlepos='top']") as HTMLElement;
    expect(top.style.top).toBe("0px");
    expect(top.style.bottom).toBe("auto");
    expect(top.style.getPropertyValue("transform")).toBe("translateX(-50%)");
    cleanup();
  });

  it("draws the port handles on the axis the declared layout grows along", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 10, y: 20 } });

    const horizontal = renderCanvas(engine);
    expect(horizontal.container.querySelector("[data-handlepos='left']")).not.toBeNull();
    expect(horizontal.container.querySelector("[data-handlepos='right']")).not.toBeNull();
    expect(horizontal.container.querySelector("[data-handlepos='top']")).toBeNull();
    cleanup();

    const vertical = renderCanvas(engine, { layoutDirection: "vertical" });
    expect(vertical.container.querySelector("[data-handlepos='top']")).not.toBeNull();
    expect(vertical.container.querySelector("[data-handlepos='bottom']")).not.toBeNull();
    expect(vertical.container.querySelector("[data-handlepos='left']")).toBeNull();
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

    it("commitDraggedNodes yields one undo unit per dragged node (documented phase-3 limitation)", () => {
      const engine = makeEngine();
      addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
      addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 10, y: 0 } });
      const before = engine.history.size();

      commitDraggedNodes(engine, [
        { id: "n1", position: { x: 100, y: 0 } },
        { id: "n2", position: { x: 200, y: 0 } },
      ]);

      expect(engine.graph.getNode(createNodeId("n1"))?.position).toEqual({ x: 100, y: 0 });
      expect(engine.graph.getNode(createNodeId("n2"))?.position).toEqual({ x: 200, y: 0 });

      // The documented contract: grouping a whole multi-node drag into ONE
      // history unit is not supported yet, so a two-node drag adds EXACTLY
      // two undo units (never one, never more).
      expect(engine.history.size()).toBe(before + 2);

      // ...and therefore a single undo moves exactly one node back.
      expect(undo(engine)).toBe(true);
      expect(engine.graph.getNode(createNodeId("n2"))?.position).toEqual({ x: 10, y: 0 });
      expect(engine.graph.getNode(createNodeId("n1"))?.position).toEqual({ x: 100, y: 0 });
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

/* ------------------------------------------------------------------ */
/*  F2: canvas background is token-driven (theme contract)             */
/* ------------------------------------------------------------------ */

describe("GraphCanvas canvas background", () => {
  afterEach(cleanup);

  it("paints the dot pattern with the canvas.backgroundDot token reference", () => {
    const engine = makeEngine();
    renderCanvas(engine);

    // React Flow's `<Background color>` lands on its SVG element as the
    // `--xy-background-pattern-color-props` custom property, so the token
    // reference is observable in the rendered DOM.
    const background = screen.getByTestId("rf__background");
    expect(background.style.getPropertyValue("--xy-background-pattern-color-props")).toBe(
      "var(--ndr-canvas-background-dot, #cbd5e1)",
    );
  });

  it("uses the documented numeric dot gap, because a CSS variable cannot feed gap", () => {
    const engine = makeEngine();
    renderCanvas(engine);

    // The rendered `<pattern>` is the dot grid itself: its size is the gap the
    // canvas passes to React Flow (zoom is 1 in jsdom).
    const pattern = screen.getByTestId("rf__background").querySelector("pattern");
    expect(pattern).not.toBeNull();
    expect(pattern?.getAttribute("width")).toBe("16");

    // `canvas.backgroundDotSize` is a CSS *token string*, while React Flow's
    // `gap` prop is numeric: the adapter owns the numeric default and states
    // it once, in `canvasBackgroundOptions()`.
    expect(canvasBackgroundOptions()).toEqual({
      variant: "dots",
      gap: 16,
      color: "var(--ndr-canvas-background-dot, #cbd5e1)",
    });
  });
});

/* ------------------------------------------------------------------ */
/*  F3: interaction mode (S5 "Modo de interacción")                    */
/* ------------------------------------------------------------------ */

describe("GraphCanvas interaction mode", () => {
  afterEach(cleanup);

  // React Flow does not expose its resolved `panOnDrag`/`selectionOnDrag`
  // props to jsdom, so the numeric/boolean mapping itself is asserted by
  // `interaction-mode.test.ts` through the pure helper. These cases prove
  // the canvas accepts every mode and keeps rendering.
  it("renders the graph in select mode", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    renderCanvas(engine, { interactionMode: "select" });
    expect(screen.getByText("App Node")).toBeDefined();
  });

  it("renders the graph in pan mode", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    renderCanvas(engine, { interactionMode: "pan" });
    expect(screen.getByText("App Node")).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  F4: custom EDGE renderer replacement (S3 level 2)                  */
/* ------------------------------------------------------------------ */

/**
 * React Flow v12 renders an edge only once it can resolve the source/target
 * handle bounds of both nodes; jsdom reports zero-sized elements, so no edge
 * is ever attached to the DOM in this environment (verified: an edge renders
 * no `path.react-flow__edge-path` at all). The edge replacement contract is
 * therefore asserted where the canvas actually resolves it: `canvasEdgeTypes`
 * — the map it hands to `<ReactFlow edgeTypes>` — plus a canvas-level case
 * proving the registry prop is accepted and the graph keeps rendering.
 */
describe("GraphCanvas edge renderer replacement", () => {
  afterEach(cleanup);

  const CustomEdge = ((props: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
  }) =>
    createElement("path", {
      "data-testid": "custom-edge-marker",
      d: `M${props.sourceX},${props.sourceY}L${props.targetX},${props.targetY}`,
    })) as never;

  function makeEdgeEngine(): EditorEngine {
    const engine = makeEngine();
    const edgeDef = {
      id: "test.app-edge",
      name: "App Edge",
      version: "1.0.0",
      renderer: "custom-edge",
    } as unknown as EdgeDefinition;
    engine.domain.edges.register(edgeDef);
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 200, y: 0 } });
    const created = createEdge(engine, {
      source: { nodeId: "n1", portId: "out-1" },
      target: { nodeId: "n2", portId: "in-1" },
      definitionId: "test.app-edge",
    });
    if (!created.ok) {
      throw new Error("edge creation failed");
    }
    return engine;
  }

  it("maps a registered edge renderer id to a React Flow edge type", () => {
    const edgeRenderers = new EdgeRendererRegistry();
    edgeRenderers.register("custom-edge", CustomEdge);

    const types = canvasEdgeTypes(edgeRenderers);

    expect(types["custom-edge"]).toBe(CustomEdge);
    expect(types[DEFAULT_EDGE_RENDERER_ID]).toBe(DefaultEdgeRenderer);
  });

  it("leaves an unregistered renderer id out so React Flow falls back to its default edge", () => {
    const types = canvasEdgeTypes(new EdgeRendererRegistry());

    expect(types["custom-edge"]).toBeUndefined();
    expect(types[DEFAULT_EDGE_RENDERER_ID]).toBe(DefaultEdgeRenderer);
  });

  it("renders a graph whose edge definition names a custom renderer id", () => {
    const engine = makeEdgeEngine();
    const edgeRenderers = new EdgeRendererRegistry();
    edgeRenderers.register("custom-edge", CustomEdge);

    renderCanvas(engine, { edgeRenderers });

    expect(screen.getAllByText("App Node")).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/*  B: drag policy (S5)                                                */
/* ------------------------------------------------------------------ */

describe("GraphCanvas drag policy", () => {
  /** The React Flow node wrapper, which carries its own `draggable` class. */
  function nodeElement(container: HTMLElement, nodeId: string): HTMLElement {
    const element = container.querySelector(`[data-testid="rf__node-${nodeId}"]`);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`node ${nodeId} was not rendered`);
    }
    return element;
  }

  function seededEngine(): EditorEngine {
    const engine = makeEngine();
    addNode(engine, {
      definitionId: "test.app-node",
      nodeId: "n1",
      position: { x: 0, y: 0 },
    });
    return engine;
  }

  it("refuses the drag itself under the locked policy", () => {
    const engine = seededEngine();
    const { container } = renderCanvas(engine, { dragPolicy: "locked" });

    // React Flow only adds the `draggable` class to a node it will drag.
    expect(nodeElement(container, "n1").classList.contains("draggable")).toBe(false);
  });

  it("does not commit a drag under the locked policy", () => {
    const engine = seededEngine();
    const historyBefore = engine.history.size();

    commitDraggedNodes(engine, [{ id: "n1", position: { x: 120, y: 80 } }], "locked");

    expect(engine.graph.getNode(createNodeId("n1"))?.position).toEqual({ x: 0, y: 0 });
    expect(engine.history.size()).toBe(historyBefore);
  });

  it("lets the node follow the pointer but discards the drag under the snap-back policy", () => {
    const engine = seededEngine();
    const { container } = renderCanvas(engine, { dragPolicy: "snap-back" });
    const historyBefore = engine.history.size();

    expect(nodeElement(container, "n1").classList.contains("draggable")).toBe(true);

    commitDraggedNodes(engine, [{ id: "n1", position: { x: 120, y: 80 } }], "snap-back");

    // The document keeps its assigned position and no history entry is pushed.
    expect(engine.graph.getNode(createNodeId("n1"))?.position).toEqual({ x: 0, y: 0 });
    expect(engine.history.size()).toBe(historyBefore);
  });

  it("commits one position and one history unit under the free policy", () => {
    const engine = seededEngine();
    const historyBefore = engine.history.size();

    commitDraggedNodes(engine, [{ id: "n1", position: { x: 120, y: 80 } }], "free");

    expect(engine.graph.getNode(createNodeId("n1"))?.position).toEqual({ x: 120, y: 80 });
    expect(engine.history.size()).toBe(historyBefore + 1);
  });

  it("keeps today's drag behaviour when the host declares no policy", () => {
    const engine = seededEngine();
    const { container } = renderCanvas(engine);
    const historyBefore = engine.history.size();

    expect(nodeElement(container, "n1").classList.contains("draggable")).toBe(true);

    commitDraggedNodes(engine, [{ id: "n1", position: { x: 120, y: 80 } }]);

    expect(engine.graph.getNode(createNodeId("n1"))?.position).toEqual({ x: 120, y: 80 });
    expect(engine.history.size()).toBe(historyBefore + 1);
  });

  it("follows a policy the host switches without rebuilding the canvas", () => {
    const engine = seededEngine();
    const { container, rerender } = renderCanvas(engine, { dragPolicy: "free" });
    expect(nodeElement(container, "n1").classList.contains("draggable")).toBe(true);

    rerender(createElement(Canvas, { editor: engine, dragPolicy: "locked" }));

    expect(nodeElement(container, "n1").classList.contains("draggable")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  B2: live drag positions (canvas state)                             */
/* ------------------------------------------------------------------ */

/**
 * The positions a drag reports are painted by the canvas itself, because a
 * controlled `<ReactFlow nodes={...}>` (`hasDefaultNodes === false`) applies no
 * position change on its own: it reports every intermediate position through
 * `onNodesChange` and expects the host to paint it. These tests deliver the
 * changes through the live React Flow store (`triggerNodeChanges`) — the exact
 * path a real drag takes — instead of calling the canvas's state setters.
 */
describe("GraphCanvas live drag positions", () => {
  type FlowStore = ReturnType<typeof useStoreApi>;

  /** The React Flow node wrapper, which carries the painted position. */
  function nodeElement(container: HTMLElement, nodeId: string): HTMLElement {
    const element = container.querySelector(`[data-testid="rf__node-${nodeId}"]`);
    if (!(element instanceof HTMLElement)) {
      throw new Error(`node ${nodeId} was not rendered`);
    }
    return element;
  }

  /** The transform React Flow paints on a node wrapper, i.e. where it is drawn. */
  function paintedPosition(container: HTMLElement, nodeId: string): string {
    return nodeElement(container, nodeId).style.transform;
  }

  /** Captures the store of the surrounding provider, like a host probe would. */
  function StoreProbe(props: { readonly capture: (store: FlowStore) => void }): null {
    props.capture(useStoreApi());
    return null;
  }

  function seededEngine(): EditorEngine {
    const engine = makeEngine();
    addNode(engine, {
      definitionId: "test.app-node",
      nodeId: "n1",
      position: { x: 0, y: 0 },
    });
    return engine;
  }

  /**
   * Render the canvas beside a store probe inside ONE `ReactFlowProvider`, so
   * the probe and the canvas share the store a real drag writes to.
   */
  function renderWithStore(engine: EditorEngine, props?: Partial<GraphCanvasProps>) {
    const store: { current: FlowStore | undefined } = { current: undefined };
    const rendered = render(
      createElement(
        "div",
        { style: { width: 800, height: 600 } },
        createElement(
          ReactFlowProvider,
          null,
          createElement(GraphCanvas, { editor: engine, ...props }),
          createElement(StoreProbe, {
            capture: (captured: FlowStore) => {
              store.current = captured;
            },
          }),
        ),
      ),
    );

    return {
      ...rendered,
      /** Deliver node changes through the live store, like React Flow does. */
      deliver(changes: NodeChange[]): void {
        const flowStore = store.current;
        if (flowStore === undefined) {
          throw new Error("the React Flow store was not captured");
        }
        act(() => {
          flowStore.getState().triggerNodeChanges(changes);
        });
      },
    };
  }

  it("paints the position a live drag reports", () => {
    const engine = seededEngine();
    const { container, deliver } = renderWithStore(engine, { dragPolicy: "snap-back" });

    // The document owns the position before the drag.
    expect(paintedPosition(container, "n1")).toBe("translate(0px,0px)");

    deliver([
      { id: "n1", type: "position", position: { x: 120, y: 80 }, dragging: true },
    ]);

    // The node follows the pointer, even though React Flow applied nothing.
    expect(paintedPosition(container, "n1")).toBe("translate(120px,80px)");
  });

  it("writes nothing to the document while the drag is live", () => {
    const engine = seededEngine();
    const historyBefore = engine.history.size();
    const { deliver } = renderWithStore(engine, { dragPolicy: "snap-back" });

    deliver([
      { id: "n1", type: "position", position: { x: 120, y: 80 }, dragging: true },
    ]);

    expect(engine.graph.getNode(createNodeId("n1"))?.position).toEqual({ x: 0, y: 0 });
    expect(engine.history.size()).toBe(historyBefore);
  });

  it("paints only the node the changes report", () => {
    const engine = seededEngine();
    const { container, deliver } = renderWithStore(engine, { dragPolicy: "snap-back" });

    deliver([
      { id: "not-in-the-document", type: "position", position: { x: 120, y: 80 }, dragging: true },
    ]);

    expect(paintedPosition(container, "n1")).toBe("translate(0px,0px)");
  });

  it("keeps no position from the release", () => {
    const engine = seededEngine();
    const { container, deliver } = renderWithStore(engine, { dragPolicy: "snap-back" });

    deliver([
      { id: "n1", type: "position", position: { x: 120, y: 80 }, dragging: false },
    ]);

    // The release is not a live position: painting it would leave the node at
    // the pointer instead of the position the document holds.
    expect(paintedPosition(container, "n1")).toBe("translate(0px,0px)");
  });
});

/* ------------------------------------------------------------------ */
/*  B3: node transition                                                */
/* ------------------------------------------------------------------ */

describe("GraphCanvas node transition", () => {
  /** The canvas frame: the element that carries the container attributes. */
  function frame(container: HTMLElement): HTMLElement {
    const element = container.querySelector("[data-color-mode]");
    if (!(element instanceof HTMLElement)) {
      throw new Error("the canvas frame was not rendered");
    }
    return element;
  }

  function transitionRule(container: HTMLElement): string {
    const style = container.querySelector("style[data-nodera-node-transition]");
    return style?.textContent ?? "";
  }

  function seededEngine(): EditorEngine {
    const engine = makeEngine();
    addNode(engine, {
      definitionId: "test.app-node",
      nodeId: "n1",
      position: { x: 0, y: 0 },
    });
    return engine;
  }

  it("paints node moves at once when the host asks for no transition", () => {
    const { container } = renderCanvas(seededEngine(), { dragPolicy: "snap-back" });

    expect(transitionRule(container)).toBe("");
    expect(frame(container).classList.contains("nodera-node-transitions")).toBe(false);
  });

  it("animates node moves when the host declares the animated transition", () => {
    const { container } = renderCanvas(seededEngine(), {
      dragPolicy: "snap-back",
      nodeTransition: "animated",
    });
    const rule = transitionRule(container);

    expect(frame(container).classList.contains("nodera-node-transitions")).toBe(true);
    expect(rule).toContain(".nodera-node-transitions .react-flow__node");
    // A node that is being dragged keeps following the pointer: no transition.
    expect(rule).toContain(":not(.dragging)");
    expect(rule).toContain("transition: transform");
  });

  it("follows a transition the host switches without rebuilding the canvas", () => {
    const engine = seededEngine();
    const { container, rerender } = renderCanvas(engine, { nodeTransition: "animated" });
    expect(transitionRule(container)).not.toBe("");

    rerender(createElement(Canvas, { editor: engine, nodeTransition: "instant" }));

    expect(transitionRule(container)).toBe("");
    expect(frame(container).classList.contains("nodera-node-transitions")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  C2: edge insert affordance (S6)                                    */
/* ------------------------------------------------------------------ */

/**
 * React Flow renders no edge at all in jsdom (it never resolves the handle
 * bounds of a measured node), so — exactly like the edge-renderer replacement
 * contract above — the affordance is asserted where the canvas resolves it: the
 * edge type map `canvasEdgeTypes` hands to `<ReactFlow edgeTypes>`, rendered
 * inside a real `<ReactFlow>` so `EdgeLabelRenderer` has its portal.
 */
describe("GraphCanvas edge insert affordance", () => {
  afterEach(cleanup);

  const EDGE_PROPS: Record<string, unknown> = {
    id: "edge-1",
    source: "n1",
    target: "n2",
    sourceX: 0,
    sourceY: 0,
    targetX: 200,
    targetY: 100,
    sourceHandle: "out",
    targetHandle: "in",
    selected: false,
    data: {},
  };

  function insertStore(): UiStateStore {
    const dialogs = new DialogRegistry();
    dialogs.register(CREATE_NODE_DIALOG);
    return new UiStateStore({
      themeId: "nodera.light",
      layoutId: "nodera.editor",
      dialogRegistry: dialogs,
    });
  }

  /** Renders one edge type the canvas would use, inside a real React Flow. */
  function renderEdgeType(options: {
    readonly render?: (edgeId: string) => ReactNode;
    readonly edgeRenderers?: EdgeRendererRegistry;
    readonly store?: UiStateStore;
  }) {
    const types = canvasEdgeTypes(
      options.edgeRenderers,
      options.render === undefined ? undefined : { render: options.render },
    );
    const EdgeComponent = types[DEFAULT_EDGE_RENDERER_ID] as unknown as FC<
      Record<string, unknown>
    >;
    return render(
      <NoderaUiProvider store={options.store ?? insertStore()} editor={makeEngine()}>
        <ReactFlowProvider>
          <ReactFlow nodes={[]} edges={[]}>
            <EdgeComponent {...EDGE_PROPS} />
          </ReactFlow>
        </ReactFlowProvider>
      </NoderaUiProvider>,
    );
  }

  it("renders one accessible insert button per edge when the affordance is enabled", () => {
    renderEdgeType({ render: (edgeId) => createElement(DefaultEdgeInsertButton, { edgeId }) });

    const buttons = screen.getAllByRole("button", { name: "Insert node" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.getAttribute("type")).toBe("button");
    expect(buttons[0]?.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("renders no insert button when the affordance is disabled", () => {
    const types = canvasEdgeTypes();
    // Disabled means untouched: the canvas keeps the registered renderer as-is.
    expect(types[DEFAULT_EDGE_RENDERER_ID]).toBe(DefaultEdgeRenderer);

    renderEdgeType({});

    expect(screen.queryByRole("button", { name: "Insert node" })).toBeNull();
  });

  it("keeps the insert button keyboard reachable", () => {
    renderEdgeType({ render: (edgeId) => createElement(DefaultEdgeInsertButton, { edgeId }) });

    const button = screen.getByRole("button", { name: "Insert node" });
    button.focus();

    expect(document.activeElement).toBe(button);
  });

  it("renders the host component instead of the default button when supplied", () => {
    renderEdgeType({
      render: (edgeId) =>
        createElement("button", { type: "button", "aria-label": `Insert on ${edgeId}` }, "·"),
    });

    expect(screen.getByRole("button", { name: "Insert on edge-1" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Insert node" })).toBeNull();
  });

  it("wraps every registered edge renderer, never only the default one", () => {
    const edgeRenderers = new EdgeRendererRegistry();
    edgeRenderers.register("custom-edge", DefaultEdgeRenderer as never);

    const raw = canvasEdgeTypes(edgeRenderers);
    const withInsert = canvasEdgeTypes(edgeRenderers, {
      render: () => createElement(DefaultEdgeInsertButton, { edgeId: "edge-1" }),
    });

    expect(withInsert["custom-edge"]).not.toBe(raw["custom-edge"]);
    expect(withInsert[DEFAULT_EDGE_RENDERER_ID]).not.toBe(raw[DEFAULT_EDGE_RENDERER_ID]);
  });

  it("wraps the geometry-mapped built-in edge types when the affordance is on", () => {
    // A definition that declares a geometry resolves to a React Flow built-in
    // type ("default", "straight", "step", "smoothstep"); if those stay out of
    // the map, React Flow renders its own unwrapped edge and the affordance
    // disappears exactly on the edges that declare a geometry.
    const withInsert = canvasEdgeTypes(undefined, {
      render: () => createElement(DefaultEdgeInsertButton, { edgeId: "edge-1" }),
    });

    for (const builtIn of ["default", "straight", "step", "smoothstep"]) {
      expect(typeof withInsert[builtIn]).toBe("function");
      expect(withInsert[builtIn]).not.toBe(DefaultEdgeRenderer);
    }
  });

  it("leaves the built-in edge types to React Flow when the affordance is off", () => {
    const types = canvasEdgeTypes(undefined);

    expect(types["default"]).toBeUndefined();
    expect(types["straight"]).toBeUndefined();
    expect(types["step"]).toBeUndefined();
    expect(types["smoothstep"]).toBeUndefined();
  });

  it("records the pending insertion and opens the dialog when activated", () => {
    const store = insertStore();
    renderEdgeType({
      render: () => createElement(DefaultEdgeInsertButton, { edgeId: "edge-1" }),
      store,
    });

    fireEvent.click(screen.getByRole("button", { name: "Insert node" }));

    expect(store.getState().pendingEdgeInsertId).toBe("edge-1");
    expect(store.getState().activeDialogId).toBe(NODERA_CREATE_NODE_DIALOG_ID);
  });

  it("keeps rendering the graph when the canvas is asked for the affordance", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });

    render(
      <NoderaUiProvider store={insertStore()} editor={engine}>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowProvider>
            <GraphCanvas editor={engine} edgeInsertion />
          </ReactFlowProvider>
        </div>
      </NoderaUiProvider>,
    );

    expect(screen.getByText("App Node")).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  D: phantom placeholders (S7 empty state, S21 successors)           */
/* ------------------------------------------------------------------ */

/**
 * The placeholders are presentation only, and they are drawn as an **overlay**
 * (`ViewportPortal`): never as React Flow nodes, never as React Flow edges.
 *
 * They are asserted at the three boundaries that own them: the pure derivation
 * (`canvasPlaceholders`) for the geometry and the leaf rule, the rendered canvas
 * for what a person sees, and the store React Flow populated for what the canvas
 * handed it. That last one is the regression this unit exists for: a placeholder
 * appended to React Flow's `nodes` array is an element whose handles React Flow
 * cannot resolve, and it silently empties the whole edge layer. jsdom paints no
 * edge at all (see the C2 and F4 notes above), so the edge count is read from the
 * store React Flow filled instead of from the unmounted SVG layer, and the
 * painted node layer is counted in the DOM.
 */
describe("GraphCanvas phantom placeholders", () => {
  afterEach(cleanup);

  /** A definition with inputs only: a node that can never be continued. */
  const sinkDef = {
    id: "test.sink-node",
    name: "Sink Node",
    version: "1.0.0",
    category: "test",
    ports: [{ id: "in-1", name: "In", direction: "input" }],
    properties: [],
  } as unknown as NodeDefinition;

  function placeholderStore(): UiStateStore {
    const dialogs = new DialogRegistry();
    dialogs.register(CREATE_NODE_DIALOG);
    return new UiStateStore({
      themeId: "nodera.light",
      layoutId: "nodera.editor",
      dialogRegistry: dialogs,
    });
  }

  function renderPlaceholders(
    engine: EditorEngine,
    store: UiStateStore,
    props: Partial<GraphCanvasProps> = {},
  ) {
    return render(
      <NoderaUiProvider store={store} editor={engine}>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowProvider>
            <GraphCanvas editor={engine} edgeInsertion {...props} />
          </ReactFlowProvider>
        </div>
      </NoderaUiProvider>,
    );
  }

  /** Reads what the canvas handed React Flow: a sibling of it, same store. */
  function FlowProbe(props: {
    readonly report: (ids: {
      readonly nodes: readonly string[];
      readonly edges: readonly string[];
    }) => void;
  }): null {
    const nodes = useNodes();
    const edges = useEdges();
    props.report({
      nodes: nodes.map((node) => node.id),
      edges: edges.map((edge) => edge.id),
    });
    return null;
  }

  /** What React Flow holds while the placeholders are drawn. */
  function flowContents(
    engine: EditorEngine,
    props: Partial<GraphCanvasProps> = {},
  ): { readonly nodes: readonly string[]; readonly edges: readonly string[] } {
    const seen = { nodes: [] as readonly string[], edges: [] as readonly string[] };
    render(
      <NoderaUiProvider store={placeholderStore()} editor={engine}>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowProvider>
            <GraphCanvas editor={engine} edgeInsertion {...props} />
            <FlowProbe
              report={(ids) => {
                seen.nodes = ids.nodes;
                seen.edges = ids.edges;
              }}
            />
          </ReactFlowProvider>
        </div>
      </NoderaUiProvider>,
    );
    return seen;
  }

  function placeholdersOf(container: HTMLElement): readonly HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>("[data-nodera-phantom-node]")];
  }

  it("paints the successor box exactly at the anchor node's measured size", () => {
    // A successor box is derived from the anchor node's measured dimensions, so
    // the painted box must not grow beyond it with min sizes of its own — or
    // the ghost stops lining up with the rank the real nodes form.
    const placeholder: PhantomPlaceholder = {
      anchorId: "n1",
      kind: "successor",
      box: { x: 240, y: 0, width: 120, height: 27 },
      connectors: [{ x: 120, y: 13, length: 120, axis: "horizontal" }],
    };

    const store = new UiStateStore({
      themeId: "nodera.light",
      layoutId: "nodera.editor",
      dialogRegistry: new DialogRegistry(),
    });
    const content = createElement(DefaultPlaceholderBox, { placeholder });
    const { container } = render(
      createElement(NoderaUiProvider, { store, children: content }),
    );
    const box = container.querySelector<HTMLElement>("[data-nodera-phantom-node]");

    expect(box?.style.width).toBe("120px");
    expect(box?.style.height).toBe("27px");
    expect(box?.style.minWidth).toBe("120px");
    expect(box?.style.minHeight).toBe("27px");
    expect(box?.style.boxSizing).toBe("border-box");
  });

  function successorsOf(container: HTMLElement): readonly HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>("[data-nodera-phantom-kind='successor']")];
  }

  function twoConnectedNodes(engine: EditorEngine = makeEngine()): EditorEngine {
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 240, y: 0 } });
    createEdge(engine, {
      source: { nodeId: "n1", portId: "out-1" },
      target: { nodeId: "n2", portId: "in-1" },
    });
    return engine;
  }

  it("derives one placeholder at the origin for an empty graph", () => {
    const placeholders = canvasPlaceholders({ enabled: true, nodes: [], edges: [] });

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]?.kind).toBe("empty-state");
    expect(placeholders[0]?.anchorId).toBeUndefined();
    expect(placeholders[0]?.box).toEqual({ x: 0, y: 0, width: 140, height: 40 });
    // There is no node to connect from, so there is nothing to join.
    expect(placeholders[0]?.connectors).toEqual([]);
  });

  it("derives the empty-state placeholder one step past the single node", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      nodes: [{ id: "n1", position: { x: 40, y: 80 } }],
      edges: [],
    });

    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]?.anchorId).toBe("n1");
    // One step (240 flow units) past the node's box, on the declared axis.
    expect(placeholders[0]?.box).toEqual({ x: 280, y: 80, width: 140, height: 40 });
    expect(placeholders[0]?.connectors).toEqual([
      {
        x: 180,
        y: 100,
        length: 100,
        axis: "horizontal",
      },
    ]);
  });

  it("derives one placeholder per leaf and none for a node with a successor", () => {
    const connected = canvasPlaceholders({
      enabled: true,
      nodes: [
        { id: "n1", position: { x: 0, y: 0 }, ports: [{ direction: "output" }] },
        { id: "n2", position: { x: 240, y: 0 }, ports: [{ direction: "output" }] },
      ],
      edges: [{ source: "n1", target: "n2" }],
    });
    expect(connected.map((placeholder) => placeholder.anchorId)).toEqual(["n2"]);
    expect(connected[0]?.kind).toBe("successor");

    const apart = canvasPlaceholders({
      enabled: true,
      nodes: [
        { id: "n1", position: { x: 0, y: 0 }, ports: [{ direction: "output" }] },
        { id: "n2", position: { x: 240, y: 0 }, ports: [{ direction: "output" }] },
      ],
      edges: [],
    });
    expect(apart.map((placeholder) => placeholder.anchorId)).toEqual(["n1", "n2"]);
  });

  it("derives nothing for a leaf with no source-capable port", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      nodes: [
        { id: "n1", position: { x: 0, y: 0 }, ports: [{ direction: "output" }] },
        { id: "n2", position: { x: 240, y: 0 }, ports: [{ direction: "input" }] },
      ],
      edges: [{ source: "n1", target: "n2" }],
    });

    // The affordance must never promise an insertion the graph cannot perform.
    expect(placeholders).toEqual([]);
  });

  it("derives nothing when the affordance is disabled", () => {
    const placeholders = canvasPlaceholders({
      enabled: false,
      nodes: [{ id: "n1", position: { x: 0, y: 0 } }],
      edges: [],
    });

    expect(placeholders).toEqual([]);
  });

  it("steps along the axis the host declares", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      nodes: [{ id: "n1", position: { x: 40, y: 80 } }],
      edges: [],
    });

    expect(placeholders[0]?.box).toEqual({ x: 40, y: 320, width: 140, height: 40 });
    expect(placeholders[0]?.connectors).toEqual([
      {
        x: 110,
        y: 120,
        length: 200,
        axis: "vertical",
      },
    ]);
  });

  /*
   * A placeholder occupies a slot like a node does: it never overlaps a real
   * node or another placeholder (user report: "los nodos fantasma del modo
   * layered no deben taparse con otros nodos. Son nodos como tal asi que no
   * deben solaparse"), and it **takes a slot in its anchor's rank band** instead
   * of walking away from the node it belongs to (user report: the ghost takes
   * the space of a normal node, "lo digo para el cálculo de posición"). The search
   * is therefore: the anchor's own column, then one lane either side of it on
   * the same flow line, and only when the whole flow line is blocked the forward
   * walk down the column. Every assertion below reads the chosen boxes by
   * x/y/width/height instead of trusting a rendering.
   */

  /** Box in flow coordinates, as the derivation reports it. */
  interface Box {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }

  /** A leaf that can be continued: an output port is what the "+" needs. */
  function leaf(id: string, x: number, y: number) {
    return { id, position: { x, y }, ports: [{ direction: "output" as const }] };
  }

  /** Whether two boxes share any area at all. */
  function intersects(a: Box, b: Box): boolean {
    return (
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height
    );
  }

  /** The chosen boxes, in the order the derivation reports them. */
  function boxesOf(placeholders: readonly { readonly box: Box }[]): readonly Box[] {
    return placeholders.map((placeholder) => placeholder.box);
  }

  /** The box at `index`, refusing to continue when the derivation returned none. */
  function boxAt(placeholders: readonly { readonly box: Box }[], index: number): Box {
    const box = placeholders[index]?.box;
    if (box === undefined) {
      throw new Error(`the derivation returned no placeholder at index ${String(index)}`);
    }
    return box;
  }

  it("slides the placeholder one lane aside from the node its first step would land on", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      nodes: [
        leaf("n1", 0, 0),
        // A real node exactly where n1's first step lands. It carries no output
        // port, so this case isolates the collision rule from the leaf rule.
        { id: "n2", position: { x: 240, y: 0 } },
      ],
      edges: [],
    });

    // The same flow line, one cross step below: the ghost stays in the rank band
    // instead of continuing past the node that took its column.
    expect(boxesOf(placeholders)).toEqual([{ x: 240, y: -280, width: 140, height: 40 }]);
    const slid = boxAt(placeholders, 0);
    expect(intersects(slid, { x: 240, y: 0, width: 140, height: 40 })).toBe(false);
    expect(intersects(slid, { x: 0, y: 0, width: 140, height: 40 })).toBe(false);
    // The line reaches the box: one run along the axis, then one along the lane.
    expect(placeholders[0]?.connectors).toEqual([
      { x: 140, y: 20, length: 100, axis: "horizontal" },
      { x: 240, y: -240, length: 260, axis: "vertical" },
    ]);
  });

  it("gives two leaves whose first-step placeholders would collide distinct free slots", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      // Both leaves would step to x = 240, i.e. one on top of the other.
      nodes: [leaf("n1", 0, 0), leaf("n2", 240, 0)],
      edges: [],
    });

    // The first leaf takes the lane its walk reaches first (below); the second
    // one still has its own column free.
    expect(boxesOf(placeholders)).toEqual([
      { x: 240, y: -280, width: 140, height: 40 },
      { x: 480, y: 0, width: 140, height: 40 },
    ]);
    // Neither placeholder sits on a node or on the other placeholder.
    const first = boxAt(placeholders, 0);
    const second = boxAt(placeholders, 1);
    const occupiedNode = { x: 240, y: 0, width: 140, height: 40 };
    expect(intersects(first, second)).toBe(false);
    expect(intersects(first, occupiedNode)).toBe(false);
    expect(intersects(second, occupiedNode)).toBe(false);
  });

  it("spans the connector from the node's far edge to the box that was chosen", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      nodes: [leaf("n1", 0, 0), { id: "n2", position: { x: 240, y: 0 } }],
      edges: [],
    });

    const box = boxAt(placeholders, 0);
    const [flow] = placeholders[0]?.connectors ?? [];
    // The dashed line starts where the node ends (140, 20) and stops where the
    // box's flow band begins, so it never draws over the node that blocked the
    // first candidate.
    expect(flow).toEqual({ x: 140, y: 20, length: 100, axis: "horizontal" });
    expect((flow?.x ?? 0) + (flow?.length ?? 0)).toBe(box.x);
  });

  it("derives the same slots whatever order the nodes arrive in", () => {
    const nodes = [leaf("n1", 0, 0), leaf("n2", 240, 0)];

    const forward = canvasPlaceholders({ enabled: true, nodes, edges: [] });
    const reversed = canvasPlaceholders({ enabled: true, nodes: [...nodes].reverse(), edges: [] });

    expect(reversed).toEqual(forward);
  });

  it("keeps today's positions when nothing overlaps", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      // Two leaves on different rows: each first step is already free.
      nodes: [leaf("n1", 0, 0), leaf("n2", 0, 200)],
      edges: [],
    });

    expect(boxesOf(placeholders)).toEqual([
      { x: 240, y: 0, width: 140, height: 40 },
      { x: 240, y: 200, width: 140, height: 40 },
    ]);
  });

  /*
   * The reported defect (user report: "el último nodo de la rama izquierda choca
   * con el fantasma de la derecha … el fantasma ocupa el mismo espacio que un
   * nodo normal — lo digo para el cálculo de posición"): in the layered demo the
   * last node of one branch is alone in its rank, so the centring rule parks its
   * box at the midpoint between the two columns — 120, i.e. 20 flow units inside
   * the column of the other branch's leaf. The placeholder must not overlap it,
   * and it must not walk away from its anchor either: it takes the lane beside
   * it, in the same rank band.
   */
  it("takes the lane beside a lone node centred between the columns", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      nodes: [
        // Right column's leaf: its first step lands on `y: 240`.
        leaf("n2", 240, 0),
        // Alone in the next rank, centred between the columns at `x: 120`.
        { id: "n3", position: { x: 120, y: 280 } },
      ],
      edges: [],
    });

    // The lane lands one cross pitch (140 + 240) away, where the previous column
    // ends, which keeps it clear of n3 (120..260) — and on the flow line of the
    // first step, not one step below.
    expect(boxesOf(placeholders)).toEqual([{ x: -140, y: 240, width: 140, height: 40 }]);
    const loneNode = { x: 120, y: 280, width: 140, height: 40 };
    expect(intersects(boxAt(placeholders, 0), loneNode)).toBe(false);
    // The line spans the real distance to the chosen slot: down, then aside.
    expect(placeholders[0]?.connectors).toEqual([
      { x: 310, y: 40, length: 200, axis: "vertical" },
      { x: 0, y: 240, length: 310, axis: "horizontal" },
    ]);
  });

  /**
   * The demo's graph, with the sizes and pitches its controls hold: boxes 158
   * wide and 34 tall (`min-width: 140px`, `padding: 8px` and a 1px border),
   * `spacing: 240`, `rankSpacing: 280`, `direction: "vertical"`. The cross
   * positions are a pitched grid (`0`, `120`, `240`, …) from an arrangement
   * derived before the layered strategy became box-based
   * (`docs/GRAPH-LAYOUT.md`): the derivation reads positions only, and the
   * placeholders must stay out of every box a host positioned, whatever produced
   * it. `audit` is the only leaf that can still grow, and `publish` is alone in
   * the rank of the other branch, centred at `x: 120`.
   */
  function demoBranchNodes() {
    return [
      { id: "ingest", position: { x: 120, y: 0 }, width: 158, height: 34 },
      { id: "enrich", position: { x: 0, y: 280 }, width: 158, height: 34 },
      { id: "parse", position: { x: 240, y: 280 }, width: 158, height: 34 },
      { id: "score", position: { x: 0, y: 560 }, width: 158, height: 34 },
      {
        id: "audit",
        position: { x: 240, y: 560 },
        width: 158,
        height: 34,
        ports: [{ direction: "output" as const }],
      },
      { id: "publish", position: { x: 120, y: 840 }, width: 158, height: 34 },
    ];
  }

  /**
   * The edges of {@link demoBranchNodes}: two branches from `ingest`, joined at
   * `score`, with `publish` downstream of both and `audit` its own leaf.
   */
  function demoBranchEdges() {
    return [
      { source: "ingest", target: "parse" },
      { source: "ingest", target: "enrich" },
      { source: "parse", target: "score" },
      { source: "enrich", target: "score" },
      { source: "score", target: "publish" },
      { source: "parse", target: "audit" },
    ];
  }

  /*
   * The placeholder takes the lane beside `audit`'s column in the next rank
   * band, instead of the `y: 1040` a forward-only walk would have had to reach,
   * and that lane is one cross pitch from the column: the box (158) plus the
   * gap (240).
   */
  it("keeps the demo's branch placeholder in the next rank band", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      nodes: demoBranchNodes(),
      edges: demoBranchEdges(),
    });

    expect(placeholders.map((placeholder) => placeholder.anchorId)).toEqual(["audit"]);
    // `y: 800` is the default 240 step past `audit` (its next rank band); the
    // lane lands where the previous column ends, clear of `publish`.
    expect(boxesOf(placeholders)).toEqual([{ x: -158, y: 800, width: 158, height: 34 }]);
    const loneNode = { x: 120, y: 840, width: 158, height: 34 };
    expect(intersects(boxAt(placeholders, 0), loneNode)).toBe(false);
    expect(placeholders[0]?.connectors).toEqual([
      { x: 319, y: 594, length: 206, axis: "vertical" },
      { x: 0, y: 800, length: 319, axis: "horizontal" },
    ]);
  });

  /*
   * The defect this unit exists for: the phantom of one branch and the real
   * node of the sibling branch standing in the same rank used to sit on two
   * grids — the phantom stepped a hardcoded 240 while the rank line is the
   * host's `rankSpacing` (280 in the demo) — so it floated 40 units too high.
   * The host knows both numbers, so it declares them and the phantom lands on
   * the rank line its siblings form.
   */
  it("lands the phantom on the rank line of the real node in that rank", () => {
    const nodes = demoBranchNodes();
    const publish = nodes.find((node) => node.id === "publish");
    const placeholders = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      rankSpacing: 280,
      nodeSpacing: 240,
      nodes,
      edges: demoBranchEdges(),
    });

    // Same flow coordinate as `publish` (840), differing only on the cross axis:
    // the lane left of `audit`'s column, one cross pitch (158 + 240) away.
    expect(boxesOf(placeholders)).toEqual([{ x: -158, y: 840, width: 158, height: 34 }]);
    expect(boxAt(placeholders, 0).y).toBe(publish?.position.y);
    expect(boxAt(placeholders, 0).x).not.toBe(publish?.position.x);
    expect(placeholders[0]?.connectors).toEqual([
      { x: 319, y: 594, length: 246, axis: "vertical" },
      { x: 0, y: 840, length: 319, axis: "horizontal" },
    ]);
  });

  it("keeps the legacy 240 step when the host declares no rank spacing", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      nodeSpacing: 240,
      nodes: demoBranchNodes(),
      edges: demoBranchEdges(),
    });

    // 800 = `audit`'s 560 + the adapter's documented 240, i.e. 40 units above the
    // rank line `publish` occupies: the preserve pin for a host that declares no
    // rank pitch.
    expect(boxesOf(placeholders)).toEqual([{ x: -158, y: 800, width: 158, height: 34 }]);
    expect(boxAt(placeholders, 0).y).not.toBe(840);
  });

  /*
   * The lane step is the cross pitch of the layout itself: one box of the same
   * rank plus the gap the host declares between its neighbours (`nodeSpacing`),
   * so a lane lands exactly where the next column would. One test per axis, so
   * the axis swap is pinned by the same rule rather than by a literal.
   */
  it("puts a sideways lane one cross pitch from the anchor's column on the vertical axis", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      rankSpacing: 280,
      nodeSpacing: 240,
      nodes: [
        {
          id: "n1",
          position: { x: 240, y: 0 },
          width: 158,
          height: 34,
          ports: [{ direction: "output" as const }],
        },
        // A real node in the anchor's own column, so the walk has to take a lane.
        { id: "b0", position: { x: 240, y: 280 }, width: 158, height: 34 },
      ],
      edges: [],
    });

    expect(boxesOf(placeholders)).toEqual([{ x: -158, y: 280, width: 158, height: 34 }]);
    // 240 - (158 + 240): the lane's column starts where the cross pitch ends.
    expect(240 - boxAt(placeholders, 0).x).toBe(158 + 240);
  });

  it("puts a sideways lane one cross pitch from the anchor's column on the horizontal axis", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      axis: "horizontal",
      rankSpacing: 280,
      nodeSpacing: 240,
      nodes: [
        {
          id: "n1",
          position: { x: 0, y: 240 },
          width: 158,
          height: 34,
          ports: [{ direction: "output" as const }],
        },
        { id: "b0", position: { x: 280, y: 240 }, width: 158, height: 34 },
      ],
      edges: [],
    });

    // 240 - (34 + 240): the cross extent is the height here, from the same rule.
    expect(boxesOf(placeholders)).toEqual([{ x: 280, y: -34, width: 158, height: 34 }]);
    expect(240 - boxAt(placeholders, 0).y).toBe(34 + 240);
  });

  it("grows a rank pitch too short for the box and the connector", () => {
    const vertical = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      rankSpacing: 20,
      nodes: [{ id: "n1", position: { x: 0, y: 0 }, width: 158, height: 40 }],
      edges: [],
    });

    // 20 < 40 + 24, so the step is the box plus the shortest connector: the
    // connector keeps its minimum length instead of collapsing to zero.
    expect(boxesOf(vertical)).toEqual([{ x: 0, y: 64, width: 158, height: 40 }]);
    expect(vertical[0]?.connectors).toEqual([
      { x: 79, y: 40, length: 24, axis: "vertical" },
    ]);

    const horizontal = canvasPlaceholders({
      enabled: true,
      axis: "horizontal",
      rankSpacing: 20,
      nodes: [{ id: "n1", position: { x: 0, y: 0 }, width: 140, height: 40 }],
      edges: [],
    });

    expect(boxesOf(horizontal)).toEqual([{ x: 164, y: 0, width: 140, height: 40 }]);
    expect(horizontal[0]?.connectors).toEqual([
      { x: 140, y: 20, length: 24, axis: "horizontal" },
    ]);
  });

  /*
   * The host-facing seam: `GraphCanvas` passes the two declared pitches through
   * to the derivation, so the painted box moves with them — and a host that
   * declares none keeps the documented 240.
   */
  it("steps the painted placeholder by the rank pitch the host declares", () => {
    const declaredEngine = makeEngine();
    addNode(declaredEngine, {
      definitionId: "test.app-node",
      nodeId: "n1",
      position: { x: 0, y: 0 },
    });
    const declared = placeholdersOf(
      renderPlaceholders(declaredEngine, placeholderStore(), {
        layoutDirection: "vertical",
        layoutRankSpacing: 280,
      }).container,
    )[0];

    const legacyEngine = makeEngine();
    addNode(legacyEngine, {
      definitionId: "test.app-node",
      nodeId: "n1",
      position: { x: 0, y: 0 },
    });
    const legacy = placeholdersOf(
      renderPlaceholders(legacyEngine, placeholderStore(), {
        layoutDirection: "vertical",
      }).container,
    )[0];

    expect(declared?.style.transform).toBe("translate(0px, 280px)");
    expect(legacy?.style.transform).toBe("translate(0px, 240px)");
  });

  /*
   * The lane search is symmetric and deterministic: the lower cross coordinate is
   * tried first, so a blocked side sends the placeholder to the other one, a tie
   * always resolves the same way, and the input order never moves the slot.
   */
  it("uses the free lane on either side of a blocked column", () => {
    /** One leaf whose own column is blocked, plus the lanes the case blocks. */
    function withLanes(lanes: ReadonlyArray<number>) {
      return canvasPlaceholders({
        enabled: true,
        axis: "vertical",
        nodes: [
          leaf("n1", 240, 0),
          // Own column: the first step lands flush against this node.
          { id: "b0", position: { x: 240, y: 280 } },
          ...lanes.map((x, index) => ({
            id: `b${String(index + 1)}`,
            position: { x, y: 280 },
          })),
        ],
        edges: [],
      });
    }

    // The right lane (one cross pitch, 140 + 240, away) is taken, so the left
    // one is used.
    expect(boxesOf(withLanes([620]))).toEqual([{ x: -140, y: 240, width: 140, height: 40 }]);
    // The left lane is taken, so the right one is used instead.
    expect(boxesOf(withLanes([-140]))).toEqual([{ x: 620, y: 240, width: 140, height: 40 }]);
    // Both free: the tie goes to the lower cross coordinate.
    expect(boxesOf(withLanes([]))).toEqual([{ x: -140, y: 240, width: 140, height: 40 }]);

    const reversed = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      nodes: [
        { id: "b1", position: { x: -140, y: 280 } },
        { id: "b0", position: { x: 240, y: 280 } },
        leaf("n1", 240, 0),
      ],
      edges: [],
    });
    expect(boxesOf(reversed)).toEqual(boxesOf(withLanes([-140])));
  });

  /*
   * When every lane of the flow line is blocked, the search falls back to the
   * forward walk down the anchor's own column, one whole step at a time.
   */
  it("walks forward down the column when the whole flow line is blocked", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      nodes: [
        leaf("n1", 240, 0),
        { id: "b0", position: { x: 240, y: 280 } },
        // Both lanes of the rank band, one cross pitch (140 + 240) either side.
        { id: "b1", position: { x: -140, y: 280 } },
        { id: "b2", position: { x: 620, y: 280 } },
        // One more step of the same column, so the walk has to skip it too.
        { id: "b3", position: { x: 240, y: 520 } },
      ],
      edges: [],
    });

    expect(boxesOf(placeholders)).toEqual([{ x: 240, y: 720, width: 140, height: 40 }]);
    // Back in the column, so the connector is the single straight run again.
    expect(placeholders[0]?.connectors).toEqual([
      { x: 310, y: 40, length: 680, axis: "vertical" },
    ]);
  });

  /*
   * The same geometry on the horizontal axis: the flow axis is `x` and the lane
   * axis is `y`, and the search order does not change.
   */
  it("slides to the free lane on the horizontal axis too", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      axis: "horizontal",
      nodes: [
        leaf("n1", 0, 240),
        // The next rank and the lower lane are taken; the upper lane is free.
        { id: "b0", position: { x: 280, y: 240 } },
        { id: "b1", position: { x: 280, y: 0 } },
      ],
      edges: [],
    });

    expect(boxesOf(placeholders)).toEqual([{ x: 240, y: -40, width: 140, height: 40 }]);
    expect(placeholders[0]?.connectors).toEqual([
      { x: 140, y: 260, length: 100, axis: "horizontal" },
      { x: 240, y: 0, length: 260, axis: "vertical" },
    ]);
  });

  /*
   * An accepted placeholder joins the occupied set, so the next leaf sees it as a
   * full node box: neither a lane nor a step is taken twice.
   */
  it("counts a placed placeholder as occupied for the next one", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      nodes: [
        leaf("n1", 0, 0),
        // A leaf whose own column is exactly the lane n1's placeholder takes.
        leaf("n2", 380, 0),
        // n1's first step and the lane left of it, both taken by real nodes...
        { id: "b0", position: { x: 0, y: 240 } },
        { id: "b1", position: { x: -380, y: 240 } },
      ],
      edges: [],
    });

    // ...so n1's placeholder takes the right lane, and n2's first step is n1's
    // placeholder itself, which pushes n2 one lane further right (its other lane
    // is b0's column).
    expect(placeholders.map((placeholder) => placeholder.anchorId)).toEqual(["n1", "n2"]);
    expect(boxesOf(placeholders)).toEqual([
      { x: 380, y: 240, width: 140, height: 40 },
      { x: 760, y: 240, width: 140, height: 40 },
    ]);
    expect(intersects(boxAt(placeholders, 0), boxAt(placeholders, 1))).toBe(false);
    expect(intersects(boxAt(placeholders, 1), { x: 380, y: 0, width: 140, height: 40 })).toBe(
      false,
    );
  });

  /*
   * Two leaves of one column keep their placeholders apart — one step apart or
   * two — and the lane a placeholder took stays free of both.
   */
  it("keeps two placeholders of one column apart", () => {
    const twoSteps = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      // Two leaves two steps apart (480 = 2 x 240), so both first steps are free.
      nodes: [leaf("n1", 0, 0), leaf("n2", 0, 480)],
      edges: [],
    });

    expect(boxesOf(twoSteps)).toEqual([
      { x: 0, y: 240, width: 140, height: 40 },
      { x: 0, y: 720, width: 140, height: 40 },
    ]);
    expect(intersects(boxAt(twoSteps, 0), boxAt(twoSteps, 1))).toBe(false);

    const oneRank = canvasPlaceholders({
      enabled: true,
      axis: "vertical",
      // One rank pitch apart (280): n1's first step lands flush against n2, so it
      // takes the lane beside it instead of moving down the column.
      nodes: [leaf("n1", 0, 0), leaf("n2", 0, 280)],
      edges: [],
    });

    expect(boxesOf(oneRank)).toEqual([
      { x: -380, y: 240, width: 140, height: 40 },
      { x: 0, y: 520, width: 140, height: 40 },
    ]);
    expect(intersects(boxAt(oneRank, 0), boxAt(oneRank, 1))).toBe(false);
    expect(intersects(boxAt(oneRank, 0), { x: 0, y: 280, width: 140, height: 40 })).toBe(false);
    expect(intersects(boxAt(oneRank, 1), { x: 0, y: 0, width: 140, height: 40 })).toBe(false);
  });

  it("keeps the empty-graph placeholder at the origin", () => {
    const placeholders = canvasPlaceholders({ enabled: true, nodes: [], edges: [] });

    expect(boxesOf(placeholders)).toEqual([{ x: 0, y: 0, width: 140, height: 40 }]);
    expect(placeholders[0]?.kind).toBe("empty-state");
    expect(placeholders[0]?.connectors).toEqual([]);
  });

  it("draws the empty-state placeholder in an empty graph", () => {
    const { container } = renderPlaceholders(makeEngine(), placeholderStore());

    const placeholders = placeholdersOf(container);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]?.getAttribute("data-nodera-phantom-kind")).toBe("empty-state");
    // An overlay inside the viewport, never an element of the node layer.
    expect(
      container.querySelector(".react-flow__viewport-portal [data-nodera-phantom-node]"),
    ).not.toBeNull();
    // No connector, so the "+" sits at the box centre — still one affordance.
    expect(container.querySelectorAll("[data-nodera-phantom-insert]")).toHaveLength(1);
    expect(container.querySelector("[data-nodera-phantom-insert-for='']")).not.toBeNull();
  });

  it("draws one placeholder beside the single node of the graph", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    const { container } = renderPlaceholders(engine, placeholderStore());

    expect(screen.getAllByText("App Node")).toHaveLength(1);
    const placeholders = placeholdersOf(container);
    // One placeholder for the one node: the empty state never doubles it.
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0]?.getAttribute("data-nodera-phantom-for")).toBe("n1");
    expect(container.querySelector("[data-nodera-phantom-edge]")).not.toBeNull();
  });

  /** The only placeholder connector currently painted, or `null`. */
  function connectorOf(container: HTMLElement): HTMLElement | null {
    return container.querySelector<HTMLElement>("[data-nodera-phantom-edge]");
  }

  it("paints the connector from the only node in CSS lengths, never the unitless SVG token", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    const { container } = renderPlaceholders(engine, placeholderStore());

    const connector = connectorOf(container);
    expect(connector).not.toBeNull();
    expect(connector?.getAttribute("data-nodera-phantom-edge")).toBe("horizontal");
    // A dashed line is what makes the placeholder read as an inactive edge.
    expect(connector?.style.borderTopStyle).toBe("dashed");
    // A positive length: a collapsed connector paints nothing at all.
    expect(Number.parseFloat(connector?.style.width ?? "0")).toBeGreaterThan(0);
    // The thickness must be a CSS length. `--ndr-edge-stroke-width` is the SVG
    // `stroke-width` token (a unitless "1.5" in every theme preset), and a
    // unitless border width is an invalid declaration the browser drops, so the
    // connector was invisible in the demo while its box still positioned the
    // "+" on the line it should have drawn.
    expect(connector?.style.borderTopWidth).toContain("px");
    expect(connector?.style.cssText).not.toContain("--ndr-edge-stroke-width");
    // Above the node layer, which carries no z-index of its own.
    expect(connector?.style.zIndex).not.toBe("");
  });

  it("keeps the connector of a successor placeholder visible and the real edges intact", () => {
    const engine = twoConnectedNodes();
    const { container } = renderPlaceholders(engine, placeholderStore());

    const connector = connectorOf(container);
    expect(connector).not.toBeNull();
    expect(connector?.style.borderTopStyle).toBe("dashed");
    expect(Number.parseFloat(connector?.style.width ?? "0")).toBeGreaterThan(0);
    // The connectors are an overlay: they never replace or hide a real edge.
    expect(flowContents(engine).edges).toHaveLength(1);
    expect(successorsOf(container)).toHaveLength(1);
  });

  it("never collapses the connector when a node is wider than one step", () => {
    const [placeholder] = canvasPlaceholders({
      enabled: true,
      nodes: [{ id: "n1", position: { x: 0, y: 0 }, width: 400, height: 40 }],
      edges: [],
    });

    // The step grows instead of the connector shrinking to nothing.
    expect(placeholder?.connectors[0]?.length).toBeGreaterThan(0);
    expect(placeholder?.box.x).toBe(400 + (placeholder?.connectors[0]?.length ?? 0));
  });

  it("puts the \"+\" at the centre of the dashed box, not on the connector", () => {
    const engine = twoConnectedNodes();
    const { container } = renderPlaceholders(engine, placeholderStore());

    const button = container.querySelector("[data-nodera-phantom-insert-for='n2']") as HTMLElement;
    const box = button.closest<HTMLElement>("[data-nodera-phantom-node]");

    // Inside the box, centred by the box's own flex layout (the reference
    // image), instead of sitting on the connector's midpoint.
    expect(box).not.toBeNull();
    expect(button.parentElement).toBe(box);
    expect(box?.style.justifyContent).toBe("center");
    expect(box?.style.alignItems).toBe("center");
    // No midpoint offset any more: the wrapper that carried
    // `translate(-50%, -50%) translate(<connector midpoint>)` is gone.
    expect(box?.style.transform).not.toContain("-50%");
  });

  it("puts the \"+\" of the empty state at the centre of its box too", () => {
    const { container } = renderPlaceholders(makeEngine(), placeholderStore());

    const button = container.querySelector("[data-nodera-phantom-insert-for='']") as HTMLElement;
    const box = button.closest<HTMLElement>("[data-nodera-phantom-node]");

    expect(box).not.toBeNull();
    expect(button.parentElement).toBe(box);
    expect(box?.getAttribute("data-nodera-phantom-kind")).toBe("empty-state");
  });

  it("draws no placeholder when the affordance is disabled", () => {
    const { container } = renderPlaceholders(makeEngine(), placeholderStore(), {
      edgeInsertion: false,
    });

    expect(placeholdersOf(container)).toEqual([]);
  });

  it("draws one placeholder past the only leaf and none for its parent", () => {
    const { container } = renderPlaceholders(twoConnectedNodes(), placeholderStore());

    const successors = successorsOf(container);
    expect(successors).toHaveLength(1);
    expect(successors[0]?.getAttribute("data-nodera-phantom-for")).toBe("n2");
    // The parent already has a successor, so it gets none.
    expect(container.querySelector("[data-nodera-phantom-for='n1']")).toBeNull();
    // Two nodes: the empty state is gone, not doubled.
    expect(container.querySelector("[data-nodera-phantom-kind='empty-state']")).toBeNull();
  });

  it("draws one placeholder per leaf when the two nodes are unconnected", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 240, y: 0 } });
    const { container } = renderPlaceholders(engine, placeholderStore());

    expect(successorsOf(container)).toHaveLength(2);
  });

  it("draws no placeholder for a leaf with no source-capable port", () => {
    const engine = makeEngine();
    engine.domain.nodes.register(sinkDef);
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.sink-node", nodeId: "n2", position: { x: 240, y: 0 } });
    createEdge(engine, {
      source: { nodeId: "n1", portId: "out-1" },
      target: { nodeId: "n2", portId: "in-1" },
    });
    const { container } = renderPlaceholders(engine, placeholderStore());

    expect(successorsOf(container)).toEqual([]);
  });

  it("keeps every real edge in React Flow while the placeholders are drawn", () => {
    const engine = twoConnectedNodes();
    const { container } = renderPlaceholders(engine, placeholderStore());

    // The regression: placeholders in React Flow's arrays emptied this layer.
    expect(flowContents(engine).edges).toEqual([String(engine.graph.getEdges()[0]?.id)]);
    // Both real nodes are painted as React Flow nodes, and only those.
    expect(container.querySelectorAll(".react-flow__node")).toHaveLength(2);
    expect(successorsOf(container)).toHaveLength(1);
    // The placeholder is not inside the node or the edge layer.
    expect(
      container.querySelector(
        ".react-flow__nodes [data-nodera-phantom-node], .react-flow__edges [data-nodera-phantom-node]",
      ),
    ).toBeNull();
  });

  it("puts no placeholder into React Flow's node and edge arrays", () => {
    const contents = flowContents(twoConnectedNodes());

    expect([...contents.nodes].sort()).toEqual(["n1", "n2"]);
    expect(contents.edges).toHaveLength(1);
    expect(contents.edges.some((id) => id.includes("phantom"))).toBe(false);
  });

  it("writes no placeholder into the graph, its history or its events", () => {
    const engine = twoConnectedNodes();
    const nodeCreated = vi.fn();
    const edgeCreated = vi.fn();
    engine.events.subscribe("node.created", nodeCreated);
    engine.events.subscribe("edge.created", edgeCreated);
    const before = {
      nodes: engine.graph.getNodes().map((node) => String(node.id)),
      edges: engine.graph.getEdges().map((edge) => String(edge.id)),
      history: engine.history.size(),
    };

    renderPlaceholders(engine, placeholderStore());

    expect(engine.graph.getNodes().map((node) => String(node.id))).toEqual(before.nodes);
    expect(engine.graph.getEdges().map((edge) => String(edge.id))).toEqual(before.edges);
    expect(engine.history.size()).toBe(before.history);
    expect(nodeCreated).not.toHaveBeenCalled();
    expect(edgeCreated).not.toHaveBeenCalled();
  });

  it("records an empty anchor and opens the dialog from an empty graph", () => {
    const store = placeholderStore();
    // A session left over from another affordance must not survive the click.
    store.setPendingEdgeInsertId("edge-1");
    const { container } = renderPlaceholders(makeEngine(), store);

    const button = container.querySelector("[data-nodera-phantom-insert-for='']");
    expect(button).not.toBeNull();
    fireEvent.click(button as HTMLElement);

    // No node to follow: the host calls `addNode` without an `after`.
    expect(store.getState().pendingAppendAnchorId).toBeUndefined();
    expect(store.getState().pendingEdgeInsertId).toBeUndefined();
    expect(store.getState().activeDialogId).toBe(NODERA_CREATE_NODE_DIALOG_ID);
  });

  it("records the single node as the anchor and opens the dialog", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    const store = placeholderStore();
    // A session left over from another affordance must not survive the click.
    store.setPendingEdgeInsertId("edge-1");
    const { container } = renderPlaceholders(engine, store);

    const button = container.querySelector("[data-nodera-phantom-insert-for='n1']");
    expect(button).not.toBeNull();
    fireEvent.click(button as HTMLElement);

    expect(store.getState().pendingAppendAnchorId).toBe("n1");
    expect(store.getState().pendingEdgeInsertId).toBeUndefined();
    expect(store.getState().activeDialogId).toBe(NODERA_CREATE_NODE_DIALOG_ID);
  });

  it("records the leaf as the anchor from its successor placeholder", () => {
    const store = placeholderStore();
    const { container } = renderPlaceholders(twoConnectedNodes(), store);

    const button = container.querySelector("[data-nodera-phantom-insert-for='n2']");
    expect(button).not.toBeNull();
    fireEvent.click(button as HTMLElement);

    expect(store.getState().pendingAppendAnchorId).toBe("n2");
    expect(store.getState().activeDialogId).toBe(NODERA_CREATE_NODE_DIALOG_ID);
  });

  it("leaves the selection and the graph alone when a placeholder is pressed", () => {
    const engine = twoConnectedNodes();
    selectNode(engine, { nodeId: "n1" });
    const { container } = renderPlaceholders(engine, placeholderStore());

    fireEvent.click(
      container.querySelector("[data-nodera-phantom-insert-for='n2']") as HTMLElement,
    );

    // The click stops at the placeholder: it neither clears the selection nor
    // writes anything, because it is not an element React Flow hit-tests.
    expect(engine.getSelectedNodes()).toEqual(["n1"]);
    expect(engine.graph.getEdges()).toHaveLength(1);
  });

  it("offers the placeholder as a keyboard-reachable dialog trigger", () => {
    const { container } = renderPlaceholders(twoConnectedNodes(), placeholderStore());

    const button = container.querySelector("[data-nodera-phantom-insert]") as HTMLButtonElement;
    expect(button.tagName).toBe("BUTTON");
    // Retargeted: the "+" used to hang on the connector's midpoint; it now sits
    // inside the dashed box (the reference image), and stays a native button.
    expect(button.closest("[data-nodera-phantom-node]")).not.toBeNull();
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Insert node");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    // A native button with no explicit tab index is in the tab order.
    expect(button.tabIndex).toBe(0);
  });

  it("removes the placeholder once the host appends and connects", () => {
    const engine = twoConnectedNodes();
    const { container } = renderPlaceholders(engine, placeholderStore());
    expect(container.querySelector("[data-nodera-phantom-for='n2']")).not.toBeNull();

    act(() => {
      addNode(engine, { definitionId: "test.app-node", nodeId: "n3", position: { x: 480, y: 0 } });
      createEdge(engine, {
        source: { nodeId: "n2", portId: "out-1" },
        target: { nodeId: "n3", portId: "in-1" },
      });
    });

    expect(container.querySelector("[data-nodera-phantom-for='n2']")).toBeNull();
    expect(container.querySelector("[data-nodera-phantom-for='n3']")).not.toBeNull();
    expect(successorsOf(container)).toHaveLength(1);
  });

  it("styles the placeholders as inactive with a shape channel, never colour alone", () => {
    const { container } = renderPlaceholders(twoConnectedNodes(), placeholderStore());
    const placeholder = container.querySelector("[data-nodera-phantom-node]") as HTMLElement;

    expect(placeholder.getAttribute("data-nodera-phantom-node")).toBe("inactive");
    expect(placeholder.style.borderStyle).toBe("dashed");
  });

  it("renders the minimap alongside the placeholders", () => {
    const { container } = renderPlaceholders(twoConnectedNodes(), placeholderStore());

    expect(container.querySelector(".react-flow__minimap")).not.toBeNull();
    expect(successorsOf(container)).toHaveLength(1);
  });

  /* ---------------------------------------------------------------- */
  /*  H: the placeholder the host replaces (S6)                        */
  /* ---------------------------------------------------------------- */

  /** A host component standing in for the framework's dashed box. */
  function hostPlaceholder(placeholder: PhantomPlaceholder): ReactNode {
    return createElement(
      "div",
      {
        "data-testid": "host-placeholder",
        "data-host-kind": placeholder.kind,
        "data-host-anchor": placeholder.anchorId ?? "",
      },
      createElement("button", { type: "button" }, "host +"),
    );
  }

  it("replaces the default placeholder box and its + for the empty graph", () => {
    const { container } = renderPlaceholders(makeEngine(), placeholderStore(), {
      renderPlaceholder: hostPlaceholder,
    });

    expect(container.querySelectorAll("[data-testid='host-placeholder']")).toHaveLength(1);
    // The framework's box and its "+" are replaced, not doubled.
    expect(placeholdersOf(container)).toEqual([]);
    expect(container.querySelector("[data-nodera-phantom-insert]")).toBeNull();
  });

  it("replaces the placeholder of the single-node empty state and keeps its connector", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    const { container } = renderPlaceholders(engine, placeholderStore(), {
      renderPlaceholder: hostPlaceholder,
    });

    const host = container.querySelector("[data-testid='host-placeholder']");
    expect(host?.getAttribute("data-host-kind")).toBe("empty-state");
    expect(host?.getAttribute("data-host-anchor")).toBe("n1");
    expect(placeholdersOf(container)).toEqual([]);
    expect(container.querySelector("[data-nodera-phantom-insert]")).toBeNull();
    // The dashed connector is the placeholder's geometry, so the canvas keeps it.
    expect(connectorOf(container)).not.toBeNull();
  });

  it("hands the host the successor kind with its anchor, box and connector", () => {
    const engine = twoConnectedNodes();
    const received: PhantomPlaceholder[] = [];
    renderPlaceholders(engine, placeholderStore(), {
      renderPlaceholder: (placeholder) => {
        received.push(placeholder);
        return hostPlaceholder(placeholder);
      },
    });

    expect(received).toHaveLength(1);
    const [placeholder] = received;
    expect(placeholder?.kind).toBe("successor");
    expect(placeholder?.anchorId).toBe("n2");
    // n2 sits at x=240, so its placeholder is one free slot further along.
    expect(placeholder?.box.x).toBeGreaterThan(240);
    expect(placeholder?.box.y).toBe(0);
    expect(placeholder?.connectors[0]?.axis).toBe("horizontal");
  });

  it("keeps the default placeholder box and its + when the host supplies no renderer", () => {
    const { container } = renderPlaceholders(twoConnectedNodes(), placeholderStore());

    expect(container.querySelectorAll("[data-nodera-phantom-node]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-nodera-phantom-insert]")).toHaveLength(1);
    expect(container.querySelector("[data-testid='host-placeholder']")).toBeNull();
  });

  it("keeps the host placeholder presentation-only and every real edge drawn", () => {
    const engine = twoConnectedNodes();
    const nodeCreated = vi.fn();
    const edgeCreated = vi.fn();
    engine.events.subscribe("node.created", nodeCreated);
    engine.events.subscribe("edge.created", edgeCreated);
    const before = {
      nodes: engine.graph.getNodes().map((node) => String(node.id)),
      edges: engine.graph.getEdges().map((edge) => String(edge.id)),
      history: engine.history.size(),
    };

    const { container } = renderPlaceholders(engine, placeholderStore(), {
      renderPlaceholder: hostPlaceholder,
    });

    const contents = flowContents(engine, { renderPlaceholder: hostPlaceholder });
    expect([...contents.nodes].sort()).toEqual(["n1", "n2"]);
    expect(contents.edges).toEqual(before.edges);
    expect(container.querySelectorAll(".react-flow__node")).toHaveLength(2);
    expect(container.querySelector("[data-testid='host-placeholder']")).not.toBeNull();
    expect(engine.graph.getNodes().map((node) => String(node.id))).toEqual(before.nodes);
    expect(engine.graph.getEdges().map((edge) => String(edge.id))).toEqual(before.edges);
    expect(engine.history.size()).toBe(before.history);
    expect(nodeCreated).not.toHaveBeenCalled();
    expect(edgeCreated).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  E: connections and ports policy (layout-owned graphs)              */
/* ------------------------------------------------------------------ */

describe("GraphCanvas canvas removal policy", () => {
  it("routes a canvas deletion through splicing when the policy says splice", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "p", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "m", position: { x: 240, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "s", position: { x: 480, y: 0 } });
    createEdge(engine, { source: { nodeId: "p", portId: "out-1" }, target: { nodeId: "m", portId: "in-1" } });
    createEdge(engine, { source: { nodeId: "m", portId: "out-1" }, target: { nodeId: "s", portId: "in-1" } });

    removeNodeForRemovalPolicy(engine, "m", "splice");

    const nodes = engine.graph.getNodes().map((node) => String(node.id));
    expect(nodes).toEqual(["p", "s"]);
    const edges = engine.graph.getEdges().map((edge) =>
      `${String(edge.connection.source.nodeId)}->${String(edge.connection.target.nodeId)}`,
    );
    expect(edges).toEqual(["p->s"]);
  });

  it("keeps deleting with detached edges when the policy says detach", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "p", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "m", position: { x: 240, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "s", position: { x: 480, y: 0 } });
    createEdge(engine, { source: { nodeId: "p", portId: "out-1" }, target: { nodeId: "m", portId: "in-1" } });
    createEdge(engine, { source: { nodeId: "m", portId: "out-1" }, target: { nodeId: "s", portId: "in-1" } });

    removeNodeForRemovalPolicy(engine, "m", "detach");

    expect(engine.graph.getNodes().map((node) => String(node.id))).toEqual(["p", "s"]);
    expect(engine.graph.getEdges()).toHaveLength(0);
  });
});

describe("GraphCanvas connections and ports policy", () => {
  afterEach(cleanup);

  function seededEngine(): EditorEngine {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 200, y: 0 } });
    return engine;
  }

  function handles(container: HTMLElement): readonly HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>("[data-nodera-port-id]")];
  }

  it("offers no connectable handle under the fixed connections policy", () => {
    const { container } = renderCanvas(seededEngine(), { connectionsPolicy: "fixed" });
    const rendered = handles(container);

    // 2 nodes x 2 ports: the handles are still painted, they just cannot be
    // used to start or complete a connection.
    expect(rendered).toHaveLength(4);
    for (const handle of rendered) {
      expect(handle.classList.contains("connectable")).toBe(false);
    }
  });

  it("refuses to write an edge for a connection that arrives under the fixed policy", () => {
    const engine = seededEngine();
    const historyBefore = engine.history.size();

    const accepted = commitConnection(
      engine,
      { source: "n1", target: "n2", sourceHandle: "out-1", targetHandle: "in-1" },
      "fixed",
    );

    expect(accepted).toBe(false);
    expect(engine.graph.getEdges()).toHaveLength(0);
    expect(engine.history.size()).toBe(historyBefore);
  });

  it("keeps every handle connectable and commits one edge under the editable default", () => {
    const engine = seededEngine();
    const historyBefore = engine.history.size();
    const { container } = renderCanvas(engine);
    const rendered = handles(container);

    expect(rendered).toHaveLength(4);
    expect(rendered.every((handle) => handle.classList.contains("connectable"))).toBe(true);

    const accepted = commitConnection(engine, {
      source: "n1",
      target: "n2",
      sourceHandle: "out-1",
      targetHandle: "in-1",
    });

    expect(accepted).toBe(true);
    expect(engine.graph.getEdges()).toHaveLength(1);
    expect(engine.history.size()).toBe(historyBefore + 1);
  });

  it("keeps the port handles in the DOM but out of sight under the hidden ports policy", () => {
    const { container } = renderCanvas(seededEngine(), { portsPolicy: "hidden" });

    // The handle has to stay: React Flow anchors every edge to one by id, so
    // removing it would take the edges with it. It is present, invisible and
    // inert instead — no affordance, no connection, edges still drawn.
    const rendered = handles(container);
    expect(rendered.length).toBeGreaterThan(0);
    for (const handle of rendered) {
      expect(handle.style.opacity).toBe("0");
      expect(handle.style.pointerEvents).toBe("none");
      expect(handle.getAttribute("aria-hidden")).toBe("true");
      expect(handle.classList.contains("connectable")).toBe(false);
      // Zero-sized and pinned to the node border on the side it anchors: the
      // edge endpoint is the handle's centre, so a sized handle leaves the
      // edge floating half a handle away from the node once no visible dot
      // covers the gap.
      expect(handle.style.width).toBe("0px");
      expect(handle.style.height).toBe("0px");
      const isInput = handle.getAttribute("data-nodera-port-direction") === "input";
      expect(isInput ? handle.style.left : handle.style.right).toBe("0px");
      expect(isInput ? handle.style.right : handle.style.left).toBe("auto");
    }
    expect(screen.getAllByText("App Node")).toHaveLength(2);
  });

  it("keeps handing the port data to the node renderers under the hidden ports policy", () => {
    const PortAwareNode = ((props: { data: { ports: readonly { id: string }[] } }) =>
      createElement(
        "span",
        { "data-testid": "port-names" },
        props.data.ports.map((port) => port.id).join(","),
      )) as never;
    const nodeRenderers = new NodeRendererRegistry();
    nodeRenderers.register("test.port-aware-node", PortAwareNode as never);
    const engine = makeEngine();
    engine.domain.nodes.unregister("test.app-node");
    engine.domain.nodes.register({
      ...def,
      renderer: "test.port-aware-node",
    } as unknown as NodeDefinition);
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 200, y: 0 } });

    const { container } = renderCanvas(engine, { nodeRenderers, portsPolicy: "hidden" });

    // The handle stays (edge anchoring needs it) but paints nothing.
    const painted = container.querySelectorAll<HTMLElement>("[data-nodera-port-id]");
    expect(painted.length).toBeGreaterThan(0);
    for (const handle of painted) {
      expect(handle.style.opacity).toBe("0");
    }
    expect(screen.getAllByTestId("port-names").map((element) => element.textContent)).toEqual([
      "in-1,out-1",
      "in-1,out-1",
    ]);
  });

  it("follows a ports policy the host switches without rebuilding the canvas", () => {
    const engine = seededEngine();
    const { container, rerender } = renderCanvas(engine);
    expect(handles(container)).toHaveLength(4);

    rerender(createElement(Canvas, { editor: engine, portsPolicy: "hidden" }));

    const hidden = handles(container);
    expect(hidden).toHaveLength(4);
    for (const handle of hidden) {
      expect(handle.style.opacity).toBe("0");
      expect(handle.style.pointerEvents).toBe("none");
    }
  });
});


/* ------------------------------------------------------------------ */
/*  Camera framing (viewport)                                          */
/* ------------------------------------------------------------------ */

/**
 * The camera is React Flow's (canvas state), and jsdom measures a 0×0 canvas, so
 * the resulting transform cannot be asserted here — React Flow refuses to fit a
 * viewport it cannot measure. What *can* be asserted is that the canvas hands
 * React Flow the framing it decided on: `fitView` schedules its options on the
 * live store (`fitViewQueued` / `fitViewOptions`), which is the same store a real
 * drag writes to, so a probe inside the provider observes exactly what a browser
 * would. The pure rules themselves are covered exhaustively in
 * `viewport-fit.test.ts`.
 */
describe("GraphCanvas camera framing", () => {
  type FlowStore = ReturnType<typeof useStoreApi>;

  /** Every distinct `fitView` options object React Flow was handed, in order. */
  interface FitViewLog {
    readonly options: unknown[];
  }

  /**
   * Records the `fitView` options React Flow is handed.
   *
   * React Flow's viewport helper schedules a fit by setting `fitViewOptions` on
   * the store; one options object per call, so a change of reference is one
   * camera movement (and a repeated notification with the same object is not).
   */
  function FitViewProbe(props: { readonly log: FitViewLog }): null {
    const store = useStoreApi();
    useEffect(
      () =>
        store.subscribe((state, previous) => {
          const options = state.fitViewOptions;
          if (options !== undefined && options !== previous.fitViewOptions) {
            (props.log.options as unknown[]).push(options);
          }
        }),
      [store, props.log],
    );
    return null;
  }

  function seededEngine(): EditorEngine {
    const engine = makeEngine();
    addNode(engine, {
      definitionId: "test.app-node",
      nodeId: "n1",
      position: { x: 0, y: 0 },
    });
    addNode(engine, {
      definitionId: "test.app-node",
      nodeId: "n2",
      position: { x: 300, y: 0 },
    });
    engine.domain.edges.register({
      id: "test.app-edge",
      name: "App Edge",
      version: "1.0.0",
      category: "test",
    } as unknown as EdgeDefinition);
    createEdge(engine, {
      edgeId: "e1",
      source: { nodeId: "n1", portId: "out-1" },
      target: { nodeId: "n2", portId: "in-1" },
    });
    return engine;
  }

  function renderWithProbe(engine: EditorEngine, props?: Partial<GraphCanvasProps>) {
    const log: FitViewLog = { options: [] };
    const rendered = render(
      createElement(
        "div",
        { style: { width: 800, height: 600 } },
        createElement(
          ReactFlowProvider,
          null,
          createElement(GraphCanvas, { editor: engine, ...props }),
          createElement(FitViewProbe, { log }),
        ),
      ),
    );
    return { ...rendered, log };
  }

  it("renders a canvas without a viewport reader, today's behaviour", () => {
    const engine = seededEngine();

    const { container, log } = renderWithProbe(engine);

    expect(screen.getAllByText("App Node")).toHaveLength(2);
    // No framing plan: the canvas keeps React Flow's own boolean `fitView`, so
    // the canvas itself schedules nothing.
    expect(log.options).toHaveLength(0);
    expect(container.querySelector("[data-testid='rf__node-n1']")).not.toBeNull();
  });

  it("frames the node the host configured, with the defaults", async () => {
    const engine = seededEngine();

    const { log } = renderWithProbe(engine, {
      viewportFit: () => ({ start: { node: "n1" } }),
    });

    await waitFor(() => expect(log.options).toHaveLength(1));
    expect(log.options[0]).toEqual({
      nodes: [{ id: "n1" }],
      maxZoom: 1.5,
      padding: 0.1,
      duration: 200,
    });
  });

  it("frames the graph at the absolute zoom the host configured", async () => {
    const engine = seededEngine();

    const { log } = renderWithProbe(engine, {
      viewportFit: () => ({ start: { zoom: 1.25 } }),
    });

    await waitFor(() => expect(log.options).toHaveLength(1));
    expect(log.options[0]).toEqual({
      minZoom: 1.25,
      maxZoom: 1.25,
      padding: 0.1,
      duration: 200,
    });
  });

  it("does not move the camera on selection while no selection rule is declared", async () => {
    const engine = seededEngine();
    const { log } = renderWithProbe(engine, { viewportFit: () => ({ start: {} }) });
    await waitFor(() => expect(log.options).toHaveLength(1));

    act(() => {
      selectNode(engine, { nodeId: "n2" });
    });

    expect(log.options).toHaveLength(1);
  });

  it("follows the selection and restores the start framing when it is cleared", async () => {
    const engine = seededEngine();
    const { log } = renderWithProbe(engine, {
      viewportFit: () => ({ start: { node: "n1" }, selection: {} }),
    });
    await waitFor(() => expect(log.options).toHaveLength(1));

    act(() => {
      selectNode(engine, { nodeId: "n2" });
    });
    await waitFor(() => expect(log.options).toHaveLength(2));
    expect(log.options[1]).toEqual({
      nodes: [{ id: "n2" }],
      maxZoom: 1.5,
      padding: 0.1,
      duration: 200,
    });

    act(() => {
      clearSelection(engine);
    });
    await waitFor(() => expect(log.options).toHaveLength(3));
    expect(log.options[2]).toEqual({
      nodes: [{ id: "n1" }],
      maxZoom: 1.5,
      padding: 0.1,
      duration: 200,
    });
  });

  it("picks up a runtime camera change on the next selection change, with no remount", async () => {
    const engine = seededEngine();
    // The host's live reader: the same function identity throughout, so the
    // canvas never re-subscribes and never remounts — only the value it returns
    // changes, exactly what `builder.setViewport(...)` does behind
    // `() => builder.viewport()`.
    let declared: ViewportConfiguration | undefined = { selection: { maxZoom: 2 } };
    const { container, log } = renderWithProbe(engine, {
      viewportFit: () => declared,
    });
    await waitFor(() => expect(log.options).toHaveLength(1));
    const nodeBefore = container.querySelector("[data-testid='rf__node-n1']");

    act(() => {
      selectNode(engine, { nodeId: "n1" });
    });
    await waitFor(() => expect(log.options).toHaveLength(2));
    expect(log.options[1]).toEqual({
      nodes: [{ id: "n1" }],
      maxZoom: 2,
      padding: 0.1,
      duration: 200,
    });

    declared = { selection: { maxZoom: 4, padding: 0.25, duration: 0 } };

    act(() => {
      selectNode(engine, { nodeId: "n2" });
    });
    await waitFor(() => expect(log.options).toHaveLength(3));
    expect(log.options[2]).toEqual({
      nodes: [{ id: "n2" }],
      maxZoom: 4,
      padding: 0.25,
      duration: 0,
    });
    // The same canvas and the same node element survived the change: the new
    // rule came from the reader, not from a remount with a new `key`.
    expect(container.querySelector("[data-testid='rf__node-n1']")).toBe(nodeBefore);
  });

  it("does not throw on a selection change without a viewport reader", () => {
    const engine = seededEngine();
    const { container } = renderCanvas(engine);

    act(() => {
      selectNode(engine, { nodeId: "n2" });
      clearSelection(engine);
    });

    expect(container.querySelector("[data-testid='rf__node-n1']")).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Configurable shortcuts (S8 "Atajos configurables")                  */
/* ------------------------------------------------------------------ */

describe("GraphCanvas configurable shortcuts", () => {
  /** Host map that rebinds deletion to a key the canvas never bound before. */
  const Q_DELETES: ShortcutMap = {
    ...DEFAULT_SHORTCUTS,
    "delete-selection": { key: "q", label: "Delete selected" },
  };

  function renderWithShortcuts(engine: EditorEngine, shortcuts: ShortcutMap) {
    return render(
      <NoderaUiProvider
        store={new UiStateStore({ themeId: "nodera.light", layoutId: "nodera.editor" })}
        shortcuts={shortcuts}
      >
        <ReactFlowProvider>
          <GraphCanvas editor={engine} />
        </ReactFlowProvider>
      </NoderaUiProvider>,
    );
  }

  function twoNodesEngine(): EditorEngine {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 50, y: 0 } });
    selectNode(engine, { nodeId: "n1" });
    return engine;
  }

  it("deletes the selection with the configured delete-selection key", async () => {
    const engine = twoNodesEngine();

    const { container } = renderWithShortcuts(engine, Q_DELETES);
    fireEvent.keyDown(container, { key: "q", code: "KeyQ" });

    await waitFor(() => {
      expect(engine.graph.nodeCount).toBe(1);
      expect(engine.graph.getNode(createNodeId("n1"))).toBeUndefined();
    });
    cleanup();
  });

  it("stops deleting on Delete once the host remaps delete-selection", async () => {
    const engine = twoNodesEngine();

    const { container } = renderWithShortcuts(engine, Q_DELETES);
    await act(async () => {
      fireEvent.keyDown(container, { key: "Delete", code: "Delete" });
      // React Flow deletes through an async `onBeforeDelete`; give that path the
      // same chance it gets in the test above before asserting nothing happened.
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(engine.graph.nodeCount).toBe(2);
    expect(engine.graph.getNode(createNodeId("n1"))).toBeDefined();
    cleanup();
  });
});
