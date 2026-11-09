import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, createEvent, act, waitFor, cleanup } from "@testing-library/react";
import { ReactFlow, ReactFlowProvider, useEdges, useNodes } from "@xyflow/react";
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
  canvasBranchHandles,
  canvasEdgeTypes,
  canvasPlaceholders,
  commitConnection,
  commitDraggedNodes,
  commitSelectionFromReactFlow,
  DefaultEdgeInsertButton,
  edgeOffersInsertHandle,
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
    expect(placeholders[0]?.connector).toBeUndefined();
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
    expect(placeholders[0]?.connector).toEqual({
      x: 180,
      y: 100,
      length: 100,
      axis: "horizontal",
    });
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
    expect(placeholders[0]?.connector).toEqual({
      x: 110,
      y: 120,
      length: 200,
      axis: "vertical",
    });
  });

  /*
   * A placeholder occupies a slot like a node does: it never overlaps a real
   * node or another placeholder (user report: "los nodos fantasma del modo
   * layered no deben taparse con otros nodos. Son nodos como tal asi que no
   * deben solaparse"). The rule is a forward walk along the layout axis, so
   * every assertion below reads the chosen boxes by x/y/width/height instead of
   * trusting a rendering.
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

  it("pushes a placeholder past the real node its first step would land on", () => {
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

    // One whole step further than the candidate that was occupied.
    expect(boxesOf(placeholders)).toEqual([{ x: 480, y: 0, width: 140, height: 40 }]);
    const pushed = boxAt(placeholders, 0);
    expect(intersects(pushed, { x: 240, y: 0, width: 140, height: 40 })).toBe(false);
    expect(intersects(pushed, { x: 0, y: 0, width: 140, height: 40 })).toBe(false);
  });

  it("gives two leaves whose first-step placeholders would collide distinct free slots", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      // Both leaves would step to x = 240, i.e. one on top of the other.
      nodes: [leaf("n1", 0, 0), leaf("n2", 240, 0)],
      edges: [],
    });

    expect(boxesOf(placeholders)).toEqual([
      { x: 480, y: 0, width: 140, height: 40 },
      { x: 720, y: 0, width: 140, height: 40 },
    ]);
    // Neither placeholder sits on a node or on the other placeholder.
    const first = boxAt(placeholders, 0);
    const second = boxAt(placeholders, 1);
    const occupiedNode = { x: 240, y: 0, width: 140, height: 40 };
    expect(intersects(first, second)).toBe(false);
    expect(intersects(first, occupiedNode)).toBe(false);
    expect(intersects(second, occupiedNode)).toBe(false);
  });

  it("spans the connector over the real distance to the chosen slot", () => {
    const placeholders = canvasPlaceholders({
      enabled: true,
      nodes: [leaf("n1", 0, 0), { id: "n2", position: { x: 240, y: 0 } }],
      edges: [],
    });

    const box = boxAt(placeholders, 0);
    const connector = placeholders[0]?.connector;
    // The dashed line starts where the node ends and stops where the pushed
    // box begins: 340, not the 100 of the first (occupied) candidate.
    expect(connector).toEqual({ x: 140, y: 20, length: 340, axis: "horizontal" });
    expect((connector?.x ?? 0) + (connector?.length ?? 0)).toBe(box.x);
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

  it("keeps the empty-graph placeholder at the origin", () => {
    const placeholders = canvasPlaceholders({ enabled: true, nodes: [], edges: [] });

    expect(boxesOf(placeholders)).toEqual([{ x: 0, y: 0, width: 140, height: 40 }]);
    expect(placeholders[0]?.kind).toBe("empty-state");
    expect(placeholders[0]?.connector).toBeUndefined();
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
    expect(placeholder?.connector?.length).toBeGreaterThan(0);
    expect(placeholder?.box.x).toBe(400 + (placeholder?.connector?.length ?? 0));
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
/*  J: insert-handle placement (S23)                                   */
/* ------------------------------------------------------------------ */

/**
 * The branching affordance is the second half of the insert-handle placement:
 * a parent with two or more successors gets **one** "+" before the split instead
 * of one per edge, when the host asks for it.
 *
 * Like the phantom placeholders it is an **overlay** (`ViewportPortal`): never a
 * React Flow node or edge, never document state. The rules are pinned at the two
 * boundaries that own them — the pure derivation (`canvasBranchHandles`, and
 * `edgeOffersInsertHandle` for which edges keep their own "+") and the rendered
 * canvas for what a person sees and what the click records.
 */
describe("GraphCanvas insert-handle placement (S23)", () => {
  afterEach(cleanup);

  function branchStore(): UiStateStore {
    const dialogs = new DialogRegistry();
    dialogs.register(CREATE_NODE_DIALOG);
    return new UiStateStore({
      themeId: "nodera.light",
      layoutId: "nodera.editor",
      dialogRegistry: dialogs,
    });
  }

  function renderHandles(
    engine: EditorEngine,
    props: Partial<GraphCanvasProps> = {},
  ) {
    return render(
      <NoderaUiProvider store={branchStore()} editor={engine}>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowProvider>
            <GraphCanvas editor={engine} edgeInsertion {...props} />
          </ReactFlowProvider>
        </div>
      </NoderaUiProvider>,
    );
  }

  /** What React Flow holds while the branching overlay is drawn. */
  function flowContents(
    engine: EditorEngine,
  ): { readonly nodes: readonly string[]; readonly edges: readonly string[] } {
    const seen = { nodes: [] as readonly string[], edges: [] as readonly string[] };
    function FlowProbe(): null {
      const nodes = useNodes();
      const edges = useEdges();
      seen.nodes = nodes.map((node) => node.id);
      seen.edges = edges.map((edge) => edge.id);
      return null;
    }
    render(
      <NoderaUiProvider store={branchStore()} editor={engine}>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowProvider>
            <GraphCanvas editor={engine} edgeInsertion insertHandles="before-branching" />
            <FlowProbe />
          </ReactFlowProvider>
        </div>
      </NoderaUiProvider>,
    );
    return seen;
  }

  /** `n1 --> { n2, n3 }`: the branching shape the affordance exists for. */
  function forkingGraph(engine: EditorEngine = makeEngine()): EditorEngine {
    addNode(engine, { definitionId: "test.app-node", nodeId: "n1", position: { x: 0, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n2", position: { x: 240, y: 0 } });
    addNode(engine, { definitionId: "test.app-node", nodeId: "n3", position: { x: 240, y: 200 } });
    createEdge(engine, {
      source: { nodeId: "n1", portId: "out-1" },
      target: { nodeId: "n2", portId: "in-1" },
    });
    createEdge(engine, {
      source: { nodeId: "n1", portId: "out-1" },
      target: { nodeId: "n3", portId: "in-1" },
    });
    return engine;
  }

  const FORK_NODES = [
    { id: "n1", position: { x: 0, y: 0 }, width: 140, height: 40 },
    { id: "n2", position: { x: 240, y: 0 } },
    { id: "n3", position: { x: 240, y: 200 } },
  ] as const;

  const FORK_EDGES = [
    { source: "n1", target: "n2" },
    { source: "n1", target: "n3" },
  ] as const;

  it("derives one handle per branching parent under the two policies that ask for it", () => {
    for (const policy of ["before-branching", "both"] as const) {
      const handles = canvasBranchHandles({
        enabled: true,
        policy,
        nodes: FORK_NODES,
        edges: FORK_EDGES,
      });

      expect(handles.map((handle) => handle.nodeId)).toEqual(["n1"]);
    }
  });

  it("derives no handle under the per-edge policy, which is the default", () => {
    expect(
      canvasBranchHandles({ enabled: true, nodes: FORK_NODES, edges: FORK_EDGES }),
    ).toEqual([]);
    expect(
      canvasBranchHandles({
        enabled: true,
        policy: "each-edge",
        nodes: FORK_NODES,
        edges: FORK_EDGES,
      }),
    ).toEqual([]);
  });

  it("derives nothing for a parent with fewer than two outgoing edges", () => {
    const single = canvasBranchHandles({
      enabled: true,
      policy: "both",
      nodes: [FORK_NODES[0], FORK_NODES[1]],
      edges: [{ source: "n1", target: "n2" }],
    });
    const none = canvasBranchHandles({
      enabled: true,
      policy: "both",
      nodes: [FORK_NODES[0]],
      edges: [],
    });

    expect(single).toEqual([]);
    expect(none).toEqual([]);
  });

  it("derives nothing when the affordance is disabled", () => {
    expect(
      canvasBranchHandles({
        enabled: false,
        policy: "both",
        nodes: FORK_NODES,
        edges: FORK_EDGES,
      }),
    ).toEqual([]);
  });

  it("places the handle one step along the axis, on the parent's row", () => {
    const horizontal = canvasBranchHandles({
      enabled: true,
      policy: "both",
      nodes: FORK_NODES,
      edges: FORK_EDGES,
    });
    const vertical = canvasBranchHandles({
      enabled: true,
      policy: "both",
      axis: "vertical",
      nodes: FORK_NODES,
      edges: FORK_EDGES,
    });

    // One documented step (240 flow units) from the parent, centred on its row.
    expect(horizontal[0]).toEqual({ nodeId: "n1", x: 240, y: 20 });
    expect(vertical[0]).toEqual({ nodeId: "n1", x: 70, y: 240 });
  });

  it("suppresses the per-edge handle of a branching parent under the branching policy only", () => {
    const branchNodeIds = new Set(["n1"]);

    expect(
      edgeOffersInsertHandle({ policy: "each-edge", sourceId: "n1", branchNodeIds }),
    ).toBe(true);
    expect(
      edgeOffersInsertHandle({ policy: "both", sourceId: "n1", branchNodeIds }),
    ).toBe(true);
    // One "+" before the split means the edges of the split have none of their own.
    expect(
      edgeOffersInsertHandle({
        policy: "before-branching",
        sourceId: "n1",
        branchNodeIds,
      }),
    ).toBe(false);
    // A single-successor parent keeps the ordinary per-edge affordance.
    expect(
      edgeOffersInsertHandle({
        policy: "before-branching",
        sourceId: "n2",
        branchNodeIds,
      }),
    ).toBe(true);
  });

  it("draws the branching + for a forking parent under the branching policy", () => {
    const { container } = renderHandles(forkingGraph(), {
      insertHandles: "before-branching",
    });

    const button = screen.getByRole("button", { name: "Insert node before the branches" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    // An overlay inside the viewport, never an element of the node layer.
    expect(
      container.querySelector(".react-flow__viewport-portal [data-nodera-branch-insert]"),
    ).not.toBeNull();
    expect(
      container.querySelector(
        ".react-flow__nodes [data-nodera-branch-insert], .react-flow__edges [data-nodera-branch-insert]",
      ),
    ).toBeNull();
    expect(
      container.querySelector("[data-nodera-branch-insert-for='n1']"),
    ).not.toBeNull();
    // One handle for the split, not one per successor edge.
    expect(container.querySelectorAll("[data-nodera-branch-insert]")).toHaveLength(1);
  });

  it("draws no branching + under the per-edge policy", () => {
    const { container } = renderHandles(forkingGraph());

    expect(container.querySelector("[data-nodera-branch-insert]")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Insert node before the branches" }),
    ).toBeNull();
  });

  it("keeps the branching + as a native, keyboard-reachable dialog trigger", () => {
    renderHandles(forkingGraph(), { insertHandles: "both" });

    const button = screen.getByRole("button", {
      name: "Insert node before the branches",
    }) as HTMLButtonElement;
    button.focus();

    expect(button.tagName).toBe("BUTTON");
    expect(button.tabIndex).toBe(0);
    expect(document.activeElement).toBe(button);
  });

  it("records the parent and opens the dialog when the branching + is activated", () => {
    const store = branchStore();
    const engine = forkingGraph();
    // Sessions left over from another affordance must not survive the click.
    store.setPendingEdgeInsertId("edge-1");
    store.setPendingAppendAnchorId("n2");
    const { container } = render(
      <NoderaUiProvider store={store} editor={engine}>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlowProvider>
            <GraphCanvas editor={engine} edgeInsertion insertHandles="before-branching" />
          </ReactFlowProvider>
        </div>
      </NoderaUiProvider>,
    );

    fireEvent.click(
      container.querySelector("[data-nodera-branch-insert-for='n1']") as HTMLElement,
    );

    expect(store.getState().pendingBranchInsertId).toBe("n1");
    expect(store.getState().pendingEdgeInsertId).toBeUndefined();
    expect(store.getState().pendingAppendAnchorId).toBeUndefined();
    expect(store.getState().activeDialogId).toBe(NODERA_CREATE_NODE_DIALOG_ID);
  });

  it("writes nothing into the graph, its history or its events, and keeps every real edge", () => {
    const engine = forkingGraph();
    const nodeCreated = vi.fn();
    const edgeCreated = vi.fn();
    engine.events.subscribe("node.created", nodeCreated);
    engine.events.subscribe("edge.created", edgeCreated);
    const before = {
      nodes: engine.graph.getNodes().map((node) => String(node.id)),
      edges: engine.graph.getEdges().map((edge) => String(edge.id)),
      history: engine.history.size(),
    };

    const { container } = renderHandles(engine, { insertHandles: "both" });

    const contents = flowContents(engine);
    expect([...contents.nodes].sort()).toEqual(["n1", "n2", "n3"]);
    expect(contents.edges).toEqual(before.edges);
    expect(container.querySelectorAll(".react-flow__node")).toHaveLength(3);
    expect(engine.graph.getNodes().map((node) => String(node.id))).toEqual(before.nodes);
    expect(engine.graph.getEdges().map((edge) => String(edge.id))).toEqual(before.edges);
    expect(engine.history.size()).toBe(before.history);
    expect(nodeCreated).not.toHaveBeenCalled();
    expect(edgeCreated).not.toHaveBeenCalled();
    expect(container.querySelector("[data-nodera-branch-insert]")).not.toBeNull();
  });
});

