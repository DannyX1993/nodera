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

/** Placement options the host declares; there are no framework-invented defaults. */
export interface GraphLayoutOptions {
  readonly direction: GraphLayoutDirection;
  /** Distance between two neighbours of the same rank. */
  readonly nodeSpacing: number;
  /** Distance between two consecutive ranks. */
  readonly rankSpacing: number;
  readonly scope: GraphLayoutScope;
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
