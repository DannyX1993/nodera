/**
 * The graph placement port.
 *
 * A strategy answers one question — where do these graph nodes go? — over plain
 * data: node ids, the positions the document already carries, the edges that
 * connect them and the options the host chose. It never sees a graph instance,
 * a canvas, a framework component or a presentation object, so the geometry can
 * be computed anywhere (AGENTS.md §4.2, §7; odd task T2).
 *
 * A strategy either returns one position per selected node or a structured
 * diagnostic. Invalid host configuration never silently produces geometry
 * (AGENTS.md §13): the caller decides what "fails closed" means for the request
 * it is serving.
 */

import type { NodeId } from "@nodera/contracts";
import type { Result } from "@nodera/contracts";
import type { NodePosition } from "@nodera/graph-model";

/** One node the strategy may place, with the position the document already carries. */
export interface GraphLayoutNodeInput {
  readonly id: NodeId;
  /** Current position, when the document already has one. */
  readonly position?: NodePosition | undefined;
  /**
   * Width of the node's box, in flow units, when the host knows it.
   *
   * A **layout hint**, never document data: the document carries a position and
   * nothing else about the box, so a strategy that measures its nodes (a canvas
   * adapter, a host renderer) may pass what it measured. A strategy that uses
   * boxes falls back to `GraphLayoutOptions.nodeSize` for a node without one, so
   * omitting both is always valid input.
   */
  readonly width?: number | undefined;
  /** Height of the node's box, in flow units. See {@link GraphLayoutNodeInput.width}. */
  readonly height?: number | undefined;
}

/** A box in flow units: what a strategy may assume about a node nobody measured. */
export interface GraphLayoutNodeSize {
  readonly width: number;
  readonly height: number;
}

/** One connection between two nodes, by stable node id. */
export interface GraphLayoutEdgeInput {
  readonly source: NodeId;
  readonly target: NodeId;
}

/**
 * Axis the ranks advance along. `horizontal` puts the rank on `x` and the
 * in-rank order on `y`; `vertical` swaps them.
 */
export type GraphLayoutDirection = "horizontal" | "vertical";

/**
 * Which nodes the strategy answers for. `all` lays out the whole graph;
 * `unpositioned` answers only for the nodes the document does not position yet,
 * so a host can never move a node the user already placed.
 */
export type GraphLayoutScope = "all" | "unpositioned";

/**
 * Placement options the host declares: the geometry is never invented here.
 *
 * `direction`, `nodeSpacing`, `rankSpacing` and `scope` are required, so the host
 * — or the SDK's documented resolution of its configuration — always says what
 * the grid measures. `nodeSize` is the one optional member, and only because its
 * absence has a single documented meaning: the strategy's own fallback box.
 */
export interface GraphLayoutOptions {
  readonly direction: GraphLayoutDirection;
  /**
   * Gap between two **neighbouring boxes** of the same rank, in flow units.
   *
   * It is a gap, not the distance between two positions: a rank steps by the
   * widest box it holds plus this value, which is what keeps two boxes apart
   * however wide their renderer paints them.
   */
  readonly nodeSpacing: number;
  /** Distance between two consecutive ranks. */
  readonly rankSpacing: number;
  readonly scope: GraphLayoutScope;
  /**
   * The fallback box of a node that carries no `width`/`height` of its own.
   *
   * Only a fallback: a node's own size always wins. The layered strategy defaults
   * it to `{ width: 140, height: 40 }`, the `--ndr-node-min-width` /
   * `--ndr-node-min-height` token defaults of the default node renderer.
   */
  readonly nodeSize?: GraphLayoutNodeSize | undefined;
}

/** Everything a strategy needs: plain data, no graph instance. */
export interface GraphLayoutInput {
  readonly nodes: readonly GraphLayoutNodeInput[];
  readonly edges: readonly GraphLayoutEdgeInput[];
  readonly options: GraphLayoutOptions;
}

/** A node the strategy placed. */
export interface GraphLayoutPlacedNode {
  readonly nodeId: NodeId;
  readonly position: NodePosition;
}

/** The placement answer of a strategy. */
export interface GraphLayoutResult {
  readonly positions: readonly GraphLayoutPlacedNode[];
}

/** Stable machine-readable codes of the placement diagnostics. */
export type GraphLayoutDiagnosticCode =
  | "graph-layout.invalid-options"
  | "graph-layout.duplicate-node"
  | "graph-layout.unknown-edge-node";

/** Structured, representation-independent placement failure. */
export interface GraphLayoutDiagnostic {
  readonly code: GraphLayoutDiagnosticCode;
  /** Human-readable explanation. Not for programmatic decisions. */
  readonly message: string;
  /** Node the diagnostic refers to, when applicable. */
  readonly nodeId?: NodeId | undefined;
}

/**
 * A placement strategy. The host picks it in configuration and the application
 * layer decides when to apply the answer.
 */
export interface GraphLayoutStrategy {
  /** Stable, qualified identifier of the strategy. */
  readonly id: string;
  /** Computes the positions, or explains why it cannot. */
  place(input: GraphLayoutInput): Result<GraphLayoutResult, GraphLayoutDiagnostic>;
}
