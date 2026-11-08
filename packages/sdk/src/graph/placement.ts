/**
 * Deterministic placement of the nodes a host left unpositioned.
 *
 * Pure geometry over positions and settings: no React, no React Flow, no
 * presentation engine. The same occupied positions always yield the same slot,
 * whatever order the nodes are stored in, so a host reading the document gets
 * stable coordinates and a document round trip keeps them.
 *
 * A position is never invented for a node the host positioned itself, and
 * `"free"` mode never places anything: the absence of a position means the host
 * has not placed the node yet, which is a state, not the origin.
 */

import type { NodePosition } from "@nodera/graph-model";
import type { GraphLayoutConfiguration } from "../builder/configuration.js";

/** Who owns placement: the host, or the builder for the nodes left unpositioned. */
export type GraphLayoutMode = "free" | "auto";

/** Axis the automatic placement grows along. */
export type GraphLayoutDirection = "horizontal" | "vertical";

/** Default distance between adjacent automatic slots, in document units. */
export const DEFAULT_GRAPH_LAYOUT_SPACING = 240;

/** Graph layout settings resolved from the host configuration. */
export interface ResolvedGraphLayout {
  readonly mode: GraphLayoutMode;
  readonly direction: GraphLayoutDirection;
  readonly spacing: number;
}

/** Settings of a builder that places nothing: today's free editing. */
export const FREE_GRAPH_LAYOUT: ResolvedGraphLayout = {
  mode: "free",
  direction: "horizontal",
  spacing: DEFAULT_GRAPH_LAYOUT_SPACING,
};

/**
 * Resolves a validated configuration into the settings the add-node boundary
 * reads.
 *
 * It expects a configuration the builder composition root already accepted,
 * and stays fail-closed if it ever sees something else: an unknown mode falls
 * back to `"free"`, so an invalid value can never invent geometry.
 */
export function resolveGraphLayout(
  configuration: GraphLayoutConfiguration | undefined,
): ResolvedGraphLayout {
  const mode = configuration?.mode;
  return {
    mode: mode === "auto" ? "auto" : "free",
    direction: configuration?.direction === "vertical" ? "vertical" : "horizontal",
    spacing:
      typeof configuration?.spacing === "number" &&
      Number.isFinite(configuration.spacing) &&
      configuration.spacing > 0
        ? configuration.spacing
        : DEFAULT_GRAPH_LAYOUT_SPACING,
  };
}

/** Positions of the nodes that carry one, in the order the graph stores them. */
export function occupiedPositions(
  nodes: readonly { readonly position?: NodePosition | undefined }[],
): readonly NodePosition[] {
  const positions: NodePosition[] = [];
  for (const node of nodes) {
    if (node.position !== undefined) {
      positions.push(node.position);
    }
  }
  return positions;
}

/**
 * Position the add-node boundary assigns, or `undefined` when the host owns
 * placement.
 */
export function placeUnpositionedNode(
  occupied: readonly NodePosition[],
  layout: ResolvedGraphLayout,
): NodePosition | undefined {
  return layout.mode === "auto" ? nextFreeSlot(occupied, layout) : undefined;
}

/**
 * First free slot of a grid anchored at the origin.
 *
 * `horizontal` scans row-major (row 0 left to right, then row 1) and `vertical`
 * scans column-major, so a graph grows along the axis the host declared. The
 * scan is bounded by the number of occupied positions, which guarantees an
 * empty slot: a finite set of nodes cannot fill more slots than it has.
 */
export function nextFreeSlot(
  occupied: readonly NodePosition[],
  layout: ResolvedGraphLayout,
): NodePosition {
  const taken = new Set(occupied.map(slotKey));
  const limit = occupied.length;
  const vertical = layout.direction === "vertical";
  for (let first = 0; first <= limit; first += 1) {
    for (let second = 0; second <= limit; second += 1) {
      const candidate = vertical
        ? { x: first * layout.spacing, y: second * layout.spacing }
        : { x: second * layout.spacing, y: first * layout.spacing };
      if (!taken.has(slotKey(candidate))) {
        return candidate;
      }
    }
  }
  throw new RangeError("Automatic placement found no free slot for a finite graph");
}

function slotKey(position: NodePosition): string {
  return `${position.x},${position.y}`;
}
