import type {
  Edge as ReactFlowEdge,
  Node as ReactFlowNode,
  NodeChange,
  EdgeChange,
  XYPosition,
} from "@xyflow/react";

import type { Edge, Graph, Node } from "@nodera/graph-model";
import type { NodeDefinition, NodeVisual } from "@nodera/node-registry";
import type { EdgeDefinition, EdgeVisual } from "@nodera/edge-registry";
import type { PortDeclaration, PortDirection, PortInstance, PortVisual } from "@nodera/graph-model";
import { edgeStyleHints } from "../renderers/edge-options.js";

/**
 * React Flow Handle type mapping for Nodera port directions.
 *
 * Mapping rule (fixed by design decision):
 *   - input      → Handle type "target" (id = portId)
 *   - output     → Handle type "source" (id = portId)
 *   - bidirectional → Handle type "source" (id = portId)
 *
 * Bidirectional ports are mapped to "source" only; the canvas must be
 * configured with ConnectionMode.loose to allow connections in both directions
 * from the same handle.
 */
const handleTypeForDirection = (direction: PortDirection): "source" | "target" => {
  if (direction === "input") {
    return "target";
  }
  // output or bidirectional → source
  return "source";
};

/**
 * Geometry mapping: Nodera EdgeGeometry → React Flow edge type.
 *
 * - straight  → "straight"
 * - bezier    → "default"  (BezierEdge in RF v12)
 * - step      → "step"
 * - smooth    → "smoothstep"
 */
const geometryToEdgeType = (
  geometry: string | undefined,
): string | undefined => {
  if (geometry === "straight") return "straight";
  if (geometry === "bezier") return "default";
  if (geometry === "step") return "step";
  if (geometry === "smooth") return "smoothstep";
  return undefined;
};

/**
 * Animation mapping: Nodera EdgeAnimation → React Flow animated flag.
 *
 * - "flow"  → animated: true
 * - "none"  → animated: false
 * - "dash", "pulse" → we still set animated: true for these.
 */
const animationToAnimated = (animation: string | undefined): boolean => {
  return animation !== undefined && animation !== "none";
};

// --- Node mapping ---

/** Port entry inside ReactFlowNode.data */
interface PortDataEntry {
  id: string;
  name?: string;
  direction: PortDirection;
  dataType?: string;
  /** Port presentation hints, copied verbatim from the declaration (D8). */
  visual?: PortVisual;
}

/**
 * Shared data contract stored inside every ReactFlowNode.data.
 * Visual is omitted when undefined to satisfy exactOptionalPropertyTypes.
 */
type NodeDataValue = PortDataEntry[] | string | Record<string, unknown> | NodeVisual | undefined;

/**
 * Convert a Nodera node + its definition into a React Flow node.
 *
 * @param node - the Nodera domain Node instance
 * @param nodeDefinition - the resolved NodeDefinition (may be undefined)
 * @returns a partial ReactFlowNode ready for the RF store
 */
const toReactFlowNode = (
  node: Node,
  nodeDefinition: NodeDefinition | undefined,
): ReactFlowNode => {
  const ports: readonly PortInstance[] = node.getPorts();
  const definitionPorts: readonly PortDeclaration[] =
    nodeDefinition?.ports ?? [];

  // Build data entries by merging instance ports with declaration data.
  // Priority: declaration data > instance data (definition is source of truth).
  const mergedPorts: PortDataEntry[] = definitionPorts.map((decl) => {
    const entry: PortDataEntry = {
      id: decl.id,
      direction: decl.direction,
    };
    if (decl.name !== undefined) {
      entry.name = decl.name;
    }
    if (decl.dataType !== undefined) {
      entry.dataType = decl.dataType;
    }
    if (decl.visual !== undefined) {
      entry.visual = decl.visual;
    }
    return entry;
  });

  // If there are instance ports without a matching declaration (should not happen
  // in practice, but handle defensively), include them too.
  for (const inst of ports) {
    if (!mergedPorts.find((p) => p.id === inst.id)) {
      mergedPorts.push({
        id: inst.id,
        direction: inst.direction,
      });
    }
  }

  // Determine label: prefer node metadata name, fall back to definition name.
  const nodeMetadataName = node.metadata?.name;
  const label =
    typeof nodeMetadataName === "string" && nodeMetadataName.length > 0
      ? nodeMetadataName
      : (nodeDefinition?.name ?? nodeDefinition?.id ?? "");

  // Build data record — spread as Record<string, unknown> to satisfy RF's data type.
  // Visual is only included when defined (exactOptionalPropertyTypes).
  const data: Record<string, unknown> = {
    definitionId: node.definitionId,
    label,
    ports: mergedPorts,
    properties: node.getProperties(),
  };
  if (nodeDefinition?.renderer !== undefined) {
    data["rendererId"] = nodeDefinition.renderer;
  }
  if (nodeDefinition?.visual !== undefined) {
    (data as Record<string, NodeDataValue>).visual = nodeDefinition.visual;
  }

  // Port handles are rendered by the node-type wrapper (createNodeType →
  // PortHandle). No `handles` array is attached here: React Flow does
  // not read one from the node object.
  return {
    id: node.id,
    type: nodeDefinition?.renderer ?? "nodera-default-node",
    position: node.position ?? { x: 0, y: 0 },
    data,
  };
};

// --- Edge mapping ---

/**
 * Convert a Nodera graph's edges into React Flow edges.
 *
 * @param graph - the Nodera domain Graph instance (for node lookup)
 * @param resolveEdgeDefinition - resolver function for EdgeDefinition by id
 * @returns ReactFlowEdge[] ready for the RF store
 */
export const toReactFlowEdges = (
  graph: Graph,
  resolveEdgeDefinition: (definitionId: string) => EdgeDefinition | undefined,
): ReactFlowEdge[] => {
  return graph.getEdges().map((edge: Edge) => {
    const definition = edge.definitionId
      ? resolveEdgeDefinition(edge.definitionId)
      : undefined;
    const visual: EdgeVisual | undefined = definition?.visual;

    // Determine RF edge type from definition.renderer or geometry.
    // Precedence: definition.renderer > geometry-mapped type > default.
    const type =
      definition?.renderer ??
      geometryToEdgeType(visual?.geometry) ??
      "nodera-default-edge";

    // Build edge object.
    const rfEdge: ReactFlowEdge = {
      id: edge.id,
      type,
      source: edge.connection.source.nodeId,
      target: edge.connection.target.nodeId,
      sourceHandle: edge.connection.source.portId,
      targetHandle: edge.connection.target.portId,
      label: edge.label,
    };

    // Visual → RF fields.
    if (visual) {

      // Animation → animated flag.
      if (animationToAnimated(visual.animation)) {
        rfEdge.animated = true;
      }

      // LineStyle → strokeDasharray (solid leaves it unset).
      if (visual.lineStyle === "dashed" || visual.lineStyle === "dotted") {
        const dash = visual.lineStyle === "dashed" ? "6 6" : "2 4";
        rfEdge.style = { ...rfEdge.style, strokeDasharray: dash };
      }

      // Color → stroke style.
      if (visual.color) {
        rfEdge.style = { ...rfEdge.style, stroke: visual.color };
      }

      // Arrows → markers.
      if (visual.arrowEnd) {
        rfEdge.markerEnd = "arrow";
      }
      if (visual.arrowStart) {
        rfEdge.markerStart = "arrow";
      }

      // Renderer-only style hints → the edge data the renderer receives.
      // They stay apart from `style`, where a `strokeDasharray` derived from
      // `lineStyle` and one declared as a hint would be indistinguishable.
      const hints = edgeStyleHints(visual);
      if (hints !== undefined) {
        rfEdge.data = { ...rfEdge.data, styleHints: hints };
      }
    }

    return rfEdge;
  });
};

// --- Public exports ---

/**
 * Convert a Nodera graph's nodes into React Flow nodes.
 *
 * @param graph - the Nodera domain Graph instance (for node lookup)
 * @param resolveNodeDefinition - resolver function for NodeDefinition by id
 * @returns ReactFlowNode[] ready for the RF store
 */
export const toReactFlowNodes = (
  graph: Graph,
  resolveNodeDefinition: (definitionId: string) => NodeDefinition | undefined,
): ReactFlowNode[] => {
  return graph.getNodes().map((node: Node) => {
    const definition = node.definitionId
      ? resolveNodeDefinition(node.definitionId)
      : undefined;
    return toReactFlowNode(node, definition);
  });
};

// --- React Flow → Nodera (reverse mapping) ---

/**
 * Extract node position from a React Flow node (e.g., after drag end).
 *
 * @param rfNode - a partial or full ReactFlowNode
 * @returns { nodeId, position } for use in MoveNodeInput
 */
export const nodePositionFromReactFlow = (
  rfNode: ReactFlowNode,
): { nodeId: string; position: XYPosition } => {
  return {
    nodeId: rfNode.id,
    position: rfNode.position,
  };
};

/**
 * Build a Nodera connection structure from React Flow connection params.
 *
 * Returns undefined when sourceHandle or targetHandle is null/missing —
 * indicating no valid connection should be created.
 *
 * @param params - source/target node ids and optional handle ids
 * @returns connection or undefined
 */
export const connectionFromReactFlow = (params: {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}):
  | {
      source: { nodeId: string; portId: string };
      target: { nodeId: string; portId: string };
    }
  | undefined => {
  if (params.sourceHandle === null || params.sourceHandle === undefined) {
    return undefined;
  }
  if (params.targetHandle === null || params.targetHandle === undefined) {
    return undefined;
  }
  return {
    source: { nodeId: params.source, portId: params.sourceHandle },
    target: { nodeId: params.target, portId: params.targetHandle },
  };
};

/**
 * Remove change types for nodes and edges in React Flow.
 *
 * NodeRemoveChange: { id: string; type: 'remove' }
 * EdgeRemoveChange: { id: string; type: 'remove' }
 *
 * Both share the same discriminated union shape (type === 'remove').
 * This utility extracts the ids from any incoming changes array.
 */
type RemoveChange = { id: string; type: "remove" };

/**
 * Whether any `dimensions` change in the batch carries measurements we
 * have not stored yet (new node or changed size). Driving the re-render
 * from this guard is what prevents the controlled-flow feedback loop:
 * React Flow re-emits identical dimensions after every node-object
 * re-derivation, and refreshing on those re-emissions loops forever.
 */
export function hasNewDimensions(
  changes: readonly unknown[],
  measured: Map<string, { width: number; height: number }>,
): boolean {
  return changes.some((change) => {
    if (
      typeof change !== "object" ||
      change === null ||
      (change as { type?: unknown }).type !== "dimensions"
    ) {
      return false;
    }
    const dims = (change as { dimensions?: { width: number; height: number } }).dimensions;
    if (!dims) {
      return false;
    }
    const prev = measured.get((change as { id: string }).id);
    return !prev || prev.width !== dims.width || prev.height !== dims.height;
  });
}

/**
 * Merge React Flow's measured node dimensions (from `dimensions` node
 * changes) into the derived nodes. The minimap only paints nodes with
 * known dimensions, and a controlled flow must apply them itself.
 *
 * `measured` is what makes the merged node survive a re-render. React Flow
 * copies `userNode.measured` into its internal node on every adoption, and
 * `parseHandles` answers `undefined` when a user node has no `measured` —
 * deliberately, so a host that "re-initializes" a node gets it re-measured.
 * Since this canvas re-derives the nodes from the document on every change, a
 * repeatedly dragged node would lose `internals.handleBounds` on every pointer
 * move (its handle geometry, not its size), `getEdgePosition` would answer
 * `null` for its edges, and `EdgeWrapper` would unmount them for a frame: the
 * edges of the node being dragged flicker. Carrying `measured` keeps the
 * internal `handleBounds`, so only the position changes and the edges paint in
 * the same frame as the node. Dimensions stay canvas state: the document is
 * still untouched.
 *
 * Also prunes stored dimensions for nodes that no longer exist.
 */
export function applyMeasuredDimensions<T extends { id: string }>(
  nodes: readonly T[],
  measured: Map<string, { width: number; height: number }>,
): T[] {
  const live = new Set(nodes.map((n) => n.id));
  for (const id of [...measured.keys()]) {
    if (!live.has(id)) {
      measured.delete(id);
    }
  }
  return nodes.map((node) => {
    const dims = measured.get(node.id);
    return dims
      ? {
          ...node,
          width: dims.width,
          height: dims.height,
          measured: { width: dims.width, height: dims.height },
        }
      : node;
  });
}

/**
 * Live positions a drag reports, keyed by node id.
 *
 * React Flow's controlled model never paints a position change itself: with a
 * `nodes` prop (`hasDefaultNodes === false`) it reports every intermediate
 * position through `onNodesChange` and expects the host to apply it, so a canvas
 * that ignored them would not move the node at all — the pointer would travel
 * and nothing would follow it.
 *
 * Only changes flagged `dragging: true` belong here. The release emits one last
 * position with `dragging: false`, and that one must **not** be kept: under the
 * `"snap-back"` policy it would leave the node at the pointer position instead
 * of returning to the position the document holds.
 */
export function dragPositionsFromChanges(
  changes: readonly NodeChange[],
): Map<string, XYPosition> {
  const positions = new Map<string, XYPosition>();
  for (const change of changes) {
    if (change.type !== "position" || change.dragging !== true) {
      continue;
    }
    if (change.position !== undefined) {
      positions.set(change.id, change.position);
    }
  }
  return positions;
}

/**
 * Merge the live drag positions into the derived nodes, and nothing else.
 *
 * This is canvas state (AGENTS.md §5.3): the engine and the document are not
touched until the drag stop, and a node the drag never reported keeps the
position the document gave it.
 */
export function applyDragPositions<T extends { id: string; position: XYPosition }>(
  nodes: readonly T[],
  positions: ReadonlyMap<string, XYPosition>,
): T[] {
  if (positions.size === 0) {
    return [...nodes];
  }
  return nodes.map((node) => {
    const position = positions.get(node.id);
    return position === undefined ? node : { ...node, position };
  });
}

/**
 * Extract removed node/edge ids from React Flow changes arrays.
 *
 * Filters for remove-change entries and returns their ids.
 * Works with both NodeChange[] and EdgeChange[].
 *
 * @param changes - NodeChange[] or EdgeChange[] from RF callbacks
 * @returns array of removed ids
 */
export const removedIdsFromReactFlowChanges = (
  changes: (NodeChange | EdgeChange)[],
): string[] => {
  return changes
    .filter((c): c is RemoveChange => c.type === "remove")
    .map((c) => c.id);
};