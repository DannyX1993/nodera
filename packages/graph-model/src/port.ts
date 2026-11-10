/**
 * Port model: declarative port declarations used by definitions, and port
 * instances carried by node instances.
 *
 * Ports must admit different semantics and data contracts: nothing assumes a
 * node has inputs and outputs of the same shape, or any at all.
 */

/** Direction a port faces. */
export type PortDirection = "input" | "output" | "bidirectional";

/**
 * Side of a node a port is drawn on.
 *
 * A pure presentation vocabulary: `PortDirection` says what the port is for,
 * this says where it sits. They are independent on purpose — an input may face
 * the top of the node in a vertical graph and the left in a horizontal one —
 * so a renderer never has to infer one from the other.
 */
export type PortPlacement = "left" | "right" | "top" | "bottom";

/** How many connections a port accepts. */
export type PortMultiplicity = "single" | "multiple";

/**
 * Visual hints for a port. Pure presentation metadata: the domain never
 * interprets it and renderers may ignore it.
 */
export interface PortVisual {
  /** Renderer or display hint understood by the presentation layer. */
  readonly renderer?: string;
  /**
   * Side of the node the port is drawn on. `undefined` leaves the side to the
   * presentation layer, which derives it from the port direction and the
   * layout axis.
   */
  readonly placement?: PortPlacement;
  /** Additional presentation metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Declarative description of a port, used by node and edge definitions.
 * All fields are serializable data; connection conditions are declared by
 * stable identifiers, never by embedded functions.
 */
export interface PortDeclaration {
  /** Stable port identifier within the declaring definition. */
  readonly id: string;
  /** Human-readable port name. */
  readonly name?: string;
  /** Direction the port faces. */
  readonly direction: PortDirection;
  /**
   * Semantic data type this port exchanges, e.g. `string`. `undefined` means
   * the port is polymorphic: any data type may be negotiated by rules.
   */
  readonly dataType?: string;
  /** How many connections the port accepts. Default: `single`. */
  readonly multiplicity?: PortMultiplicity;
  /** Minimum number of connections the port requires. Default: 0. */
  readonly minConnections?: number;
  /** Maximum number of connections; `null` means unbounded. Default: 1 for `single`, `null` for `multiple`. */
  readonly maxConnections?: number | null;
  /** Node definition ids this port may connect to, when restricted. */
  readonly allowedNodeDefinitionIds?: readonly string[];
  /** Data types this port accepts, when narrower than its own. */
  readonly allowedDataTypes?: readonly string[];
  /** Identifier of a custom connection condition resolved by validators. */
  readonly customConditionId?: string;
  /** Visual representation hints. */
  readonly visual?: PortVisual;
  /** Additional declaration metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * A port instance of a concrete node in a graph. Instances reference the
 * declaring declaration id when known; they never embed the definition.
 */
export interface PortInstance {
  /** Stable port identifier, unique within its node. */
  readonly id: string;
  /** Direction the port faces on this instance. */
  readonly direction: PortDirection;
  /** Id of the {@link PortDeclaration} this instance was created from, when known. */
  readonly declarationId?: string;
}
