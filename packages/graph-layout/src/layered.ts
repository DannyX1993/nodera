import { err, ok } from "@nodera/contracts";
import type { NodeId, Result } from "@nodera/contracts";

import { resolveLayoutNodeSize } from "./node-size.js";
import type {
  GraphLayoutDiagnostic,
  GraphLayoutEdgeInput,
  GraphLayoutInput,
  GraphLayoutNodeInput,
  GraphLayoutNodeSize,
  GraphLayoutOptions,
  GraphLayoutPlacedNode,
  GraphLayoutResult,
  GraphLayoutStrategy,
} from "./strategy.js";

export const LAYERED_STRATEGY_ID = "nodera.graph-layout.layered";

/**
 * The fallback box of a node with no size of its own, re-exported from
 * `./node-size.js`, which owns it and the resolver that answers it.
 *
 * Kept at this path so an existing import of `DEFAULT_LAYOUT_NODE_SIZE` from the
 * layered strategy keeps working.
 */
export { DEFAULT_LAYOUT_NODE_SIZE } from "./node-size.js";

const DIRECTIONS: readonly string[] = ["horizontal", "vertical"];
const SCOPES: readonly string[] = ["all", "unpositioned"];

/**
 * In-house layered placement (odd task T2, S9/S10).
 *
 * Every node is ranked by longest path from the source nodes; the nodes of each
 * rank are then ordered by a **barycenter** sweep, and a node with no edge at all
 * joins the cycle-locked bucket after every resolved rank, so it never lands at
 * the origin. The cross axis is then **aligned with the neighbours** (see
 * {@link alignCross}): a node with several children sits over their mean, a node
 * with one parent sits in that parent's column. There is no edge routing and no
 * edge bend point: a ranked, evenly spaced grid is what the `Arrange` scope
 * needs, and a dependency that hands the same obligations back is not worth
 * adding (S9).
 *
 * The barycenter ordering **reduces** crossings — it removes the sibling
 * crossings a plain id order produced — but it does **not** guarantee a
 * crossing-free drawing: minimising crossings is NP-hard, and a heuristic that
 * claims a guarantee would be lying to its host.
 *
 * The answer depends only on the *set* of nodes and edges, never on the order
 * the caller listed them in, so the same graph always arranges the same way.
 */
export function createLayeredStrategy(): GraphLayoutStrategy {
  return {
    id: LAYERED_STRATEGY_ID,
    place(input: GraphLayoutInput): Result<GraphLayoutResult, GraphLayoutDiagnostic> {
      const options = input.options;
      const invalidOptions = optionsFailure(options);
      if (invalidOptions !== undefined) {
        return err(invalidOptions);
      }

      const ids = new Set<NodeId>();
      for (const node of input.nodes) {
        if (ids.has(node.id)) {
          return err({
            code: "graph-layout.duplicate-node",
            message: `graph layout input declares the node "${node.id}" more than once`,
            nodeId: node.id,
          });
        }
        ids.add(node.id);
      }

      for (const edge of input.edges) {
        for (const endpoint of [edge.source, edge.target]) {
          if (!ids.has(endpoint)) {
            return err({
              code: "graph-layout.unknown-edge-node",
              message: `graph layout edge "${edge.source}" -> "${edge.target}" references the unknown node "${endpoint}"`,
              nodeId: endpoint,
            });
          }
        }
      }

      const rankByNode = rankNodes(input.nodes, input.edges);
      const ranks = groupByRank(input.nodes, input.edges, rankByNode);
      return ok<GraphLayoutResult>({
        positions: placeRanks(ranks, input.nodes, input.edges, options),
      });
    },
  } satisfies GraphLayoutStrategy;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Fail-closed option validation: a host that bypasses the types still gets a
 * diagnostic instead of geometry built from a nonsense spacing.
 */
function optionsFailure(options: GraphLayoutOptions): GraphLayoutDiagnostic | undefined {
  if (!isPositiveFinite(options.nodeSpacing)) {
    return {
      code: "graph-layout.invalid-options",
      message: `graph layout nodeSpacing must be a positive finite number, got ${String(options.nodeSpacing)}`,
    };
  }
  if (!isPositiveFinite(options.rankSpacing)) {
    return {
      code: "graph-layout.invalid-options",
      message: `graph layout rankSpacing must be a positive finite number, got ${String(options.rankSpacing)}`,
    };
  }
  const nodeSizeFailure = nodeSizeDiagnostic(options.nodeSize);
  if (nodeSizeFailure !== undefined) {
    return nodeSizeFailure;
  }
  if (!DIRECTIONS.includes(options.direction)) {
    return {
      code: "graph-layout.invalid-options",
      message: `graph layout direction must be "horizontal" or "vertical", got ${String(options.direction)}`,
    };
  }
  if (!SCOPES.includes(options.scope)) {
    return {
      code: "graph-layout.invalid-options",
      message: `graph layout scope must be "all" or "unpositioned", got ${String(options.scope)}`,
    };
  }
  return undefined;
}

/**
 * Validates the fallback box, naming the offending field.
 *
 * `nodeSize` is optional — its absence means "use the default box" — but a value
 * that is present has to be a box: the strategy refuses to guess a geometry from
 * a zero, negative or non-finite extent.
 */
function nodeSizeDiagnostic(nodeSize: unknown): GraphLayoutDiagnostic | undefined {
  if (nodeSize === undefined) {
    return undefined;
  }
  if (typeof nodeSize !== "object" || nodeSize === null) {
    return {
      code: "graph-layout.invalid-options",
      message: `graph layout nodeSize must be an object declaring a width and a height, got ${String(nodeSize)}`,
    };
  }
  for (const field of ["width", "height"] as const) {
    const extent: unknown = Reflect.get(nodeSize, field);
    if (typeof extent !== "number" || !isPositiveFinite(extent)) {
      return {
        code: "graph-layout.invalid-options",
        message: `graph layout nodeSize.${field} must be a positive finite number, got ${String(extent)}`,
      };
    }
  }
  return undefined;
}

/** Compares two element ids by code unit: stable, locale-independent ordering. */
function compareIds(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

/**
 * Assigns every node a rank: the length of the longest path that reaches it from
 * a source node.
 *
 * A source is a node with no incoming edge **and** at least one outgoing edge.
 * A node with neither incoming nor outgoing edge is isolated: it belongs to no
 * path at all, so it takes the rank after every resolved rank — the bucket the
 * cycle-locked nodes already use — ordered by node id, instead of the rank `0`
 * a node nobody depends on would otherwise get.
 *
 * The relaxation runs over the edges in canonical order and is capped at the node
 * count, so it always terminates. A node locked in a cycle never reaches a
 * finite longest path; a node no source can reach is exactly such a node, so
 * whatever is still unranked afterwards is placed after every resolved rank, all
 * in one rank ordered by node id (S10).
 */
function rankNodes(
  nodes: readonly GraphLayoutNodeInput[],
  edges: readonly GraphLayoutEdgeInput[],
): Map<NodeId, number> {
  const orderedNodes = [...nodes].sort((left, right) => compareIds(left.id, right.id));
  const orderedEdges = [...edges].sort(
    (left, right) => compareIds(left.source, right.source) || compareIds(left.target, right.target),
  );

  const incomingCount = new Map<NodeId, number>();
  for (const node of orderedNodes) {
    incomingCount.set(node.id, 0);
  }
  // Every node any edge touches, which is exactly "not isolated".
  const connected = new Set<NodeId>();
  for (const edge of orderedEdges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    connected.add(edge.source);
    connected.add(edge.target);
  }

  const rankByNode = new Map<NodeId, number>();
  for (const node of orderedNodes) {
    if ((incomingCount.get(node.id) ?? 0) === 0 && connected.has(node.id)) {
      rankByNode.set(node.id, 0);
    }
  }

  for (let pass = 0; pass < orderedNodes.length; pass += 1) {
    let changed = false;
    for (const edge of orderedEdges) {
      const sourceRank = rankByNode.get(edge.source);
      if (sourceRank === undefined) {
        continue;
      }
      const candidate = sourceRank + 1;
      const rank = rankByNode.get(edge.target);
      if (rank === undefined || rank < candidate) {
        rankByNode.set(edge.target, candidate);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  let highestResolvedRank = -1;
  for (const rank of rankByNode.values()) {
    highestResolvedRank = Math.max(highestResolvedRank, rank);
  }
  const cycleRank = highestResolvedRank + 1;
  for (const node of orderedNodes) {
    if (!rankByNode.has(node.id)) {
      rankByNode.set(node.id, cycleRank);
    }
  }

  return rankByNode;
}

/**
 * The node ids of each rank, ordered by a barycenter sweep.
 *
 * The ranking itself is untouched: this only chooses the in-rank index.
 */
function groupByRank(
  nodes: readonly GraphLayoutNodeInput[],
  edges: readonly GraphLayoutEdgeInput[],
  rankByNode: ReadonlyMap<NodeId, number>,
): Map<number, NodeId[]> {
  const groups = new Map<number, NodeId[]>();
  for (const node of nodes) {
    const rank = rankByNode.get(node.id);
    if (rank === undefined) {
      continue;
    }
    const group = groups.get(rank);
    if (group === undefined) {
      groups.set(rank, [node.id]);
    } else {
      group.push(node.id);
    }
  }
  for (const group of groups.values()) {
    group.sort(compareIds);
  }
  orderByBarycenter(groups, parentsByNode(edges));
  return groups;
}

/** Each node's distinct parents, keyed by the node they point at. */
function parentsByNode(
  edges: readonly GraphLayoutEdgeInput[],
): ReadonlyMap<NodeId, readonly NodeId[]> {
  const parents = new Map<NodeId, NodeId[]>();
  for (const edge of edges) {
    const of = parents.get(edge.target);
    if (of === undefined) {
      parents.set(edge.target, [edge.source]);
    } else if (!of.includes(edge.source)) {
      of.push(edge.source);
    }
  }
  return parents;
}

/**
 * Reorders each rank by the barycenter of its nodes: the **mean** in-rank index
 * of the node's distinct parents in the previous rank (median was the other
 * candidate; the mean is what makes a node sit under the centre of its parents
 * and costs one pass).
 *
 * One deterministic sweep, over the ranks in ascending order: each rank is
 * ordered only after the previous one is final, so every node reads the same
 * parent indices no matter how the caller listed the nodes or the edges. A
 * second identical sweep cannot change anything — the pass is idempotent — so
 * "one or two sweeps" is answered with one.
 *
 * A node with no parent in the previous rank (a source, an isolated node, or a
 * node of the cycle-locked bucket) has no mean; it keeps its own current index,
 * which is where the id-ordered base put it. Equal keys fall back to node id.
 */
function orderByBarycenter(
  groups: Map<number, NodeId[]>,
  parents: ReadonlyMap<NodeId, readonly NodeId[]>,
): void {
  /** In-rank index of every ranked node, filled rank by rank. */
  const indexInRank = new Map<NodeId, number>();

  for (const rank of [...groups.keys()].sort((left, right) => left - right)) {
    const ids = groups.get(rank) ?? [];
    const key = new Map<NodeId, number>();
    for (const id of ids) {
      let sum = 0;
      let count = 0;
      for (const parent of parents.get(id) ?? []) {
        const index = indexInRank.get(parent);
        if (index !== undefined) {
          sum += index;
          count += 1;
        }
      }
      key.set(id, count === 0 ? indexInRank.get(id) ?? 0 : sum / count);
    }
    ids.sort((left, right) => {
      const leftKey = key.get(left) ?? 0;
      const rightKey = key.get(right) ?? 0;
      if (leftKey !== rightKey) {
        return leftKey < rightKey ? -1 : 1;
      }
      return compareIds(left, right);
    });
    ids.forEach((id, index) => {
      indexInRank.set(id, index);
    });
  }
}

/**
 * Turns the ranks into positions, in rank order and then in-rank order.
 *
 * The cross axis is measured in **boxes**, not in positions. Every box takes the
 * space its `width` (or `height`, for the axis the rank advances along) declares,
 * falling back to `options.nodeSize` and then to the one shared default box
 * ({@link resolveLayoutNodeSize}), and a rank steps by the **widest** box it
 * holds plus `nodeSpacing`: `pitch = max(boxCross) + nodeSpacing`. `nodeSpacing`
 * is therefore the gap between two neighbouring boxes, not the distance between
 * their origins, which is what keeps a rank of mixed sizes from overlapping
 * itself.
 *
 * The cross coordinate itself is **aligned with the neighbours**, not centred on
 * the widest rank: the i-th node of a rank starts at `i * pitch` in the order the
 * barycenter sweep decided, and {@link alignCross} then moves each node onto the
 * mean of its parents, the mean of its children, and back again — twice, the
 * budget — restoring the order and the `pitch` separation after every move. The
 * result is normalised to the cross origin, so the grid still starts at `0` on
 * both axes.
 *
 * That alignment is the whole point of the geometry: a branch's last node keeps
 * the column of its parent instead of drifting to the midpoint of the graph, and
 * a node with several children sits over the centre of those children. The
 * emitted position stays the box's **top-left corner**, the in-rank order the
 * barycenter sweep decided is preserved, and the rank axis is untouched: ranks
 * stay at `rank * rankSpacing`.
 *
 * `horizontal` puts the rank on `x` and the cross offset on `y`; `vertical` swaps
 * the axes, which also swaps which extent of the box the cross axis reads. With
 * `scope: "unpositioned"` the nodes the document already positions are dropped
 * from the answer but keep their slot — the geometry is computed over the **full**
 * ranks, never from the emitted subset — so the grid the host sees does not change
 * with the scope.
 */
function placeRanks(
  ranks: ReadonlyMap<number, readonly NodeId[]>,
  nodes: readonly GraphLayoutNodeInput[],
  edges: readonly GraphLayoutEdgeInput[],
  options: GraphLayoutOptions,
): readonly GraphLayoutPlacedNode[] {
  const positioned = new Set<NodeId>();
  const vertical = options.direction === "vertical";
  // The extent the cross axis reads, per node: the width when the ranks advance
  // along `y` (the boxes of a rank sit side by side) and the height when they
  // advance along `x` (they stack).
  const crossExtentById = new Map<NodeId, number>();
  for (const node of nodes) {
    if (node.position !== undefined) {
      positioned.add(node.id);
    }
    const box = boxOf(node, options);
    crossExtentById.set(node.id, vertical ? box.width : box.height);
  }

  const geometry = [...ranks.keys()]
    .sort((left, right) => left - right)
    .map((rank) => {
      const ids = ranks.get(rank) ?? [];
      return { rank, ids, pitch: crossPitch(ids, crossExtentById, options.nodeSpacing) };
    });
  const cross = alignCross(geometry, edges);

  const positions: GraphLayoutPlacedNode[] = [];
  for (const { rank, ids } of geometry) {
    const rankOffset = rank * options.rankSpacing;
    for (const nodeId of ids) {
      if (options.scope === "unpositioned" && positioned.has(nodeId)) {
        continue;
      }
      const crossOffset = cross.get(nodeId) ?? 0;
      const position = vertical
        ? { x: crossOffset, y: rankOffset }
        : { x: rankOffset, y: crossOffset };
      positions.push({ nodeId, position });
    }
  }
  return positions;
}

/** One rank of the grid: its index, its in-rank order and its box pitch. */
interface RankGeometry {
  readonly rank: number;
  readonly ids: readonly NodeId[];
  readonly pitch: number;
}

/**
 * How many down-then-up pass pairs the alignment runs.
 *
 * Two is the budget, not a convergence loop: the first pair moves every node onto
 * its neighbours, and the second lets a parent the upward pass moved pull its
 * children along in the next downward pass. Further pairs only repeat the
 * oscillation the second one settled.
 */
const ALIGNMENT_PASS_PAIRS = 2;

/**
 * Assigns the cross coordinate of every ranked node by aligning it with its
 * neighbours.
 *
 * The base is the barycenter order: the i-th node of a rank starts at `i * pitch`.
 * Then {@link ALIGNMENT_PASS_PAIRS} pairs of passes run over the ranks:
 *
 * 1. **Downward**, ranks ascending: a node with at least one parent in an earlier
 *    rank wants the **mean of those parents**; a node without one keeps the
 *    coordinate it has.
 * 2. **Upward**, ranks descending: a node with at least one child in a later rank
 *    wants the **mean of those children**; a leaf keeps the coordinate the
 *    downward pass gave it.
 *
 * Each pass ends with {@link restoreSeparation}, so the in-rank order survives and
 * two boxes of one rank never overlap, and the whole answer is normalised at the
 * end so the graph starts at the cross origin.
 *
 * The answer depends only on the *set* of nodes and edges: the ranks are visited
 * in rank order, the in-rank order is the one the barycenter sweep produced (ties
 * broken by node id), and the neighbours of a node are summed in node-id order.
 * The cycle-locked bucket has no parent in an earlier rank and no child in a later
 * one, so no pass moves it: it keeps the base slot.
 */
function alignCross(
  geometry: readonly RankGeometry[],
  edges: readonly GraphLayoutEdgeInput[],
): Map<NodeId, number> {
  const rankByNode = new Map<NodeId, number>();
  for (const entry of geometry) {
    for (const id of entry.ids) {
      rankByNode.set(id, entry.rank);
    }
  }
  const { parents, children } = alignmentNeighbours(edges);

  const cross = new Map<NodeId, number>();
  for (const entry of geometry) {
    entry.ids.forEach((id, indexInRank) => {
      cross.set(id, indexInRank * entry.pitch);
    });
  }

  for (let pair = 0; pair < ALIGNMENT_PASS_PAIRS; pair += 1) {
    for (const entry of geometry) {
      const desired = desiredCoordinates(entry, parents, rankByNode, cross, "earlier");
      restoreSeparation(entry, desired, cross, "grow");
    }
    for (const entry of [...geometry].reverse()) {
      const desired = desiredCoordinates(entry, children, rankByNode, cross, "later");
      restoreSeparation(entry, desired, cross, "keep-mean");
    }
  }

  let minimum = Number.POSITIVE_INFINITY;
  for (const coordinate of cross.values()) {
    minimum = Math.min(minimum, coordinate);
  }
  if (Number.isFinite(minimum) && minimum !== 0) {
    for (const [id, coordinate] of cross) {
      cross.set(id, coordinate - minimum);
    }
  }
  return cross;
}

/**
 * The distinct parents and the distinct children of every node, each list in
 * node-id order so a mean is summed in one canonical order.
 */
function alignmentNeighbours(edges: readonly GraphLayoutEdgeInput[]): {
  readonly parents: ReadonlyMap<NodeId, readonly NodeId[]>;
  readonly children: ReadonlyMap<NodeId, readonly NodeId[]>;
} {
  const parents = new Map<NodeId, NodeId[]>();
  const children = new Map<NodeId, NodeId[]>();
  for (const edge of edges) {
    appendNeighbour(parents, edge.target, edge.source);
    appendNeighbour(children, edge.source, edge.target);
  }
  for (const list of parents.values()) {
    list.sort(compareIds);
  }
  for (const list of children.values()) {
    list.sort(compareIds);
  }
  return { parents, children };
}

/** Adds `neighbour` to the list of `of`, once. */
function appendNeighbour(map: Map<NodeId, NodeId[]>, of: NodeId, neighbour: NodeId): void {
  const list = map.get(of);
  if (list === undefined) {
    map.set(of, [neighbour]);
  } else if (!list.includes(neighbour)) {
    list.push(neighbour);
  }
}

/**
 * The coordinate each node of a rank wants after one pass: the mean of the
 * neighbours that sit **before** it or **after** it, or its current coordinate
 * when it has none of them.
 *
 * A neighbour in the same rank (the cycle-locked bucket) is not a placed
 * neighbour in either direction, so it never pulls a node sideways.
 */
function desiredCoordinates(
  entry: RankGeometry,
  neighbours: ReadonlyMap<NodeId, readonly NodeId[]>,
  ranks: ReadonlyMap<NodeId, number>,
  cross: ReadonlyMap<NodeId, number>,
  side: "earlier" | "later",
): Map<NodeId, number> {
  const desired = new Map<NodeId, number>();
  for (const id of entry.ids) {
    let sum = 0;
    let count = 0;
    for (const neighbour of neighbours.get(id) ?? []) {
      const rank = ranks.get(neighbour);
      if (rank === undefined || (side === "earlier" ? rank >= entry.rank : rank <= entry.rank)) {
        continue;
      }
      sum += cross.get(neighbour) ?? 0;
      count += 1;
    }
    desired.set(id, count === 0 ? (cross.get(id) ?? 0) : sum / count);
  }
  return desired;
}

/**
 * Restores the in-rank order and the separation after the desired coordinates of
 * one rank have been written.
 *
 * A forward clamp, in the rank's final order: a node may not sit before its
 * predecessor plus one `pitch`, so a box is never pushed over the box before it
 * and the ordering the barycenter sweep chose survives. `strategy` says what to do
 * with the room the clamp added:
 *
 * - `"grow"`, the downward pass: leave it where it is. A rank whose nodes all
 *   want the same column spreads to the right of it, and the pair of passes that
 *   follows settles the whole graph.
 * - `"keep-mean"`, the upward pass: shift the rank so its mean stays the mean the
 *   children asked for. Without that, a rank pushed right by its own clamp would
 *   drag the next pass with it and the graph would drift sideways for good; with
 *   it, the rank is separated *around* the column it aligns with, which is what
 *   keeps a fork symmetric over its children.
 */
function restoreSeparation(
  entry: RankGeometry,
  desired: ReadonlyMap<NodeId, number>,
  cross: Map<NodeId, number>,
  strategy: "grow" | "keep-mean",
): void {
  const separated: number[] = [];
  let desiredTotal = 0;
  let separatedTotal = 0;
  for (const id of entry.ids) {
    const want = desired.get(id) ?? 0;
    desiredTotal += want;
    const previous = separated[separated.length - 1];
    const coordinate = previous === undefined ? want : Math.max(want, previous + entry.pitch);
    separated.push(coordinate);
    separatedTotal += coordinate;
  }
  const count = separated.length;
  const shift =
    strategy === "keep-mean" && count > 0 ? (desiredTotal - separatedTotal) / count : 0;
  entry.ids.forEach((id, indexInRank) => {
    cross.set(id, (separated[indexInRank] ?? 0) + shift);
  });
}

/**
 * The box of one node: what the host declared for it, the host's fallback box, or
 * the shared default, in that order.
 *
 * A declared extent that cannot describe a box (zero, negative, non-finite) is
 * treated as absent instead of producing geometry that cannot hold anything: the
 * sizes are hints, and a hint a host could not measure must not break the grid.
 */
function boxOf(node: GraphLayoutNodeInput, options: GraphLayoutOptions): GraphLayoutNodeSize {
  const fallback = resolveLayoutNodeSize(options.nodeSize);
  return {
    width: usableExtent(node.width) ?? fallback.width,
    height: usableExtent(node.height) ?? fallback.height,
  };
}

/** A declared extent, when it can describe a box. */
function usableExtent(extent: number | undefined): number | undefined {
  return extent !== undefined && isPositiveFinite(extent) ? extent : undefined;
}

/**
 * Distance between two neighbouring boxes of one rank: the widest box of the
 * rank plus the gap the host declared.
 *
 * One pitch per rank, so a rank whose boxes differ still steps by the room its
 * widest box needs. Every ranked id comes from the input nodes, so the extent is
 * always known; `0` is the identity of `max`, never a fallback box.
 */
function crossPitch(
  ids: readonly NodeId[],
  crossExtentById: ReadonlyMap<NodeId, number>,
  nodeSpacing: number,
): number {
  let widest = 0;
  for (const id of ids) {
    widest = Math.max(widest, crossExtentById.get(id) ?? 0);
  }
  return widest + nodeSpacing;
}
