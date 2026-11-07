import type { EdgeId, NodeId } from "@nodera/contracts";
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
 * id, label and metadata. How the connection is drawn (line style, geometry,
 * animations) belongs to edge definitions and renderers, never here.
 */
export class Edge {
  private currentLabel: string | undefined;
  private currentMetadata: Readonly<Record<string, unknown>> | undefined;

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
}
