/** Kinds of integrity violations the graph model rejects. */
export type GraphErrorKind =
  | "duplicate-node-id"
  | "duplicate-edge-id"
  | "node-not-found"
  | "edge-not-found"
  | "self-loop-forbidden"
  | "multi-edge-forbidden"
  | "cycle-forbidden";

/** Structured, representation-independent graph integrity error. */
export interface GraphError {
  readonly kind: GraphErrorKind;
  /** Human-readable explanation. Not for programmatic decisions. */
  readonly message: string;
  /** Identifier of the element the error refers to, when applicable. */
  readonly elementId?: string;
}
