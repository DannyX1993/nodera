import type { NodePosition } from "@nodera/graph-model";
import type { PortDirection } from "@nodera/graph-model";

/**
 * Canonical format marker of the Generic Graph Document (GGD) contract.
 */
export const GGD_FORMAT = "ggd";

/**
 * Metadata describing the document; `id` identifies the graph the document
 * represents. Unknown vendor fields are preserved at runtime but not typed.
 */
export interface DocumentMetadata {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  /** Domain metadata carried separately so vendor fields never collide with it. */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** Stable reference to an extension (plugin) the document depends on. */
export interface DocumentExtensionReference {
  readonly id: string;
  readonly version: string;
}

/**
 * A port of a node instance. Instances reference the declaring declaration id
 * when known; they never embed the definition.
 */
export interface DocumentPortInstance {
  readonly id: string;
  readonly direction: PortDirection;
  readonly declarationId?: string;
}

/**
 * One end of a document edge: a specific port of a specific node.
 */
export interface DocumentEdgeEndpoint {
  readonly nodeId: string;
  readonly portId: string;
  readonly direction?: PortDirection;
}

/**
 * An edge instance in the document. The stored relation is semantic; how the
 * connection is drawn belongs to edge definitions, never to the document.
 */
export interface DocumentEdgeInstance {
  readonly id: string;
  /** Edge definition id, when the edge references a known definition. */
  readonly type?: string;
  readonly source: DocumentEdgeEndpoint;
  readonly target: DocumentEdgeEndpoint;
  readonly label?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * A node instance in the document. `type` is the referenced node definition
 * id and `version` pins which definition version the instance assumes.
 */
export interface DocumentNodeInstance {
  readonly id: string;
  readonly type: string;
  readonly version?: string;
  readonly position?: NodePosition;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly ports?: readonly DocumentPortInstance[];
}

/**
 * A node grouping. Groups have no domain model yet: documents preserve them
 * verbatim so nothing is lost on a round-trip.
 */
export type DocumentGroup = Readonly<Record<string, unknown>>;

/**
 * Universal structural rules of a graph, as declared in a portable document.
 */
export interface DocumentGraphSettings {
  readonly selfLoops: "allow" | "forbid";
  readonly multiEdges: "allow" | "forbid";
  readonly cycles: "allow" | "forbid";
}

/** The graph payload of a document. */
export interface DocumentGraphContainer {
  readonly nodes: readonly DocumentNodeInstance[];
  readonly edges?: readonly DocumentEdgeInstance[];
  readonly groups?: readonly DocumentGroup[];
  /** Structural settings of the graph, so round-trips preserve them. */
  readonly settings?: DocumentGraphSettings;
}

/**
 * The Generic Graph Document: a portable, versioned representation of a
 * graph. It contains only serializable data — never components, functions,
 * DOM references or framework internals — and preserves unknown fields so
 * consumers can round-trip documents losslessly.
 */
export interface GraphDocument {
  readonly format: typeof GGD_FORMAT;
  /** Version of the document format itself, not of any definition. */
  readonly version: string;
  readonly metadata: DocumentMetadata;
  readonly extensions: readonly DocumentExtensionReference[];
  readonly graph: DocumentGraphContainer;
}
