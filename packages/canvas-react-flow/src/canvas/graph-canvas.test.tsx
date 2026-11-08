import { describe, expect, it, vi, afterEach } from "vitest";
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
  undo,
} from "@nodera/application";
import type { NodeDefinition } from "@nodera/node-registry";
import type { EdgeDefinition } from "@nodera/edge-registry";
import { EdgeRendererRegistry, NodeRendererRegistry } from "../registries/renderer-registries.js";
import { DEFAULT_EDGE_RENDERER_ID } from "../registries/renderer-registries.js";
import { DefaultEdgeRenderer } from "../renderers/default-edge-renderer.js";
import { createNodeId } from "@nodera/contracts";

import {
  GraphCanvas,
  canvasBackgroundOptions,
  canvasEdgeTypes,
  commitDraggedNodes,
  commitSelectionFromReactFlow,
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
