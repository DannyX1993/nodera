import {
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type FC,
  type ComponentType,
  type MouseEvent,
  type DragEvent as ReactDragEvent,
} from "react";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ConnectionMode,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type IsValidConnection,
  type Edge as RfEdge,
  type Node as RfNode,
  type XYPosition,
  type NodeTypes,
  type EdgeTypes,
  type OnNodeDrag,
  type ReactFlowInstance,
} from "@xyflow/react";

import type { EditorEngine } from "@nodera/application";
import {
  moveNode,
  createEdge,
  clearSelection,
  removeNode,
  removeEdge,
  selectNode,
  selectEdge,
  selectMultiple,
  validateConnection as validateConnectionUseCase,
} from "@nodera/application";

import { useEditorGraph } from "./use-editor-graph.js";
import { useNodeTypes } from "./custom-node.js";
import { isNodeDefinitionDrag, nodeDefinitionFromDataTransfer } from "./definition-drop.js";
import { DEFAULT_NODE_RENDERER_ID } from "../registries/renderer-registries.js";
import {
  nodePositionFromReactFlow,
  connectionFromReactFlow,
  removedIdsFromReactFlowChanges,
  applyMeasuredDimensions,
  hasNewDimensions,
} from "../map/react-flow-mapper.js";
import type { NodeRendererRegistry, EdgeRendererRegistry, PortRendererRegistry } from "../registries/renderer-registries.js";
import { DEFAULT_EDGE_RENDERER_ID } from "../registries/renderer-registries.js";
import { DefaultEdgeRenderer } from "../renderers/default-edge-renderer.js";
import type { NoderaNodeData } from "../renderers/node-renderer-props.js";
import { canvasInteractionSettings, type CanvasInteractionMode } from "./interaction-mode.js";

/* ------------------------------------------------------------------ */
/*  Canvas background (token contract)                                 */
/* ------------------------------------------------------------------ */

/**
 * Gap between background dots, in flow units.
 *
 * The theme contract publishes `canvas.backgroundDotSize` as a CSS *token
 * string* (`"16"`), but React Flow's `<Background gap>` is a **number** and a
 * CSS custom property can never feed a numeric React prop. The adapter
 * therefore owns this documented numeric default (the token's value): a host
 * that needs another gap renders its own `<Background />` or overrides the
 * pattern through CSS.
 */
const CANVAS_BACKGROUND_DOT_GAP = 16;

/**
 * Colour of the canvas background dots: the theme variable with a literal
 * fallback (D2), so an unthemed host still renders a visible pattern.
 */
const CANVAS_BACKGROUND_DOT_COLOR = "var(--ndr-canvas-background-dot, #cbd5e1)";

/** Props the canvas hands to React Flow's `<Background />`. */
export interface CanvasBackgroundOptions {
  readonly variant: BackgroundVariant;
  readonly gap: number;
  readonly color: string;
}

/**
 * Background pattern options derived from the theme token contract.
 *
 * Single source for what the canvas passes to `<Background />`: the dot colour
 * is a CSS variable reference (themeable without re-rendering React) and the
 * dot gap is the documented numeric default explained above.
 */
export function canvasBackgroundOptions(): CanvasBackgroundOptions {
  return {
    variant: BackgroundVariant.Dots,
    gap: CANVAS_BACKGROUND_DOT_GAP,
    color: CANVAS_BACKGROUND_DOT_COLOR,
  };
}

/* ------------------------------------------------------------------ */
/*  Edge types                                                         */
/* ------------------------------------------------------------------ */

/**
 * React Flow edge-type map built from an edge renderer registry.
 *
 * Every registered renderer id becomes an RF edge type, and the Nodera default
 * is always present under {@link DEFAULT_EDGE_RENDERER_ID}. A definition that
 * names an unregistered renderer id is absent from this map, so React Flow
 * falls back to its built-in default edge instead of blanking the graph.
 *
 * Casts stay confined to the adapter boundary: React Flow's `EdgeTypes` is a
 * `ComponentType<any>` map while Nodera renderers have stricter props.
 */
export function canvasEdgeTypes(edgeRenderers?: EdgeRendererRegistry): EdgeTypes {
  const types: EdgeTypes = {};
  if (edgeRenderers) {
    for (const id of edgeRenderers.listIds()) {
      try {
        types[id] = edgeRenderers.get(id) as unknown as EdgeTypes[string];
      } catch {
        // Skip unresolvable registrations.
      }
    }
  }
  types[DEFAULT_EDGE_RENDERER_ID] = DefaultEdgeRenderer;
  return types;
}

/* ------------------------------------------------------------------ */
/*  Drag commit                                                        */
/* ------------------------------------------------------------------ */

/**
 * Commit the final positions of a node drag to the engine.
 *
 * Each node is committed through `moveNode`, so it becomes its own undo
 * unit. Grouping a whole multi-node drag into ONE history unit requires
 * application-core support (use cases refuse `history.push` inside an
 * open transaction) and is a documented phase-4 limitation.
 */
export function commitDraggedNodes(
  editor: EditorEngine,
  draggedNodes: ReadonlyArray<{ readonly id: string; readonly position: XYPosition }>,
): void {
  for (const node of draggedNodes) {
    const { nodeId, position } = nodePositionFromReactFlow(
      node as unknown as Parameters<typeof nodePositionFromReactFlow>[0],
    );
    moveNode(editor, { nodeId, position });
  }
}

/**
 * Sync a React Flow selection change into the engine through
 * `selectMultiple` (which also selects/deselects edges). Needed because
 * RF box/multi selection does not flow through node/edge click handlers.
 */
export function commitSelectionFromReactFlow(
  editor: EditorEngine,
  selection: { readonly nodes: ReadonlyArray<{ readonly id: string }>; readonly edges: ReadonlyArray<{ readonly id: string }> },
): void {
  selectMultiple(editor, {
    nodeIds: selection.nodes.map((n) => n.id),
    edgeIds: selection.edges.map((e) => e.id),
  });
}

/* ------------------------------------------------------------------ */
/*  GraphCanvas                                                        */
/* ------------------------------------------------------------------ */

/** Props for the GraphCanvas component. */
export interface GraphCanvasProps {
  /** Editor engine instance owned by the host. */
  readonly editor: EditorEngine;
  /** Optional node renderer registry. When provided, registered renderers are used. */
  readonly nodeRenderers?: NodeRendererRegistry;
  /** Optional edge renderer registry. When provided, registered renderers are used. */
  readonly edgeRenderers?: EdgeRendererRegistry;
  /** Optional port renderer registry. When provided, ports use registered renderers. */
  readonly portRenderers?: PortRendererRegistry;
  /**
   * Interaction mode of the canvas (S5 "Modo de interacción").
   *
   * The host owns the value (it is UI state in `@nodera/ui-core`); the canvas
   * only maps it onto React Flow's drag props through
   * `canvasInteractionSettings`. Defaults to `"select"`.
   */
  readonly interactionMode?: CanvasInteractionMode;
  /** CSS class for the outer container. */
  readonly className?: string;
  /** Show the minimap. */
  readonly showMinimap?: boolean;
  /** Show the zoom/pan controls. */
  readonly showControls?: boolean;
  /** Color mode of the canvas chrome ("system" follows the OS). */
  readonly colorMode?: "light" | "dark" | "system";
  /** Optional callback for node changes (position, remove, etc). */
  readonly onNodesChange?: (changes: NodeChange[]) => void;
  /** Optional callback for edge changes. */
  readonly onEdgesChange?: (changes: EdgeChange[]) => void;
  /** Optional callback for connections. */
  readonly onConnect?: (params: Connection) => void;
  /** Optional callback for node selection (RF v12 passes node object). */
  readonly onNodeClick?: (event: MouseEvent, node: RfNode) => void;
  /** Optional callback for edge selection. */
  readonly onEdgeClick?: (event: MouseEvent, edge: RfEdge) => void;
  /** Optional callback after a connection is validated (non-persisting probe). */
  readonly onLinkValidate?: (valid: boolean, issues: readonly import("@nodera/contracts").ValidationIssue[]) => void;
  /**
   * Optional callback for a node definition dropped on the canvas (D7).
   *
   * The adapter only translates the drop into a definition id plus a flow
   * position; creating the node stays a host decision. Without this
   * callback the canvas ignores drops entirely.
   */
  readonly onDropNodeDefinition?: (definitionId: string, position: XYPosition) => void;
}

/**
 * Main canvas component: translates domain graph ↔ React Flow,
 * subscribes to editor events, and forwards interactions to use cases.
 *
 * Controlled-flow rules:
 *   - The engine is the single source of truth; nodes/edges are derived
 *     from it (with engine selection merged in) on every relevant event.
 *   - Measured node dimensions are applied back onto the derived nodes
 *     (guarded by `hasNewDimensions` so identical re-measurements never
 *     trigger a re-render — otherwise the controlled flow loops forever).
 *   - Drag positions are committed to the engine on drag stop
 *     (`onNodeDragStop`) as per-node undo units.
 *   - Position changes arriving through `onNodesChange` are never
 *     committed (they carry no final state in this design).
 */
export const GraphCanvas: FC<GraphCanvasProps> = ({
  editor,
  nodeRenderers,
  edgeRenderers,
  portRenderers,
  interactionMode = "select",
  className,
  showMinimap = true,
  showControls = true,
  colorMode = "light",
  onNodesChange: externalOnNodesChange,
  onEdgesChange: externalOnEdgesChange,
  onConnect: externalOnConnect,
  onNodeClick: externalOnNodeClick,
  onEdgeClick: externalOnEdgeClick,
  onLinkValidate: externalOnLinkValidate,
  onDropNodeDefinition: externalOnDropNodeDefinition,
}) => {
  // Derive RF nodes/edges/selection from engine via event-driven hook.
  const { nodes, edges, refresh } = useEditorGraph(editor);

  // nodeTypes: wrapper components that resolve the definition renderer
  // and ALWAYS render the port handles (via useNodeTypes/createNodeType).
  const nodeTypes = useNodeTypes(nodeRenderers, portRenderers);

  // Measured node dimensions are canvas state (never domain state): RF
  // reports them through `dimensions` node changes and both the minimap
  // and edge handle math need them on the node objects.
  const measuredDims = useRef(new Map<string, { width: number; height: number }>());
  const nodesWithDims = useMemo(
    () => applyMeasuredDimensions(nodes, measuredDims.current),
    [nodes],
  );

  // Route node types: a definition renderer id with no registry entry
  // would make React Flow fall back to its bare built-in node (error 003,
  // no port handles). Re-route those to the default Nodera wrapper.
  const nodesWithTypes = useMemo(
    () =>
      nodesWithDims.map((node) =>
        node.type !== undefined && nodeTypes[node.type] ? node : { ...node, type: DEFAULT_NODE_RENDERER_ID },
      ),
    [nodesWithDims, nodeTypes],
  );

  // Build edgeTypes map: registry renderers + default sentinel.
  const edgeTypes = useMemo(() => canvasEdgeTypes(edgeRenderers), [edgeRenderers]);

  // Interaction mode → React Flow drag props (pure mapping, see
  // interaction-mode.ts). The mode itself is never stored in the adapter, and
  // the memo keeps the prop identity stable between unrelated re-renders so
  // React Flow does not re-register its drag handlers.
  const interaction = useMemo(
    () => canvasInteractionSettings(interactionMode),
    [interactionMode],
  );

  // React Flow instance, captured through `onInit`. Kept in a ref (canvas
  // state, never domain state) so `screenToFlowPosition` is available to
  // the drop handler without re-rendering the whole canvas.
  const flowInstance = useRef<ReactFlowInstance | null>(null);

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    flowInstance.current = instance;
  }, []);

  // Drag over: accept the drag only when a drop handler exists AND the
  // payload announces the node definition MIME type (D7).
  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!externalOnDropNodeDefinition) {
        return;
      }
      if (!isNodeDefinitionDrag(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [externalOnDropNodeDefinition],
  );

  // Drop: screen coordinates → flow coordinates through the instance, so
  // the host creates the node where the user dropped it. Falls back to raw
  // client coordinates when no instance is available yet.
  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!externalOnDropNodeDefinition) {
        return;
      }
      const definitionId = nodeDefinitionFromDataTransfer(event.dataTransfer);
      if (definitionId === undefined) {
        return;
      }
      event.preventDefault();
      const screenPosition = { x: event.clientX, y: event.clientY };
      const position = flowInstance.current
        ? flowInstance.current.screenToFlowPosition(screenPosition)
        : screenPosition;
      externalOnDropNodeDefinition(definitionId, position);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [externalOnDropNodeDefinition],
  );

  // Invalidate connection validation: probe without persisting.
  const isValidConnection = useCallback<IsValidConnection>(
    (connection): boolean => {
      const sourceHandle = (connection as Connection).sourceHandle ?? (connection as RfEdge).sourceHandle;
      const targetHandle = (connection as Connection).targetHandle ?? (connection as RfEdge).targetHandle;

      if (sourceHandle === undefined || targetHandle === undefined) {
        return false;
      }

      const input = {
        source: { nodeId: String(connection.source), portId: String(sourceHandle) },
        target: { nodeId: String(connection.target), portId: String(targetHandle) },
      };
      const result = validateConnectionUseCase(editor, input);
      if (externalOnLinkValidate) {
        if (result.ok) {
          externalOnLinkValidate(true, result.value.issues);
        } else {
          externalOnLinkValidate(false, []);
        }
      }
      return result.ok && result.value.valid;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  // Node change handler: record NEW measured dimensions only (identical
  // re-measurements must not re-render — that is the feedback loop),
  // and removals → removeNode. Positions commit on drag stop.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      externalOnNodesChange?.(changes);

      const dimsChanged = hasNewDimensions(changes, measuredDims.current);
      if (dimsChanged) {
        for (const change of changes) {
          if (change.type === "dimensions" && change.dimensions) {
            measuredDims.current.set(change.id, change.dimensions);
          }
        }
      }

      const removedIds = removedIdsFromReactFlowChanges(changes);
      if (removedIds.length > 0) {
        for (const nodeId of removedIds) {
          removeNode(editor, { nodeId });
        }
      } else if (dimsChanged) {
        refresh();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, refresh],
  );

  // Drag stop: commit final positions of every dragged node.
  const handleNodeDragStop = useCallback<OnNodeDrag>(
    (_event, _node, draggedNodes) => {
      commitDraggedNodes(
        editor,
        draggedNodes.map((node) => ({ id: node.id, position: node.position })),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  // Edge change handler: removals → removeEdge.
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      externalOnEdgesChange?.(changes);

      const removedIds = removedIdsFromReactFlowChanges(changes);
      for (const edgeId of removedIds) {
        removeEdge(editor, { edgeId });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  // Connect handler: connection → createEdge.
  const handleConnect = useCallback(
    (params: Connection) => {
      const conn = connectionFromReactFlow({
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
      });
      if (conn === undefined) {
        return;
      }
      const input = {
        source: { nodeId: conn.source.nodeId, portId: conn.source.portId },
        target: { nodeId: conn.target.nodeId, portId: conn.target.portId },
      };
      createEdge(editor, input);
      externalOnConnect?.(params);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  // Node click handler: selection → selectNode.
  const handleNodeClick = useCallback(
    (event: MouseEvent, node: RfNode) => {
      if (externalOnNodeClick) {
        externalOnNodeClick(event, node);
      }
      selectNode(editor, { nodeId: node.id, additive: event.shiftKey });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, refresh],
  );

  // Edge click handler: selection → selectEdge. `selectEdge` now emits
  // `selection.changed` (D5) for panels, but the canvas deliberately keeps
  // its own `refresh()`: re-deriving from that event would make React Flow
  // re-emit its own selection change and re-enter this loop (the phase-4
  // selection ping-pong documented in the feature log).
  const handleEdgeClick = useCallback(
    (event: MouseEvent, edge: RfEdge) => {
      if (externalOnEdgeClick) {
        externalOnEdgeClick(event, edge);
      }
      selectEdge(editor, { edgeId: edge.id });
      refresh();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, refresh],
  );

  // Clicking the pane clears the selection. `clearSelection` emits
  // `selection.changed` (D5) for panels, but the canvas still re-derives
  // locally for the same reason as `handleEdgeClick`: refreshing on that
  // event re-enters React Flow's selection emission.
  const handlePaneClick = useCallback(() => {
    clearSelection(editor);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, refresh]);

  // Box/multi selection (selectionKeyCode drag, meta-click) → engine.
  // Replaces the whole engine selection with RF's current one. No refresh:
  // RF already reflects this selection visually, and re-deriving here
  // makes RF re-emit selection changes — an infinite ping-pong loop.
  const handleSelectionChange = useCallback(
    ({ nodes: selected, edges: selectedEdges }: { nodes: RfNode[]; edges: RfEdge[] }) => {
      commitSelectionFromReactFlow(editor, { nodes: selected, edges: selectedEdges });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, refresh],
  );

  // Minimap node color follows the definition visual hint when present.
  const minimapNodeColor = useCallback((node: RfNode): string => {
    const visual = (node.data as unknown as NoderaNodeData | undefined)?.visual;
    return visual?.color ?? "#a3a3a3";
  }, []);

  return (
    <div
      className={className}
      style={{ width: "100%", height: "100%" }}
      data-color-mode={colorMode}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodesWithTypes}
        edges={edges}
        onInit={handleInit}
        nodeTypes={nodeTypes as unknown as NodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={["Delete", "Backspace"]}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onSelectionChange={handleSelectionChange}
        panOnDrag={interaction.panOnDrag}
        selectionOnDrag={interaction.selectionOnDrag}
        colorMode={colorMode}
        fitView
        nodesDraggable
      >
        <Background {...canvasBackgroundOptions()} />
        {showMinimap && <MiniMap nodeColor={minimapNodeColor} pannable zoomable />}
        {showControls && <Controls />}
      </ReactFlow>
    </div>
  );
};
