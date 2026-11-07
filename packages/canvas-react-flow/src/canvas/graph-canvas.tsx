import {
  useMemo,
  useCallback,
  useEffect,
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
  useReactFlow,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type IsValidConnection,
  type Edge as RfEdge,
} from "@xyflow/react";

import type { EditorEngine } from "@nodera/application";
import {
  moveNode,
  createEdge,
  removeNode,
  removeEdge,
  selectNode,
  selectEdge,
  validateConnection as validateConnectionUseCase,
} from "@nodera/application";

import { useEditorGraph } from "./use-editor-graph.js";
import {
  nodePositionFromReactFlow,
  connectionFromReactFlow,
  removedIdsFromReactFlowChanges,
} from "../map/react-flow-mapper.js";
import type { NodeRendererRegistry, EdgeRendererRegistry } from "../registries/renderer-registries.js";
import { DEFAULT_NODE_RENDERER_ID, DEFAULT_EDGE_RENDERER_ID } from "../registries/renderer-registries.js";
import { DefaultNodeRenderer } from "../renderers/default-node-renderer.js";
import { DefaultEdgeRenderer } from "../renderers/default-edge-renderer.js";

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
  /** Optional callback for node changes (position, remove, etc). */
  readonly onNodesChange?: (changes: NodeChange[]) => void;
  /** Optional callback for edge changes. */
  readonly onEdgesChange?: (changes: EdgeChange[]) => void;
  /** Optional callback for connections. */
  readonly onConnect?: (params: Connection) => void;
  /** Optional callback for node selection (RF v12 passes node object). */
  readonly onNodeClick?: (event: MouseEvent, node: import("@xyflow/react").Node) => void;
  /** Optional callback for edge selection. */
  readonly onEdgeClick?: (event: MouseEvent, edge: RfEdge) => void;
  /** Optional callback after a connection is validated (non-persisting probe). */
  readonly onLinkValidate?: (valid: boolean, issues: readonly import("@nodera/contracts").ValidationIssue[]) => void;
}

/**
 * Main canvas component: translates domain graph ↔ React Flow,
 * subscribes to editor events, and forwards interactions to use cases.
 */
export const GraphCanvas: FC<GraphCanvasProps> = ({
  editor,
  nodeRenderers,
  edgeRenderers,
  className,
  showMinimap = true,
  showControls = true,
  onNodesChange: externalOnNodesChange,
  onEdgesChange: externalOnEdgesChange,
  onConnect: externalOnConnect,
  onNodeClick: externalOnNodeClick,
  onEdgeClick: externalOnEdgeClick,
  onLinkValidate: externalOnLinkValidate,
}) => {
  // Derive RF nodes/edges/selection from engine via event-driven hook.
  const { nodes, edges, selectedNodeIds, selectedEdgeIds } = useEditorGraph(editor);

  // Build nodeTypes map: registry renderers + default sentinel.
  const nodeTypes = useMemo((): Record<string, ComponentType<any>> => {
    const types: Record<string, ComponentType<any>> = {};
    if (nodeRenderers) {
      for (const id of nodeRenderers.listIds()) {
        try {
          types[id] = nodeRenderers.get(id);
        } catch {
          // Skip unresolvable registrations.
        }
      }
    }
    // Default sentinel always available.
    types[DEFAULT_NODE_RENDERER_ID] = DefaultNodeRenderer;
    return types;
  }, [nodeRenderers]);

  // Build edgeTypes map: registry renderers + default sentinel.
  const edgeTypes = useMemo((): Record<string, ComponentType<any>> => {
    const types: Record<string, ComponentType<any>> = {};
    if (edgeRenderers) {
      for (const id of edgeRenderers.listIds()) {
        try {
          types[id] = edgeRenderers.get(id);
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
      // connection can be Edge or Connection; extract port info safely.
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
      if (result.ok && result.value.valid) {
        return true;
      }
      return false;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  // Drag-stop handler: position changes → moveNode in a single transaction.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Forward external handlers.
      externalOnNodesChange?.(changes);

      // Extract position changes and group into a history transaction.
      const positionChanges = changes.filter(
        (c): c is NodeChange & { type: "position"; changed?: boolean } =>
          c.type === "position",
      );

      if (positionChanges.length > 0) {
        // Start a transaction, apply moves, then commit.
        const txn = editor.history.beginTransaction({ label: "drag" });
        for (const change of positionChanges) {
          if (change.changed) {
            const node = nodes.find((n) => n.id === change.id);
            if (node && node.position) {
              const { nodeId, position } = nodePositionFromReactFlow(node);
              moveNode(editor, { nodeId, position });
            }
          }
        }
        txn.commit(editor.editorState);
      }
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
    (_event: MouseEvent, node: import("@xyflow/react").Node) => {
      if (externalOnNodeClick) {
        externalOnNodeClick(_event, node);
      }
      selectNode(editor, { nodeId: node.id });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  // Edge click handler: selection → selectEdge.
  const handleEdgeClick = useCallback(
    (_event: MouseEvent, edge: RfEdge) => {
      if (externalOnEdgeClick) {
        externalOnEdgeClick(_event, edge);
      }
      selectEdge(editor, { edgeId: edge.id });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        fitView
        nodesDraggable
        nodesFocusable={false}
        edgesFocusable={false}
      >
        <Background />
        {showMinimap && <MiniMap />}
        {showControls && <Controls />}
      </ReactFlow>
    </div>
  );
};