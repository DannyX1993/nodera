/**
 * Graph-level metadata and settings.
 *
 * Metadata describes the graph; settings declare universal structural rules.
 * Neither mixes with editor state (selection, panels) or canvas state
 * (viewport), which belong to the application and presentation layers.
 */

/** Descriptive metadata of a graph. */
export interface GraphMetadata {
  readonly name?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  /** Any additional domain metadata the host application declares. */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** Whether the graph accepts an edge from a node back to itself. */
export type SelfLoopPolicy = "allow" | "forbid";
/** Whether the graph accepts several edges joining the same ordered endpoints. */
export type MultiEdgePolicy = "allow" | "forbid";
/** Whether the graph accepts directed cycles. */
export type CyclePolicy = "allow" | "forbid";

/**
 * Universal structural rules of a graph.
 *
 * The domain does not assume acyclicity, a single direction or executable
 * graphs: every restriction is an explicit, declared setting.
 */
export interface GraphSettings {
  readonly selfLoops: SelfLoopPolicy;
  readonly multiEdges: MultiEdgePolicy;
  readonly cycles: CyclePolicy;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  selfLoops: "allow",
  multiEdges: "allow",
  cycles: "allow",
};
