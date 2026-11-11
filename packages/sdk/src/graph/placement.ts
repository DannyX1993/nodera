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
 *
 * Placement reads three things and nothing else: the positions the document
 * already carries, the resolved layout settings and the **position** of the
 * anchor the host passed. It never sees an id, a selection or a canvas, which is
 * what keeps the answer a function of the document alone.
 */

import type { NodePosition } from "@nodera/graph-model";
import {
  DEFAULT_LAYOUT_NODE_SIZE,
  resolveLayoutNodeSize,
  type GraphLayoutNodeSize,
} from "@nodera/graph-layout";
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
  /**
   * Gap between two neighbouring boxes, in document units.
   *
   * It measures the **gap**, never the distance between two positions: the step
   * between consecutive slots is the box extent plus this gap, exactly as
   * `Arrange` computes it, and the same number reaches the strategy as its
   * `nodeSpacing`.
   */
  readonly spacing: number;
  /**
   * Fallback box of a node, which the automatic step reserves.
   *
   * One source for both placements: the host's `graph.layout.nodeSize` when it
   * declared a box, else the ranked strategy's own default
   * (`resolveLayoutNodeSize`), so the add-time grid and the ranked grid measure
   * the same boxes.
   */
  readonly nodeSize: GraphLayoutNodeSize;
}

/** Settings of a builder that places nothing: today's free editing. */
export const FREE_GRAPH_LAYOUT: ResolvedGraphLayout = {
  mode: "free",
  direction: "horizontal",
  spacing: DEFAULT_GRAPH_LAYOUT_SPACING,
  nodeSize: DEFAULT_LAYOUT_NODE_SIZE,
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
    nodeSize: resolveLayoutNodeSize(usableNodeSize(configuration?.nodeSize)),
  };
}

/**
 * A declared box that can describe one, or `undefined`.
 *
 * A value that cannot (zero, negative, non-finite) is treated as absent instead
 * of producing a step that cannot hold a node; the default itself is not decided
 * here — {@link resolveLayoutNodeSize} owns it, so the add-time grid and the
 * ranked grid read one box.
 */
function usableNodeSize(
  nodeSize: { readonly width: number; readonly height: number } | undefined,
): GraphLayoutNodeSize | undefined {
  return nodeSize !== undefined &&
    Number.isFinite(nodeSize.width) &&
    nodeSize.width > 0 &&
    Number.isFinite(nodeSize.height) &&
    nodeSize.height > 0
    ? { width: nodeSize.width, height: nodeSize.height }
    : undefined;
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
 *
 * `anchorPosition` is the position of the node the host asked to place the new
 * one after, when that node carries one. An anchor without a position is the
 * same case as no anchor at all: the node lands after the graph's extent.
 */
export function placeUnpositionedNode(
  occupied: readonly NodePosition[],
  layout: ResolvedGraphLayout,
  anchorPosition?: NodePosition | undefined,
): NodePosition | undefined {
  return layout.mode === "auto"
    ? nextFreeSlot(occupied, layout, anchorPosition)
    : undefined;
}

/**
 * First free slot at or ahead of the point placement starts from.
 *
 * The step between two consecutive slots is measured in **boxes**, exactly like
 * the ranked layout: the box extent of the axis the layout advances along plus
 * `spacing`. `horizontal` advances `x`, so it reserves the box `width`;
 * `vertical` advances `y` and reserves the `height`. `spacing` is therefore the
 * gap between two neighbouring boxes, never the distance between their origins,
 * which is what keeps a host that declares a spacing below its node size from
 * getting overlapping slots.
 *
 * With an anchor the walk starts one step past it and keeps the anchor's own row;
 * an occupied slot only ever pushes the candidate **forward**, never backward, so
 * a new node always lands after the node it follows. Without an anchor the graph
 * grows along the same rule, from the farthest slot it occupies.
 *
 * An empty graph — no occupied positions at all, which includes a document
 * whose nodes carry no position yet — starts at the origin. The walk is bounded
 * by the finite set of occupied slots, so it always terminates.
 */
export function nextFreeSlot(
  occupied: readonly NodePosition[],
  layout: ResolvedGraphLayout,
  anchorPosition?: NodePosition | undefined,
): NodePosition {
  const start = anchorPosition ?? farthestSlot(occupied, layout);
  if (start === undefined) {
    return { x: 0, y: 0 };
  }
  const taken = new Set(occupied.map(slotKey));
  const vertical = layout.direction === "vertical";
  const step = (vertical ? layout.nodeSize.height : layout.nodeSize.width) + layout.spacing;
  let candidate: NodePosition = vertical
    ? { x: start.x, y: start.y + step }
    : { x: start.x + step, y: start.y };
  while (taken.has(slotKey(candidate))) {
    candidate = vertical
      ? { x: start.x, y: candidate.y + step }
      : { x: candidate.x + step, y: start.y };
  }
  return candidate;
}

/**
 * Farthest slot the graph occupies along the layout axis, or `undefined` when no
 * node carries a position.
 *
 * The slot keeps its own perpendicular coordinate, so the next node shares the
 * row (or column) of the end of the graph instead of jumping to a new one. Ties
 * on the axis are broken by the smaller perpendicular coordinate, which makes
 * the answer depend only on the set of positions: node ids and storage order
 * never change it.
 */
function farthestSlot(
  occupied: readonly NodePosition[],
  layout: ResolvedGraphLayout,
): NodePosition | undefined {
  const vertical = layout.direction === "vertical";
  let farthest: NodePosition | undefined;
  for (const position of occupied) {
    if (farthest === undefined) {
      farthest = position;
      continue;
    }
    const along = vertical ? position.y - farthest.y : position.x - farthest.x;
    const across = vertical ? position.x - farthest.x : position.y - farthest.y;
    if (along > 0 || (along === 0 && across < 0)) {
      farthest = position;
    }
  }
  return farthest;
}

function slotKey(position: NodePosition): string {
  return `${position.x},${position.y}`;
}
