import type { NodeId } from "@nodera/contracts";
import type { PortInstance } from "./port.js";

/** Node position on a canvas. Presentation metadata a document may carry. */
export interface NodePosition {
  readonly x: number;
  readonly y: number;
}

/**
 * A node instance in a graph.
 *
 * An instance references its node definition by id (definitions are
 * independent of their instances) and carries only instance state: ports,
 * property values and optional presentation position.
 */
export class Node {
  private readonly ports: readonly PortInstance[];
  private readonly portIds = new Set<string>();
  private propertyValues: Record<string, unknown>;

  constructor(
    readonly id: NodeId,
    readonly definitionId: string,
    ports: readonly PortInstance[],
    properties: Readonly<Record<string, unknown>> = {},
    readonly position?: NodePosition,
    readonly metadata?: Readonly<Record<string, unknown>>,
  ) {
    for (const port of ports) {
      if (this.portIds.has(port.id)) {
        throw new RangeError(
          `Node "${id}" declares duplicate port id "${port.id}"`,
        );
      }
      this.portIds.add(port.id);
    }
    this.ports = [...ports];
    this.propertyValues = { ...properties };
  }

  /** Ports this instance exposes. */
  getPorts(): readonly PortInstance[] {
    return [...this.ports];
  }

  /** Checks whether this node exposes a port with the given id. */
  hasPort(portId: string): boolean {
    return this.portIds.has(portId);
  }

  /** Current property values, keyed by property identifier. */
  getProperties(): Readonly<Record<string, unknown>> {
    return this.propertyValues;
  }

  /** Sets one property value, replacing the whole record immutably. */
  setProperty(name: string, value: unknown): void {
    this.propertyValues = { ...this.propertyValues, [name]: value };
  }

  /** Removes one property value. Returns whether it existed. */
  removeProperty(name: string): boolean {
    if (!(name in this.propertyValues)) {
      return false;
    }
    const next = { ...this.propertyValues };
    delete next[name];
    this.propertyValues = next;
    return true;
  }
}
