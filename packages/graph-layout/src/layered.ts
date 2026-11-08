import { err, ok } from "@nodera/contracts";
import type { NodeId, Result } from "@nodera/contracts";

import type {
  GraphLayoutDiagnostic,
  GraphLayoutEdgeInput,
  GraphLayoutInput,
  GraphLayoutNodeInput,
  GraphLayoutOptions,
  GraphLayoutPlacedNode,
  GraphLayoutResult,
  GraphLayoutStrategy,
} from "./strategy.js";

export const LAYERED_STRATEGY_ID = "nodera.graph-layout.layered";

const DIRECTIONS: readonly string[] = ["horizontal", "vertical"];
const SCOPES: readonly string[] = ["all", "unpositioned"];

/**
 * In-house layered placement (odd task T2, S9/S10).
 *
 * Every node is ranked by longest path from the source nodes (nodes with no
 * incoming edge), then each rank is laid out in node-id order. There is no
 * crossing minimization and there are no edge bend points: a ranked, evenly
 * spaced grid is what the `Arrange` scope needs, and a dependency that hands the
 * same obligations back is not worth adding (S9).
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
      const ranks = groupByRank(input.nodes, rankByNode);
      return ok<GraphLayoutResult>({ positions: placeRanks(ranks, input.nodes, options) });
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
  for (const edge of orderedEdges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  const rankByNode = new Map<NodeId, number>();
  for (const node of orderedNodes) {
    if ((incomingCount.get(node.id) ?? 0) === 0) {
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

/** The node ids of each rank, ordered by node id. */
function groupByRank(
  nodes: readonly GraphLayoutNodeInput[],
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
  return groups;
}

/**
 * Turns the ranks into positions, in rank order and then node-id order.
 *
 * `horizontal` puts the rank on `x` and the in-rank index on `y`; `vertical`
 * swaps the axes. With `scope: "unpositioned"` the nodes the document already
 * positions are dropped from the answer but keep their slot, so the grid the host
 * sees does not change with the scope.
 */
function placeRanks(
  ranks: ReadonlyMap<number, readonly NodeId[]>,
  nodes: readonly GraphLayoutNodeInput[],
  options: GraphLayoutOptions,
): readonly GraphLayoutPlacedNode[] {
  const positioned = new Set<NodeId>();
  for (const node of nodes) {
    if (node.position !== undefined) {
      positioned.add(node.id);
    }
  }

  const positions: GraphLayoutPlacedNode[] = [];
  for (const rank of [...ranks.keys()].sort((left, right) => left - right)) {
    const ids = ranks.get(rank) ?? [];
    ids.forEach((nodeId, indexInRank) => {
      if (options.scope === "unpositioned" && positioned.has(nodeId)) {
        return;
      }
      const rankOffset = rank * options.rankSpacing;
      const indexOffset = indexInRank * options.nodeSpacing;
      const position =
        options.direction === "vertical"
          ? { x: indexOffset, y: rankOffset }
          : { x: rankOffset, y: indexOffset };
      positions.push({ nodeId, position });
    });
  }
  return positions;
}
