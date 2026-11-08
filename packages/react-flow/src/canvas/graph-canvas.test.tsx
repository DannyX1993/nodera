import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, createEvent, act, waitFor, cleanup } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider, type EdgeProps, type MiniMapNodeProps } from "@xyflow/react";
import type { FC, ReactNode } from "react";
import { createElement } from "react";
import {
  EditorEngine,
  addNode,
  createEdge,
  selectNode,
  removeNode,
  undo,
} from "@nodera/application";
import type { NodeDefinition } from "@nodera/node-registry";
import type { EdgeDefinition } from "@nodera/edge-registry";
import { EdgeRendererRegistry, NodeRendererRegistry } from "../registries/renderer-registries.js";
import { DEFAULT_EDGE_RENDERER_ID } from "../registries/renderer-registries.js";
import { DefaultEdgeRenderer } from "../renderers/default-edge-renderer.js";
import { createNodeId } from "@nodera/contracts";
import {
  CREATE_NODE_DIALOG,
  DialogRegistry,
  NODERA_CREATE_NODE_DIALOG_ID,
  UiStateStore,
} from "@nodera/ui-core";
import { NoderaUiProvider } from "@nodera/ui-react";

import {
  GraphCanvas,
  canvasBackgroundOptions,
  canvasEdgeTypes,
  commitConnection,
  commitDraggedNodes,
  commitSelectionFromReactFlow,
  DefaultEdgeInsertButton,
  MiniMapNodeWithoutPhantom,
  PhantomEdge,
  phantomGraphElements,
  PHANTOM_EDGE_ID,
  PHANTOM_NODE_ID,
} from "./graph-canvas.js";
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
/*  D: phantom empty state (S7)                                        */
/* ------------------------------------------------------------------ */

/**
 * The phantoms are presentation only: a node and (with exactly one real node)
 * an edge the canvas adds to the React Flow arrays it renders. They are
 * asserted at the two boundaries that own them — the pure derivation
 * (`phantomGraphElements`) for the geometry and the flags, and the rendered
 * canvas for what a host sees — because React Flow paints no edge at all in
 * jsdom (see the C2 note above).
 */
describe("GraphCanvas phantom empty state", () => {
  afterEach(cleanup);

  function phantomStore(): UiStateStore {
    const dialogs = new DialogRegistry();
    dialogs.register(CREATE_NODE_DIALOG);
    return new UiStateStore({
      themeId: "nodera.light",
      layoutId: "nodera.editor",
      dialogRegistry: dialogs,
    });
  }

  function renderPhantomCanvas(
    engine: EditorEngine,
    store: UiStateStore,
    edgeInsertion = true,
  ) {
    return render(
      <NoderaUiProvider store={store} editor={engine}>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowProvider>
            <GraphCanvas editor={engine} edgeInsertion={edgeInsertion} />
          </ReactFlowProvider>
        </div>
      </NoderaUiProvider>,
    );
  }

  it("derives a phantom node at the origin for an empty graph", () => {
    const elements = phantomGraphElements([]);

    expect(elements.nodes).toHaveLength(1);
    expect(elements.nodes[0]?.id).toBe(PHANTOM_NODE_ID);
    expect(elements.nodes[0]?.position).toEqual({ x: 0, y: 0 });
    // No node to connect therefore no phantom edge.
    expect(elements.edges).toHaveLength(0);
  });

  it("derives a phantom edge from the single node to the phantom node", () => {
    const elements = phantomGraphElements([
      { id: "n1", position: { x: 40, y: 80 } },
    ]);

    expect(elements.nodes).toHaveLength(1);
    expect(elements.edges).toHaveLength(1);
    const edge = elements.edges[0];
    expect(edge?.id).toBe(PHANTOM_EDGE_ID);
    expect(edge?.source).toBe("n1");
    expect(edge?.target).toBe(PHANTOM_NODE_ID);
    // The placeholder sits one step beside the node it follows.
    expect(elements.nodes[0]?.position).toEqual({ x: 280, y: 80 });
  });

  it("derives nothing once the graph holds two nodes", () => {
    const elements = phantomGraphElements([
      { id: "n1", position: { x: 0, y: 0 } },
      { id: "n2", position: { x: 240, y: 0 } },
    ]);

    expect(elements.nodes).toEqual([]);
    expect(elements.edges).toEqual([]);
  });

  it("keeps the phantoms out of selection, dragging and deletion", () => {
    const elements = phantomGraphElements([
      { id: "n1", position: { x: 0, y: 0 } },
    ]);
    const node = elements.nodes[0];
    const edge = elements.edges[0];

    // React Flow is what emits selection, drag and delete changes: refusing the
    // four capabilities is what keeps the phantoms out of the document.
    expect(node?.selectable).toBe(false);
    expect(node?.draggable).toBe(false);
    expect(node?.deletable).toBe(false);
    expect(node?.connectable).toBe(false);
    expect(edge?.selectable).toBe(false);
    expect(edge?.deletable).toBe(false);
  });

  it("draws a phantom node in an empty graph when the affordance is enabled", () => {
    const engine = makeEngine();
    const { container } = renderPhantomCanvas(engine, phantomStore());

    expect(container.querySelector("[data-nodera-phantom-node]")).not.toBeNull();
  });

  it("draws a phantom node beside the single node of the graph", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    const { container } = renderPhantomCanvas(engine, phantomStore());

    expect(screen.getAllByText("App Node")).toHaveLength(1);
    expect(container.querySelector("[data-nodera-phantom-node]")).not.toBeNull();
  });

  it("draws no phantom when the affordance is disabled", () => {
    const engine = makeEngine();
    const { container } = renderPhantomCanvas(engine, phantomStore(), false);

    expect(container.querySelector("[data-nodera-phantom-node]")).toBeNull();
  });

  it("draws no phantom once the graph holds two nodes", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 240, y: 0 } });
    const { container } = renderPhantomCanvas(engine, phantomStore());

    expect(container.querySelector("[data-nodera-phantom-node]")).toBeNull();
  });

  it("writes no phantom into the graph, its history or its events", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    const nodeCreated = vi.fn();
    const edgeCreated = vi.fn();
    engine.events.subscribe("node.created", nodeCreated);
    engine.events.subscribe("edge.created", edgeCreated);
    const historyBefore = engine.history.size();

    renderPhantomCanvas(engine, phantomStore());

    expect(engine.graph.getNodes().map((node) => String(node.id))).toEqual(["n1"]);
    expect(engine.graph.getEdges()).toHaveLength(0);
    expect(engine.history.size()).toBe(historyBefore);
    expect(nodeCreated).not.toHaveBeenCalled();
    expect(edgeCreated).not.toHaveBeenCalled();
  });

  it("keeps the phantom out of the minimap", () => {
    // The minimap draws every node React Flow knows, and jsdom gives it no node
    // dimensions, so the filter is asserted where the adapter owns it: the node
    // component the canvas hands to `<MiniMap nodeComponent>`.
    const props = {
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      borderRadius: 5,
      className: "",
      shapeRendering: "crispEdges",
      selected: false,
    } as unknown as MiniMapNodeProps;

    const phantom = render(
      createElement(
        "svg",
        null,
        createElement(MiniMapNodeWithoutPhantom, { ...props, id: PHANTOM_NODE_ID }),
      ),
    );
    expect(phantom.container.querySelector("[data-nodera-minimap-node]")).toBeNull();
    cleanup();

    const real = render(
      createElement("svg", null, createElement(MiniMapNodeWithoutPhantom, { ...props, id: "n1" })),
    );
    expect(real.container.querySelector("[data-nodera-minimap-node='n1']")).not.toBeNull();
  });

  it("renders the minimap alongside the phantom", () => {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    const { container } = renderPhantomCanvas(engine, phantomStore());

    expect(container.querySelector(".react-flow__minimap")).not.toBeNull();
    expect(container.querySelector("[data-nodera-phantom-node]")).not.toBeNull();
  });

  it("records an empty anchor and opens the dialog from the empty-graph phantom", () => {
    const engine = makeEngine();
    const store = phantomStore();
    // A session left over from another affordance must not survive the click.
    store.setPendingEdgeInsertId("edge-1");
    const { container } = renderPhantomCanvas(engine, store);

    const button = container.querySelector("[data-nodera-phantom-insert]");
    expect(button).not.toBeNull();
    fireEvent.click(button as HTMLElement);

    expect(store.getState().pendingAppendAnchorId).toBeUndefined();
    expect(store.getState().pendingEdgeInsertId).toBeUndefined();
    expect(store.getState().activeDialogId).toBe(NODERA_CREATE_NODE_DIALOG_ID);
  });

  it("records the existing node as the anchor from the phantom edge '+'", () => {
    const store = phantomStore();
    render(
      <NoderaUiProvider store={store} editor={makeEngine()}>
        <ReactFlowProvider>
          <ReactFlow nodes={[]} edges={[]}>
            {createElement(PhantomEdge, {
              id: PHANTOM_EDGE_ID,
              source: "n1",
              target: PHANTOM_NODE_ID,
              sourceX: 0,
              sourceY: 0,
              targetX: 240,
              targetY: 0,
              selected: false,
              data: { anchorId: "n1" },
            } as unknown as EdgeProps)}
          </ReactFlow>
        </ReactFlowProvider>
      </NoderaUiProvider>,
    );

    const button = document.querySelector("[data-nodera-phantom-insert]");
    expect(button).not.toBeNull();
    fireEvent.click(button as HTMLElement);

    expect(store.getState().pendingAppendAnchorId).toBe("n1");
    expect(store.getState().activeDialogId).toBe(NODERA_CREATE_NODE_DIALOG_ID);
  });

  it("styles the phantoms as inactive with a shape channel, never colour alone", () => {
    const { container } = renderPhantomCanvas(makeEngine(), phantomStore());
    const phantom = container.querySelector("[data-nodera-phantom-node]") as HTMLElement;

    expect(phantom.getAttribute("data-nodera-phantom-node")).toBe("inactive");
    expect(phantom.style.borderStyle).toBe("dashed");
  });
});

/* ------------------------------------------------------------------ */
/*  E: connections and ports policy (layout-owned graphs)              */
/* ------------------------------------------------------------------ */

describe("GraphCanvas connections and ports policy", () => {
  afterEach(cleanup);

  function seededEngine(): EditorEngine {
    const engine = makeEngine();
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 200, y: 0 } });
    return engine;
  }

  function handles(container: HTMLElement): readonly Element[] {
    return [...container.querySelectorAll("[data-nodera-port-id]")];
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
