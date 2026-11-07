import {
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type FC,
  type ComponentType,
  type MouseEvent,
} from "react";

import {
  ReactFlow,
  Background,
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
import {
  nodePositionFromReactFlow,
  connectionFromReactFlow,
  removedIdsFromReactFlowChanges,
  applyMeasuredDimensions,
} from "../map/react-flow-mapper.js";
import type { NodeRendererRegistry, EdgeRendererRegistry } from "../registries/renderer-registries.js";
import { DEFAULT_EDGE_RENDERER_ID } from "../registries/renderer-registries.js";
import { DefaultEdgeRenderer } from "../renderers/default-edge-renderer.js";
import type { NoderaNodeData } from "../renderers/node-renderer-props.js";

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
}

/**
 * Main canvas component: translates domain graph ↔ React Flow,
 * subscribes to editor events, and forwards interactions to use cases.
 *
 * Controlled-flow rules:
 *   - The engine is the single source of truth; nodes/edges are derived
 *     from it (with engine selection merged in) on every relevant event.
 *   - Drag positions are committed to the engine on drag stop
 *     (`onNodeDragStop`) as one undoable transaction; during the drag
 *     React Flow's internal store moves the node visually.
 *   - Position changes arriving through `onNodesChange` are never
 *     committed (they carry no final state in this design).
 */
export const GraphCanvas: FC<GraphCanvasProps> = ({
  editor,
  nodeRenderers,
  edgeRenderers,
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
}) => {
  // Derive RF nodes/edges/selection from engine via event-driven hook.
  const { nodes, edges, refresh } = useEditorGraph(editor);

  // Measured node dimensions are canvas state (never domain state): RF
  // reports them through `dimensions` node changes and both the minimap
  // and edge handle math need them on the node objects.
  const measuredDims = useRef(new Map<string, { width: number; height: number }>());
  const nodesWithDims = useMemo(
    () => applyMeasuredDimensions(nodes, measuredDims.current),
    [nodes],
  );

  // nodeTypes: wrapper components that resolve the definition renderer
  // and ALWAYS render the port handles (via useNodeTypes/createNodeType).
  const nodeTypes = useNodeTypes(nodeRenderers);

  // Build edgeTypes map: registry renderers + default sentinel. Casts are
  // confined to the adapter boundary: React Flow's NodeTypes/EdgeTypes are
  // ComponentType<any> maps and our renderer props are stricter.
  const edgeTypes = useMemo((): EdgeTypes => {
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
  }, [edgeRenderers]);

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

  // Node change handler: record measured dimensions and removals;
  // positions commit on drag stop.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      externalOnNodesChange?.(changes);

      for (const change of changes) {
        if (change.type === "dimensions" && change.dimensions) {
          measuredDims.current.set(change.id, change.dimensions);
        }
      }
      const removedIds = removedIdsFromReactFlowChanges(changes);
      if (removedIds.length > 0) {
        for (const nodeId of removedIds) {
          removeNode(editor, { nodeId });
        }
      } else if (changes.some((c) => c.type === "dimensions")) {
        refresh();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, refresh],
  );

  // Drag stop: commit final positions of every dragged node as one unit.
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
    [editor],
  );

  // Edge click handler: selection → selectEdge. `selectEdge` emits no
  // event (phase-3 gap), so the canvas forces re-derivation itself.
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

  // Clicking the pane clears the selection. `clearSelection` emits no
  // dedicated event, so force re-derivation.
  const handlePaneClick = useCallback(() => {
    clearSelection(editor);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, refresh]);

  // Box/multi selection (selectionKeyCode drag, meta-click) → engine.
  // Replaces the whole engine selection with RF's current one.
  const handleSelectionChange = useCallback(
    ({ nodes: selected, edges: selectedEdges }: { nodes: RfNode[]; edges: RfEdge[] }) => {
      commitSelectionFromReactFlow(editor, { nodes: selected, edges: selectedEdges });
      refresh();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, refresh],
  );

  // Minimap node color follows the definition visual hint when present.
  const minimapNodeColor = useCallback((node: RfNode): string => {
    const visual = (node.data as unknown as NoderaNodeData | undefined)?.visual;
    return visual?.color ?? (typeof visual?.backgroundColor === "string" ? visual.backgroundColor : "#a3a3a3");
  }, []);

  return (
    <div
      className={className}
      style={{ width: "100%", height: "100%" }}
      data-color-mode={colorMode}
    >
      <ReactFlow
        nodes={nodesWithDims}
        edges={edges}
        nodeTypes={nodeTypes as unknown as NodeTypes}
        edgeTypes={edgeTypes}
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
        colorMode={colorMode}
        fitView
        nodesDraggable
      >
        <Background />
        {showMinimap && <MiniMap nodeColor={minimapNodeColor} pannable zoomable />}
        {showControls && <Controls />}
      </ReactFlow>
    </div>
  );
};
