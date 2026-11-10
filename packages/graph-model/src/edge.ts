import type { EdgeId, NodeId } from "@nodera/contracts";
import type { NodePosition } from "./node.js";
import type { PortDirection } from "./port.js";

/** One end of a connection: a specific port of a specific node. */
export interface ConnectionEndpoint {
  readonly nodeId: NodeId;
  readonly portId: string;
  /** Direction the port was declared with, when known to the creator. */
  readonly direction?: PortDirection;
}

/**
 * Connection value object: the immutable pair of endpoints a directed
 * relation goes from and to. Equality is by value.
 */
export class Connection {
  constructor(
    readonly source: ConnectionEndpoint,
    readonly target: ConnectionEndpoint,
  ) {
    if (
      source.nodeId === target.nodeId &&
      source.portId === target.portId
    ) {
      throw new RangeError(
        `A connection cannot join port "${source.portId}" of node "${source.nodeId}" to itself`,
      );
    }
  }

  /** Connections are equal when both endpoints are equal by value. */
  equals(other: Connection): boolean {
    return (
      this.source.nodeId === other.source.nodeId &&
      this.source.portId === other.source.portId &&
      this.target.nodeId === other.target.nodeId &&
      this.target.portId === other.target.portId
    );
  }
}

/**
 * An edge instance in a graph.
 *
 * The stored relation is semantic: endpoints plus an optional edge definition
 * id, label and metadata. How the connection is *styled* (line style, colors,
 * animations) belongs to edge definitions and renderers, never here.
 *
 * Waypoints are the exception that is per-instance: the intermediate points a
 * person dragged the edge through, in the same absolute flow coordinates as
 * node positions (presentation metadata a document may carry, like a node's
 * own position). Renderers route through them; styling still lives on the
 * definition.
 */
export class Edge {
  private currentLabel: string | undefined;
  private currentMetadata: Readonly<Record<string, unknown>> | undefined;
  private currentWaypoints: readonly NodePosition[] | undefined;

  constructor(
    readonly id: EdgeId,
    readonly connection: Connection,
    readonly definitionId?: string,
    label?: string,
    metadata?: Readonly<Record<string, unknown>>,
  ) {
    this.currentLabel = label;
    this.currentMetadata = metadata;
  }

  /** Current edge label, when any. */
  get label(): string | undefined {
    return this.currentLabel;
  }

  /** Current edge metadata record, when any. */
  get metadata(): Readonly<Record<string, unknown>> | undefined {
    return this.currentMetadata;
  }

  /** Replaces the edge label (undefined clears it). */
  setLabel(label?: string): void {
    this.currentLabel = label;
  }

  /** Replaces the edge metadata record (undefined clears it). */
  setMetadata(metadata?: Readonly<Record<string, unknown>>): void {
    this.currentMetadata = metadata;
  }

  /** Waypoints the edge is routed through, when any. */
  get waypoints(): readonly NodePosition[] | undefined {
    return this.currentWaypoints;
  }

  /**
   * Replaces the waypoints the edge is routed through (undefined clears them).
   *
   * Every point must be a finite-number pair; the array is copied, so later
   * mutations of the caller's array never reach the stored state. A refused
   * call leaves the previous waypoints in place.
   */
  setWaypoints(waypoints?: readonly NodePosition[]): void {
    if (waypoints === undefined) {
      this.currentWaypoints = undefined;
      return;
    }
    for (const point of waypoints) {
      if (
        point === null ||
        typeof point !== "object" ||
        typeof (point as NodePosition).x !== "number" ||
        typeof (point as NodePosition).y !== "number" ||
        !Number.isFinite((point as NodePosition).x) ||
        !Number.isFinite((point as NodePosition).y)
      ) {
        throw new RangeError(
          `Edge "${this.id}" waypoints must be finite { x, y } positions`,
        );
      }
    }
    this.currentWaypoints = waypoints.map((point) => ({ x: point.x, y: point.y }));
  }
}
