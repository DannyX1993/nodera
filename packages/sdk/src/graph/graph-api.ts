/**
 * The SDK Graph API: the supported surface for editing and reading the
 * builder's graph.
 *
 * Every mutation delegates to the application use case of the same name, so the
 * SDK never reimplements validation, history or events: it only translates the
 * public request vocabulary into use case input and the structured
 * `UseCaseError` back into one SDK diagnostic. Identifiers are shape-checked
 * before they reach a use case, because a branded identifier constructor throws
 * and the SDK never throws for data.
 *
 * Every value this API hands back is a §9 instance view (`NodeInstanceView`,
 * `EdgeInstanceView`), never the domain `Node`/`Edge`. `builder.editor` is the
 * documented escape hatch for the core shapes.
 *
 * `undo`/`redo`/`canUndo`/`canRedo` return the history engine's booleans
 * unwrapped: there is no data problem to report, only a cursor position.
 */

import { err, isValidIdShape, ok, type Result } from "@nodera/contracts";
import type { NodePosition, PortDirection } from "@nodera/graph-model";
import {
  addNode,
  arrangeGraph,
  clearSelection,
  createEdge,
  insertNodeOnEdge,
  moveNode,
  redo,
  removeEdge,
  removeNode,
  removeNodeSplicing,
  selectMultiple,
  undo,
  updateNodeProperties,
  validateGraph,
  type EditorEngine,
  type UseCaseError,
} from "@nodera/application";
import type {
  GraphLayoutDiagnostic,
  GraphLayoutPlacedNode,
  LayoutStrategyRegistry,
} from "@nodera/graph-layout";
import type { ValidationLevel, ValidationReport } from "@nodera/validation";
import type { ArrangeOnChange, RemovalPolicy } from "../builder/configuration.js";
import {
  disposedIssue,
  isPlainObject,
  sdkError,
  shapeIssue,
  type SdkIssue,
  type SdkIssues,
} from "../errors.js";
import { toEdgeInstanceView, toNodeInstanceView } from "../view/instances.js";
import type { EdgeInstanceView, NodeInstanceView } from "../view/instances.js";
import { occupiedPositions, placeUnpositionedNode, type ResolvedGraphLayout } from "./placement.js";

/** One node to add, in the public `type` vocabulary of the SDK. */
export interface AddNodeRequest {
  /** Globally qualified node definition type, e.g. `http.request`. */
  readonly type: string;
  /** Explicit instance id; generated from the definition when omitted. */
  readonly nodeId?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly position?: NodePosition;
  /**
   * Node instance the new node follows, when the host knows where it belongs.
   *
   * In `graph.layout.mode: "auto"` the new node takes the first free slot
   * **forward** of this node's position along the declared axis, stepping by the
   * configured `spacing`; an occupied slot is skipped forward, never backward.
   * An anchor that carries no position places the node after the graph's extent,
   * exactly like an absent anchor. An id the graph does not contain is refused
   * with `sdk.invalid-input` at path `after` and nothing is created. In
   * `"free"` mode the anchor places nothing, and an explicit `position` always
   * wins over it.
   *
   * The host decides the anchor — the palette passes the single selected node or
   * nothing, the edge "+" passes the edge source — so the SDK never reads the
   * UI selection itself, and the placement stays a function of the graph.
   */
  readonly after?: string;
}

/**
 * One node to insert on an existing edge, in the public `type` vocabulary.
 *
 * The edge is replaced by the node plus two edges: the original source → the new
 * node, and the new node → the original target, keeping the original source and
 * target ports on their own sides. `type` is the definition of the **inserted**
 * node; the two halves inherit the replaced edge's definition type.
 */
export interface InsertNodeRequest {
  /** Edge the node is inserted into; it is replaced by the two halves. */
  readonly edgeId: string;
  /** Globally qualified definition type of the inserted node, e.g. `http.retry`. */
  readonly type: string;
  /** Explicit instance id; generated from the definition when omitted. */
  readonly nodeId?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
}

/** What a successful insertion created, in the §9 instance vocabulary. */
export interface InsertNodeResult {
  readonly node: NodeInstanceView;
  /** The two edges replacing the original, in flow order: source → node, node → target. */
  readonly edges: readonly [EdgeInstanceView, EdgeInstanceView];
}

/** One edge to create between two node instances. */
export interface ConnectRequest {
  /** Source node instance id. */
  readonly source: string;
  /** Target node instance id. */
  readonly target: string;
  /** Source port id; defaults to the source node's first output port. */
  readonly sourcePort?: string;
  /** Target port id; defaults to the target node's first input port. */
  readonly targetPort?: string;
  /** Globally qualified edge definition type. */
  readonly type?: string;
  readonly label?: string;
}

/** The whole selection to apply, replacing the current one. */
export interface SelectRequest {
  readonly nodes?: readonly string[];
  readonly edges?: readonly string[];
}

/**
 * Per-call overrides of the placement `arrange` was configured with.
 *
 * A value supplied here wins over `graph.layout` for the one explicit action
 * that carries it and persists nothing: the next `arrange()` without a request
 * reads the builder configuration again. It is the host's own action, not an
 * editor toggle (S4, S16), and a value outside these rules is refused without
 * moving a single node.
 */
export interface ArrangeRequest {
  /** Axis the ranks advance along; defaults to `graph.layout.direction`. */
  readonly direction?: "horizontal" | "vertical";
  /** Distance between in-rank neighbours; defaults to `graph.layout.spacing`. */
  readonly spacing?: number;
  /** Distance between consecutive ranks; defaults to the configured rank spacing. */
  readonly rankSpacing?: number;
  /**
   * Node the arrangement starts from: only it and its descendants are written.
   *
   * The strategy still computes the whole answer — there is no incremental
   * ranker and none is needed — but the document (and the history) only receives
   * the positions of `from` and of the nodes reachable from it by following
   * edges **outward**, transitively, over the graph's edges. Every other node
   * keeps the position it had, untouched. Omitting `from` arranges the whole
   * graph, exactly as before.
   *
   * An id the graph does not contain is refused with `sdk.invalid-input` at path
   * `from`, and nothing moves. The written subset is still one history unit.
   */
  readonly from?: string;
}

/**
 * What the automatic downstream arrangement did after a structural change.
 *
 * `"skipped"` is the default, and the answer whenever the policy did not apply:
 * `graph.layout.arrangeOnChange` is `"never"`, the layout does not own the
 * positions (`mode: "free"`), or the mutation never attempted an arrangement
 * (`addNode` does not arrange). `"arranged"` carries the nodes whose position
 * was written; `"refused"` carries the strategy or use case diagnostics, and the
 * mutation that triggered it stands, because the arrangement is a second history
 * unit of its own.
 */
export type AutoArrangeOutcome =
  | { readonly outcome: "skipped" }
  | { readonly outcome: "arranged"; readonly nodes: readonly NodeInstanceView[] }
  | { readonly outcome: "refused"; readonly issues: SdkIssues };

/**
 * What an explicit `Arrange` — and the automatic policy — reads from the
 * composition: the registry the selected strategy is resolved from, the rank
 * distance the host declared and the policy in effect today.
 *
 * The registry is passed instead of a resolved strategy so a host that selects
 * another strategy after construction (`builder.graphLayout.setDefault`) changes
 * what the very next `arrange()` runs, with no re-composition. The policy is read
 * through a function for the same reason: `builder.graphLayout.setArrangeOnChange`
 * changes what the next structural change does.
 */
export interface ArrangeSettings {
  readonly strategies: LayoutStrategyRegistry;
  /** Distance between consecutive ranks; `graph.layout.rankSpacing ?? spacing`. */
  readonly rankSpacing: number;
  /** Policy `graph.layout.arrangeOnChange` in effect today. */
  readonly arrangeOnChange: () => ArrangeOnChange;
}

/**
 * What removing a node reads from the composition: the policy
 * `graph.layout.onRemove` in effect today.
 *
 * Read through a function for the same reason {@link ArrangeSettings} is:
 * `builder.graphLayout.setRemovalPolicy` changes what the very next removal
 * does, with no re-composition.
 */
export interface RemovalSettings {
  /** Policy `graph.layout.onRemove` in effect today. */
  readonly onRemove: () => RemovalPolicy;
}

/**
 * The graph surface of the builder.
 *
 * Mutation is reported as `Result` so the host branches once per call; the
 * reads (`nodes`, `edges`, `nodeCount`, `selectedNodes`, history flags) mirror
 * the editor state, answer in the §9 vocabulary and never allocate diagnostics.
 */
export interface BuilderGraphApi {
  addNode(request: AddNodeRequest): Result<NodeInstanceView, SdkIssues>;
  /**
   * Removes a node, following the removal policy the host configured.
   *
   * With `graph.layout.onRemove: "detach"` — the default — the node and every
   * edge it carried leave the graph together, in one history unit: one `undo()`
   * restores the node and its edges. With `"splice"` the removals happen exactly
   * the same way **and** each predecessor is joined to each successor inside the
   * same unit, so the hierarchy above and below stays connected through one hop
   * and one `undo()` still restores the node with its original edges, ids
   * included. The spliced edges keep the ports of the edges that went away and
   * take the removed node's incoming edge definition type; a pair that would
   * duplicate an existing edge is skipped.
   *
   * The removal answers the removed node in the §9 instance vocabulary, whatever
   * the policy is. Splice or not, a node with no predecessor or no successor
   * simply loses its edges.
   *
   * With `graph.layout.arrangeOnChange: "downstream"` and `mode: "auto"` a
   * splice is followed by a **second** history unit that arranges the spliced
   * predecessors and their descendants (see {@link BuilderGraphApi.arrange});
   * one `undo()` steps that arrangement back and a second one restores the
   * removal. The removal never fails because of it — a refused arrangement is
   * reported by {@link BuilderGraphApi.lastAutoArrangement}. `"detach"`
   * arranges nothing, exactly as before.
   *
   * An unknown node is `sdk.invalid-input` carrying the use case's own
   * `node-not-found` code, and nothing is written, pushed or emitted.
   */
  removeNode(nodeId: string): Result<NodeInstanceView, SdkIssues>;
  moveNode(nodeId: string, position: NodePosition): Result<NodeInstanceView, SdkIssues>;
  /** Writes each property value through the update use case, one history unit each. */
  updateProperties(
    nodeId: string,
    properties: Readonly<Record<string, unknown>>,
  ): Result<NodeInstanceView, SdkIssues>;
  /**
   * Inserts a node **on** an existing edge, replacing it with two edges.
   *
   * One history unit, all-or-nothing: `source --e--> target` becomes
   * `source --> node --> target`, the original edge is removed and one `undo()`
   * restores it with the same id and ports. The original source and target ports
   * stay on their own endpoints; the new node contributes its own first input and
   * first output port.
   *
   * The position follows the add rule: in `mode: "auto"` the node lands one step
   * past the edge's **source** along the declared axis — the host's own anchor
   * rule, with the edge source as the anchor — while `mode: "free"` invents no
   * position and the node stays unpositioned. It is decided before the use case
   * runs, so it belongs to the same history unit as the insertion.
   *
   * An unknown edge is `sdk.invalid-input` at path `edgeId`; an unknown
   * definition, a taken instance id or a definition without a usable input /
   * output port come back as the use case's own structured diagnostic. Nothing is
   * written, pushed or emitted when any of them refuses.
   *
   * With `graph.layout.arrangeOnChange: "downstream"` and `mode: "auto"` the
   * insertion is followed by a **second** history unit: the inserted node and its
   * descendants are arranged (see {@link BuilderGraphApi.arrange}). One `undo()`
   * steps the arrangement back and a second one removes the insertion, because
   * folding the geometry into the mutation would hide a write behind an operation
   * that did not ask for it. The mutation never fails because of it; a refused
   * arrangement is reported by {@link BuilderGraphApi.lastAutoArrangement}.
   */
  insertNode(request: InsertNodeRequest): Result<InsertNodeResult, SdkIssues>;
  /**
   * Creates one edge between two node instances.
   *
   * With `graph.layout.arrangeOnChange: "downstream"` and `mode: "auto"` a
   * successful connection is followed by a second history unit that arranges the
   * new edge's **target** and its descendants: the node whose position the new
   * relation changes. The edge is returned whatever happened to the arrangement;
   * read {@link BuilderGraphApi.lastAutoArrangement} for that second unit. With
   * `"never"` — the default — nothing but the edge is written.
   */
  connect(request: ConnectRequest): Result<EdgeInstanceView, SdkIssues>;
  disconnect(edgeId: string): Result<EdgeInstanceView, SdkIssues>;
  /**
   * Lays the whole graph out with the strategy the host selected.
   *
   * Explicit only: no add, edge change or read ever calls it. One history unit
   * (`arrange-graph`), all-or-nothing: a strategy diagnostic or a rejected
   * position moves nothing. An answer with no position at all — the `free`
   * strategy, an empty graph — is an honest no-op that pushes no history entry.
   * Returns the moved nodes in the §9 instance vocabulary.
   *
   * A `request` overrides the configured direction and spacings for this one
   * call. The rules are the configuration's own: an unknown direction or a
   * spacing that is not a positive finite number is `sdk.invalid-input` at its
   * field path, nothing is applied, and the next call without a request uses
   * the configured values again (S16).
   *
   * `request.from` scopes the **writes**, never the computation (S18). The
   * strategy is still asked about the whole graph, because a rank is a property
   * of the whole graph that an incremental ranker would have to reinvent; what
   * changes is that only `from` and its descendants — reachable over the graph's
   * edges outward, transitively — receive their computed position. Every other
   * node keeps the position the document holds, and the written subset is still
   * one history unit. Without `from` the answer is exactly what it was before.
   */
  arrange(request?: ArrangeRequest): Result<readonly NodeInstanceView[], SdkIssues>;
  /**
   * What the automatic downstream arrangement did after the last structural
   * change, i.e. the second unit of `insertNode`, `connect` and a spliced
   * `removeNode`.
   *
   * It answers `"skipped"` when the policy did not apply (`"never"`,
   * `mode: "free"`, `"detach"`, a removal with no predecessor, or no such
   * mutation happened yet), `"arranged"` with the nodes it placed, and `"refused"`
   * with the structured diagnostics when the strategy or a position was rejected —
   * in which case the mutation that triggered it stands, because the two are
   * separate history units. `connect` returns its edge, `insertNode` its node and
   * edges and `removeNode` the removed node, so this read is how the framework
   * reports the second unit without changing those results.
   */
  lastAutoArrangement(): AutoArrangeOutcome;
  /** Every node of the graph, in the §9 instance vocabulary. */
  nodes(): readonly NodeInstanceView[];
  /** Every edge of the graph, flat, in the §9 instance vocabulary. */
  edges(): readonly EdgeInstanceView[];
  select(request: SelectRequest): Result<void, SdkIssues>;
  clearSelection(): Result<void, SdkIssues>;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  validate(options?: { readonly levels?: readonly ValidationLevel[] }): ValidationReport;
  nodeCount(): number;
  edgeCount(): number;
  selectedNodes(): readonly string[];
  selectedEdges(): readonly string[];
}

/** Port directions accepted as one endpoint of a connection. */
const SOURCE_DIRECTIONS: readonly PortDirection[] = ["output", "bidirectional"];
const TARGET_DIRECTIONS: readonly PortDirection[] = ["input", "bidirectional"];

/** One SDK diagnostic for a use case error, keeping its identifying fields. */
function useCaseIssue(error: UseCaseError): SdkIssue {
  const metadata: Record<string, unknown> = { useCaseCode: error.kind };
  if (error.elementId !== undefined) {
    metadata["elementId"] = error.elementId;
  }
  return {
    code: "sdk.invalid-input",
    severity: "error",
    message: error.message,
    metadata,
  };
}

/**
 * Rejects a malformed identifier before a use case turns it into a branded id.
 *
 * Branded id constructors throw `RangeError`; the SDK reports every data
 * problem as a `Result`, so the shape is checked here instead.
 */
function identifierIssues(
  kind: string,
  value: unknown,
  path: readonly string[],
): SdkIssues | undefined {
  if (isValidIdShape(value)) {
    return undefined;
  }
  return [
    {
      ...sdkError(
        "sdk.invalid-input",
        `${kind} id must be a non-empty string without whitespace`,
        { path, metadata: { value } },
      ),
      severity: "error",
    },
  ];
}

/** Rejects a required text field that is missing or is not a string. */
function textIssues(
  owner: string,
  field: string,
  value: unknown,
  path: readonly string[],
): SdkIssues | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return undefined;
  }
  return [
    {
      ...sdkError(
        "sdk.invalid-input",
        typeof value === "string"
          ? `${owner} must declare a non-empty ${field}`
          : `${owner} must declare ${field} as a string`,
        { path, metadata: { value } },
      ),
      severity: "error",
    },
  ];
}

/** Rejects a request object that is not an object at all. */
function requestIssues(request: unknown, expected: string): SdkIssues | undefined {
  return isPlainObject(request) ? undefined : [shapeIssue(expected, request, ["request"])];
}

/** Rejects a property map that is not an object. */
function propertyMapIssues(properties: unknown): SdkIssues | undefined {
  return isPlainObject(properties)
    ? undefined
    : [shapeIssue("Properties must be an object of property values", properties, ["properties"])];
}

/** Rejects a node position that is not an `{ x, y }` pair of numbers. */
function positionIssues(position: NodePosition): SdkIssues | undefined {
  if (!isPlainObject(position)) {
    return [
      shapeIssue("Node position must be an object with numeric x and y", position, [
        "position",
      ]),
    ];
  }
  const issues: SdkIssue[] = [];
  for (const axis of ["x", "y"] as const) {
    const value = position[axis];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push(
        shapeIssue(`Node position ${axis} must be a finite number`, value, [
          "position",
          axis,
        ]),
      );
    }
  }
  return issues.length > 0 ? issues : undefined;
}

/** Rejects a selection list that is not an array of identifiers. */
function selectionIssues(
  kind: string,
  values: readonly unknown[],
): SdkIssues | undefined {
  for (const [index, value] of values.entries()) {
    const issues = identifierIssues(kind, value, [
      kind === "Node" ? "nodes" : "edges",
      String(index),
    ]);
    if (issues !== undefined) {
      return issues;
    }
  }
  return undefined;
}

/**
 * Issues of a per-call `arrange` override.
 *
 * The rules are the configuration's own — the direction is one of two values and
 * both spacings are positive finite numbers — so a host cannot switch the
 * geometry into a shape `graph.layout` would have refused. The path names the
 * field of the request, which is the input the caller actually wrote; a request
 * that is not an object at all is reported at `request`.
 */
function arrangeRequestIssues(request: unknown): SdkIssues | undefined {
  if (!isPlainObject(request)) {
    return [
      shapeIssue(
        "An arrange request must be an object overriding the direction and the spacings",
        request,
        ["request"],
      ),
    ];
  }
  const issues: SdkIssue[] = [];
  const direction: unknown = Reflect.get(request, "direction");
  if (direction !== undefined && direction !== "horizontal" && direction !== "vertical") {
    issues.push(
      shapeIssue('Arrange direction must be "horizontal" or "vertical"', direction, [
        "direction",
      ]),
    );
  }
  for (const field of ["spacing", "rankSpacing"] as const) {
    const value: unknown = Reflect.get(request, field);
    if (
      value !== undefined &&
      !(typeof value === "number" && Number.isFinite(value) && value > 0)
    ) {
      issues.push(
        shapeIssue(`Arrange ${field} must be a positive finite number`, value, [field]),
      );
    }
  }
  return issues.length > 0 ? issues : undefined;
}

/** The diagnostic a disposed builder refuses a mutation with, if it is disposed. */
function closedIssues(
  isDisposed: () => boolean,
  operation: string,
): SdkIssues | undefined {
  return isDisposed() ? [disposedIssue(operation)] : undefined;
}

/** First port of a node usable by the given endpoint role. */
function defaultPort(
  editor: EditorEngine,
  nodeId: string,
  directions: readonly PortDirection[],
): string | undefined {
  const node = editor.getNode(nodeId);
  return node?.getPorts().find((port) => directions.includes(port.direction))?.id;
}

/** Issue for a connection whose endpoint port cannot be defaulted. */
function missingPortIssue(role: string, nodeId: string, direction: string): SdkIssue {
  return {
    ...sdkError(
      "sdk.invalid-input",
      `Node "${nodeId}" has no ${direction} port to use as ${role}; ` +
        `declare one or pass it explicitly`,
      { metadata: { nodeId, direction } },
    ),
    severity: "error",
  };
}

/** Issue for a node id the graph does not contain, shaped like the use case. */
function missingNodeIssue(nodeId: string): SdkIssue {
  return {
    ...sdkError("sdk.invalid-input", `Graph has no node with id "${nodeId}"`, {
      metadata: { useCaseCode: "node-not-found", elementId: nodeId },
    }),
    severity: "error",
  };
}

/**
 * Issue for an edge id the graph does not contain, shaped like the use case.
 *
 * `insertNode` resolves the edge itself because its placement anchors on the
 * edge source, so a missing edge is refused at the field the caller wrote
 * instead of reaching the use case as a bare failure.
 */
function missingEdgeIssue(edgeId: string): SdkIssue {
  return {
    ...sdkError(
      "sdk.invalid-input",
      `Graph has no edge with id "${edgeId}" to insert a node on`,
      { path: ["edgeId"], metadata: { useCaseCode: "edge-not-found", elementId: edgeId } },
    ),
    severity: "error",
  };
}

/**
 * Issue for a layout strategy id no registry entry matches.
 *
 * The composition root reports an unregistered `graph.layout.strategy` with it
 * and so does `arrange`, which is why the message and the code live in one
 * place: a host reads the same diagnosis whichever boundary found the id.
 */
export function unknownLayoutStrategyIssue(
  strategyId: string,
  known: readonly string[],
  path: readonly string[],
): SdkIssue {
  return {
    ...sdkError(
      "sdk.invalid-input",
      `No graph layout strategy registered with id "${strategyId}"`,
      { path, metadata: { value: strategyId, known } },
    ),
    severity: "error",
  };
}

/**
 * Issue for a strategy that answered a structured diagnostic.
 *
 * The strategy code is kept in `metadata.strategyCode` so a host can branch on
 * the geometry's own diagnosis while handling one SDK error shape.
 */
function strategyDiagnosticIssue(
  diagnostic: GraphLayoutDiagnostic,
  strategyId: string,
): SdkIssue {
  return {
    ...sdkError("sdk.invalid-input", diagnostic.message, {
      metadata: {
        strategyId,
        strategyCode: diagnostic.code,
        ...(diagnostic.nodeId === undefined ? {} : { elementId: diagnostic.nodeId }),
      },
    }),
    severity: "error",
  };
}

/**
 * Issue for an anchor (`AddNodeRequest.after`) that is not in the graph.
 *
 * Placement never guesses where a node it cannot find sits: the add is refused
 * at the field the caller wrote and nothing is created.
 */
function unknownAnchorIssue(anchorId: string): SdkIssue {
  return {
    ...sdkError(
      "sdk.invalid-input",
      `Graph has no node with id "${anchorId}" to place the new node after`,
      {
        path: ["after"],
        metadata: {
          value: anchorId,
          useCaseCode: "node-not-found",
          elementId: anchorId,
        },
      },
    ),
    severity: "error",
  };
}

/**
 * Issue for an `arrange` origin (`ArrangeRequest.from`) that is not in the graph.
 *
 * A scoped arrangement never guesses a subset it cannot resolve: the call is
 * refused at the field the caller wrote and no position is applied.
 */
function unknownArrangeOriginIssue(fromId: string): SdkIssue {
  return {
    ...sdkError(
      "sdk.invalid-input",
      `Graph has no node with id "${fromId}" to arrange from`,
      {
        path: ["from"],
        metadata: {
          value: fromId,
          useCaseCode: "node-not-found",
          elementId: fromId,
        },
      },
    ),
    severity: "error",
  };
}

/**
 * Ids of the origins and of everything reachable from them by following edges
 * outward.
 *
 * The reachability is transitive and direction-sensitive: an edge
 * `source --> target` puts `target` downstream of `source`, so an edge pointing
 * **into** an origin never pulls its source into the written subset. Several
 * origins — the predecessors of a removed node under `onRemove: "splice"` — are
 * walked as one set, so the subset is their union and still one history unit.
 * Cycles are harmless — the visited set is the loop guard — and every id is
 * visited once, so the walk is linear in the edges of the graph.
 */
function downstreamNodeIds(
  editor: EditorEngine,
  origins: readonly string[],
): ReadonlySet<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of editor.graph.getEdges()) {
    const source = edge.connection.source.nodeId;
    const targets = adjacency.get(source);
    if (targets === undefined) {
      adjacency.set(source, [edge.connection.target.nodeId]);
    } else {
      targets.push(edge.connection.target.nodeId);
    }
  }
  const reachable = new Set<string>(origins);
  const pending: string[] = [...origins];
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index];
    if (current === undefined) {
      continue;
    }
    for (const target of adjacency.get(current) ?? []) {
      if (reachable.has(target)) {
        continue;
      }
      reachable.add(target);
      pending.push(target);
    }
  }
  return reachable;
}

/** One strategy answer, and the id it came from so diagnostics can name it. */
interface PlacementAnswer {
  readonly strategyId: string;
  readonly positions: readonly GraphLayoutPlacedNode[];
}

/**
 * Asks the selected strategy where the nodes of the whole graph go.
 *
 * It is the one place that resolves the strategy, translates the graph into
 * plain data and reads the configured direction and spacings, so an explicit
 * `arrange` and the automatic policy always compute the same whole answer. The
 * per-call overrides win for this one call and are never written back (S16).
 */
function computePlacement(
  editor: EditorEngine,
  graphLayout: ResolvedGraphLayout,
  settings: ArrangeSettings,
  request?: ArrangeRequest | undefined,
): Result<PlacementAnswer, SdkIssues> {
  const strategyId = settings.strategies.defaultStrategyId;
  const strategy = settings.strategies.get(strategyId);
  if (strategy === undefined) {
    return err([
      unknownLayoutStrategyIssue(
        strategyId,
        settings.strategies.all().map((registered) => registered.id),
        ["graph", "layout", "strategy"],
      ),
    ]);
  }
  // The graph is read here, not passed in: the strategy never sees a graph
  // instance, a node class or a canvas, only plain data (S11).
  const placed = strategy.place({
    nodes: editor.graph.getNodes().map((node) => ({
      id: node.id,
      ...(node.position === undefined ? {} : { position: node.position }),
    })),
    edges: editor.graph.getEdges().map((edge) => ({
      source: edge.connection.source.nodeId,
      target: edge.connection.target.nodeId,
    })),
    options: {
      direction: request?.direction ?? graphLayout.direction,
      nodeSpacing: request?.spacing ?? graphLayout.spacing,
      rankSpacing: request?.rankSpacing ?? settings.rankSpacing,
      scope: "all",
    },
  });
  return placed.ok
    ? ok({ strategyId, positions: placed.value.positions })
    : err([strategyDiagnosticIssue(placed.error, strategyId)]);
}

/**
 * Applies the requested positions as one history unit through the use case.
 *
 * The subset arrives already decided: the use case validates what it is handed
 * and writes exactly that, so an empty list stays an honest no-op that pushes no
 * history entry.
 */
function applyPositions(
  editor: EditorEngine,
  positions: readonly GraphLayoutPlacedNode[],
): Result<readonly NodeInstanceView[], SdkIssues> {
  const applied = arrangeGraph(editor, {
    moves: positions.map((entry) => ({
      nodeId: entry.nodeId,
      position: entry.position,
    })),
  });
  return applied.ok
    ? ok(applied.value.map(toNodeInstanceView))
    : err([useCaseIssue(applied.error)]);
}

/**
 * The computed positions of the origins and their descendants, in strategy order.
 *
 * The reachability is computed once for the call, not per position: it is a walk
 * over the graph, while the answer is already in hand.
 */
function scopedTo(
  editor: EditorEngine,
  origins: readonly string[],
  positions: readonly GraphLayoutPlacedNode[],
): readonly GraphLayoutPlacedNode[] {
  const reachable = downstreamNodeIds(editor, origins);
  return positions.filter((entry) => reachable.has(entry.nodeId));
}

/**
 * Arranges the origins and their descendants, or reports why it could not.
 *
 * The whole answer is computed and the subset is what gets written, which is the
 * only scope that matters: every position written is document state and history
 * (L6). It is one use case call, so it is one history unit — the second one after
 * the mutation that triggered it, never folded into it.
 */
function arrangeDownstream(
  editor: EditorEngine,
  graphLayout: ResolvedGraphLayout,
  settings: ArrangeSettings,
  origins: readonly string[],
): AutoArrangeOutcome {
  const computed = computePlacement(editor, graphLayout, settings);
  if (!computed.ok) {
    return { outcome: "refused", issues: computed.error };
  }
  const written = applyPositions(
    editor,
    scopedTo(editor, origins, computed.value.positions),
  );
  return written.ok
    ? { outcome: "arranged", nodes: written.value }
    : { outcome: "refused", issues: written.error };
}

/**
 * The automatic policy in effect.
 *
 * It only applies when the layout owns the positions: in `"free"` mode the host
 * places every node, so arranging automatically would move a graph nobody asked
 * the builder to own.
 */
function autoArrangePolicy(
  graphLayout: ResolvedGraphLayout,
  settings: ArrangeSettings,
): ArrangeOnChange {
  return graphLayout.mode === "auto" ? settings.arrangeOnChange() : "never";
}

/**
 * Builds the graph facade of a builder over its editing session.
 *
 * The editor owns the graph, the history and the events; this API owns only
 * the translation between the public vocabulary and the use case contracts.
 * Placement is decided before the use case runs: the API assigns a position
 * only when the host configured `graph.layout.mode: "auto"` and the request
 * carries none, so the position lands inside the same history unit as the
 * creation and an undo removes it with the node. Which slot is decided from the
 * occupied positions, the settings and the position of the anchor the host named
 * in `after` — never from a selection or a canvas, which this boundary cannot
 * see. `arrange` is the explicit opposite of that: it asks the selected strategy
 * about the whole graph and applies the answer as one history unit, with the
 * direction and spacings the call overrides, if any. `arrange({ from })` narrows
 * what is **written** to the origin and its descendants while the answer stays
 * whole, and `graph.layout.arrangeOnChange: "downstream"` reuses that same scoped
 * write after an `insertNode` or a `connect`, as a history unit of its own.
 * `removalSettings` decides what `removeNode` does: `"detach"` delegates to the
 * plain removal use case, `"splice"` to the one that joins the removed node's
 * predecessors to its successors, and only the latter is followed by the
 * automatic arrangement, which starts from the spliced predecessors.
 * `isDisposed` is the builder's own lifecycle flag: a disposed builder refuses
 * every mutation with `sdk.disposed` and keeps every read working, because the
 * state the host already received must stay renderable.
 */
export function createGraphApi(
  editor: EditorEngine,
  isDisposed: () => boolean,
  graphLayout: ResolvedGraphLayout,
  arrangeSettings: ArrangeSettings,
  removalSettings: RemovalSettings,
): BuilderGraphApi {
  // What the automatic policy did after the latest structural change. It lives
  // here, next to the mutations that produce it, because `connect` answers its
  // edge and `insertNode` its node and edges: neither result can carry the second
  // unit without changing a published shape.
  let lastArrangement: AutoArrangeOutcome = { outcome: "skipped" };

  /** Arranges the given origins and their descendants when the policy asks for it. */
  const arrangeAfter = (origins: readonly string[]): AutoArrangeOutcome =>
    origins.length === 0 || autoArrangePolicy(graphLayout, arrangeSettings) === "never"
      ? { outcome: "skipped" }
      : arrangeDownstream(editor, graphLayout, arrangeSettings, origins);

  const api: BuilderGraphApi = {
    addNode(request: AddNodeRequest): Result<NodeInstanceView, SdkIssues> {
      const closed = closedIssues(isDisposed, "graph.addNode");
      if (closed !== undefined) {
        return err(closed);
      }
      const invalid =
        requestIssues(request, "Add-node request must be an object declaring a node type") ??
        textIssues("Add-node request", "type", request.type, ["type"]) ??
        (request.nodeId === undefined
          ? undefined
          : identifierIssues("Node", request.nodeId, ["nodeId"])) ??
        (request.properties === undefined
          ? undefined
          : propertyMapIssues(request.properties)) ??
        (request.position === undefined ? undefined : positionIssues(request.position)) ??
        (request.after === undefined
          ? undefined
          : identifierIssues("Anchor node", request.after, ["after"]));
      if (invalid !== undefined) {
        return err(invalid);
      }
      // The anchor is resolved once, before anything is created: an id the graph
      // does not hold is a refusal, not a placement guess, in every mode.
      const anchor =
        request.after === undefined ? undefined : editor.getNode(request.after);
      if (request.after !== undefined && anchor === undefined) {
        return err([unknownAnchorIssue(request.after)]);
      }
      const position =
        request.position ??
        placeUnpositionedNode(
          occupiedPositions(editor.graph.getNodes()),
          graphLayout,
          anchor?.position,
        );
      const added = addNode(editor, {
        definitionId: request.type,
        ...(request.nodeId === undefined ? {} : { nodeId: request.nodeId }),
        ...(request.properties === undefined ? {} : { properties: request.properties }),
        ...(position === undefined ? {} : { position }),
      });
      return added.ok ? ok(toNodeInstanceView(added.value)) : err([useCaseIssue(added.error)]);
    },

    removeNode(nodeId: string): Result<NodeInstanceView, SdkIssues> {
      const closed = closedIssues(isDisposed, "graph.removeNode");
      if (closed !== undefined) {
        return err(closed);
      }
      const issues = identifierIssues("Node", nodeId, ["nodeId"]);
      if (issues !== undefined) {
        return err(issues);
      }
      if (removalSettings.onRemove() !== "splice") {
        const removed = removeNode(editor, { nodeId });
        return removed.ok
          ? ok(toNodeInstanceView(removed.value.node))
          : err([useCaseIssue(removed.error)]);
      }
      // Splice: the node leaves and its predecessors are joined to its
      // successors inside that same unit. Only the automatic arrangement is a
      // second one, and it starts from the predecessors, because they are the
      // nodes whose position the new hop changes.
      const spliced = removeNodeSplicing(editor, { nodeId });
      if (!spliced.ok) {
        return err([useCaseIssue(spliced.error)]);
      }
      lastArrangement = arrangeAfter(spliced.value.predecessors);
      return ok(toNodeInstanceView(spliced.value.node));
    },

    moveNode(nodeId: string, position: NodePosition): Result<NodeInstanceView, SdkIssues> {
      const closed = closedIssues(isDisposed, "graph.moveNode");
      if (closed !== undefined) {
        return err(closed);
      }
      const issues =
        identifierIssues("Node", nodeId, ["nodeId"]) ?? positionIssues(position);
      if (issues !== undefined) {
        return err(issues);
      }
      const moved = moveNode(editor, { nodeId, position });
      return moved.ok ? ok(toNodeInstanceView(moved.value)) : err([useCaseIssue(moved.error)]);
    },

    updateProperties(
      nodeId: string,
      properties: Readonly<Record<string, unknown>>,
    ): Result<NodeInstanceView, SdkIssues> {
      const closed = closedIssues(isDisposed, "graph.updateProperties");
      if (closed !== undefined) {
        return err(closed);
      }
      const issues =
        identifierIssues("Node", nodeId, ["nodeId"]) ?? propertyMapIssues(properties);
      if (issues !== undefined) {
        return err(issues);
      }
      let updated: NodeInstanceView | undefined;
      for (const [name, value] of Object.entries(properties)) {
        const result = updateNodeProperties(editor, { nodeId, name, value });
        if (!result.ok) {
          return err([useCaseIssue(result.error)]);
        }
        updated = toNodeInstanceView(result.value);
      }
      if (updated !== undefined) {
        return ok(updated);
      }
      const existing = editor.getNode(nodeId);
      return existing === undefined
        ? err([missingNodeIssue(nodeId)])
        : ok(toNodeInstanceView(existing));
    },

    insertNode(request: InsertNodeRequest): Result<InsertNodeResult, SdkIssues> {
      const closed = closedIssues(isDisposed, "graph.insertNode");
      if (closed !== undefined) {
        return err(closed);
      }
      const invalid =
        requestIssues(
          request,
          "Insert-node request must be an object declaring the edge and a node type",
        ) ??
        identifierIssues("Edge", request.edgeId, ["edgeId"]) ??
        textIssues("Insert-node request", "type", request.type, ["type"]) ??
        (request.nodeId === undefined
          ? undefined
          : identifierIssues("Node", request.nodeId, ["nodeId"])) ??
        (request.properties === undefined
          ? undefined
          : propertyMapIssues(request.properties));
      if (invalid !== undefined) {
        return err(invalid);
      }
      // The edge is resolved before anything is created because placement anchors
      // on its source: an id the graph does not hold is a refusal, never a guess.
      const edge = editor.getEdge(request.edgeId);
      if (edge === undefined) {
        return err([missingEdgeIssue(request.edgeId)]);
      }
      const source = editor.getNode(edge.connection.source.nodeId);
      const position = placeUnpositionedNode(
        occupiedPositions(editor.graph.getNodes()),
        graphLayout,
        source?.position,
      );
      const inserted = insertNodeOnEdge(editor, {
        edgeId: request.edgeId,
        definitionId: request.type,
        ...(request.nodeId === undefined ? {} : { nodeId: request.nodeId }),
        ...(request.properties === undefined ? {} : { properties: request.properties }),
        ...(position === undefined ? {} : { position }),
      });
      if (!inserted.ok) {
        return err([useCaseIssue(inserted.error)]);
      }
      // The insertion already succeeded, so the automatic arrangement is a
      // second history unit and can never fail this call.
      lastArrangement = arrangeAfter([inserted.value.node.id]);
      const edges: readonly [EdgeInstanceView, EdgeInstanceView] = [
        toEdgeInstanceView(inserted.value.edges[0]),
        toEdgeInstanceView(inserted.value.edges[1]),
      ];
      return ok({ node: toNodeInstanceView(inserted.value.node), edges });
    },

    connect(request: ConnectRequest): Result<EdgeInstanceView, SdkIssues> {
      const closed = closedIssues(isDisposed, "graph.connect");
      if (closed !== undefined) {
        return err(closed);
      }
      const invalid =
        requestIssues(
          request,
          "Connection request must be an object declaring a source and a target",
        ) ??
        identifierIssues("Source node", request.source, ["source"]) ??
        identifierIssues("Target node", request.target, ["target"]) ??
        (request.sourcePort === undefined
          ? undefined
          : identifierIssues("Source port", request.sourcePort, ["sourcePort"])) ??
        (request.targetPort === undefined
          ? undefined
          : identifierIssues("Target port", request.targetPort, ["targetPort"])) ??
        (request.type === undefined
          ? undefined
          : textIssues("Connection request", "type", request.type, ["type"])) ??
        (request.label === undefined
          ? undefined
          : textIssues("Connection request", "label", request.label, ["label"]));
      if (invalid !== undefined) {
        return err(invalid);
      }
      const sourcePort =
        request.sourcePort ?? defaultPort(editor, request.source, SOURCE_DIRECTIONS);
      if (sourcePort === undefined) {
        return err([missingPortIssue("source", request.source, "output")]);
      }
      const targetPort =
        request.targetPort ?? defaultPort(editor, request.target, TARGET_DIRECTIONS);
      if (targetPort === undefined) {
        return err([missingPortIssue("target", request.target, "input")]);
      }
      const connected = createEdge(editor, {
        source: { nodeId: request.source, portId: sourcePort },
        target: { nodeId: request.target, portId: targetPort },
        ...(request.type === undefined ? {} : { definitionId: request.type }),
        ...(request.label === undefined ? {} : { label: request.label }),
      });
      if (!connected.ok) {
        return err([useCaseIssue(connected.error)]);
      }
      // The new relation changes where its target sits, so that node and what
      // hangs off it are what a downstream arrangement writes — again as its own
      // unit, which cannot fail the connection.
      lastArrangement = arrangeAfter([request.target]);
      return ok(toEdgeInstanceView(connected.value));
    },

    disconnect(edgeId: string): Result<EdgeInstanceView, SdkIssues> {
      const closed = closedIssues(isDisposed, "graph.disconnect");
      if (closed !== undefined) {
        return err(closed);
      }
      const issues = identifierIssues("Edge", edgeId, ["edgeId"]);
      if (issues !== undefined) {
        return err(issues);
      }
      const removed = removeEdge(editor, { edgeId });
      return removed.ok
        ? ok(toEdgeInstanceView(removed.value))
        : err([useCaseIssue(removed.error)]);
    },

    nodes(): readonly NodeInstanceView[] {
      return editor.graph.getNodes().map(toNodeInstanceView);
    },

    arrange(request?: ArrangeRequest): Result<readonly NodeInstanceView[], SdkIssues> {
      const closed = closedIssues(isDisposed, "graph.arrange");
      if (closed !== undefined) {
        return err(closed);
      }
      const invalid =
        request === undefined
          ? undefined
          : arrangeRequestIssues(request) ??
            (request.from === undefined
              ? undefined
              : identifierIssues("Arrange origin node", request.from, ["from"]));
      if (invalid !== undefined) {
        return err(invalid);
      }
      // The origin is resolved before the strategy runs: an id the graph does not
      // hold is a refusal, never a subset the SDK guesses.
      const from = request?.from;
      if (from !== undefined && editor.getNode(from) === undefined) {
        return err([unknownArrangeOriginIssue(from)]);
      }
      const computed = computePlacement(editor, graphLayout, arrangeSettings, request);
      if (!computed.ok) {
        return err(computed.error);
      }
      // A scoped request decides which computed positions are **written**; the
      // answer itself is always the whole graph, because a rank is a property of
      // all of it. One use case, one history unit, all-or-nothing: the written
      // subset is applied entirely or not at all.
      const written =
        from === undefined
          ? computed.value.positions
          : scopedTo(editor, [from], computed.value.positions);
      return applyPositions(editor, written);
    },

    lastAutoArrangement(): AutoArrangeOutcome {
      return lastArrangement;
    },

    edges(): readonly EdgeInstanceView[] {
      return editor.graph.getEdges().map(toEdgeInstanceView);
    },

    select(request: SelectRequest): Result<void, SdkIssues> {
      const closed = closedIssues(isDisposed, "graph.select");
      if (closed !== undefined) {
        return err(closed);
      }
      const invalid =
        requestIssues(
          request,
          "Selection request must be an object declaring the nodes and edges to select",
        ) ??
        (request.nodes !== undefined && !Array.isArray(request.nodes)
          ? [
              shapeIssue("Selected nodes must be an array of node ids", request.nodes, [
                "nodes",
              ]),
            ]
          : undefined) ??
        (request.edges !== undefined && !Array.isArray(request.edges)
          ? [
              shapeIssue("Selected edges must be an array of edge ids", request.edges, [
                "edges",
              ]),
            ]
          : undefined) ??
        (Array.isArray(request.nodes)
          ? selectionIssues("Node", request.nodes)
          : undefined) ??
        (Array.isArray(request.edges) ? selectionIssues("Edge", request.edges) : undefined);
      if (invalid !== undefined) {
        return err(invalid);
      }
      const selected = selectMultiple(editor, {
        ...(request.nodes === undefined ? {} : { nodeIds: request.nodes }),
        ...(request.edges === undefined ? {} : { edgeIds: request.edges }),
      });
      return selected.ok ? ok(undefined) : err([useCaseIssue(selected.error)]);
    },

    clearSelection(): Result<void, SdkIssues> {
      const closed = closedIssues(isDisposed, "graph.clearSelection");
      if (closed !== undefined) {
        return err(closed);
      }
      const cleared = clearSelection(editor);
      return cleared.ok ? ok(undefined) : err([useCaseIssue(cleared.error)]);
    },

    /**
     * Steps the history back.
     *
     * The signature is the history engine's boolean, so a disposed builder
     * cannot report a code here: it performs no mutation and reports `false`.
     */
    undo(): boolean {
      return isDisposed() ? false : undo(editor);
    },

    /** Steps the history forward; `false` on a disposed builder, see {@link undo}. */
    redo(): boolean {
      return isDisposed() ? false : redo(editor);
    },

    canUndo(): boolean {
      return editor.canUndo();
    },

    canRedo(): boolean {
      return editor.canRedo();
    },

    validate(
      options: { readonly levels?: readonly ValidationLevel[] } = {},
    ): ValidationReport {
      const levels = isPlainObject(options) ? options.levels : undefined;
      return levels === undefined
        ? validateGraph(editor)
        : validateGraph(editor, { levels });
    },

    nodeCount(): number {
      return editor.graph.nodeCount;
    },

    edgeCount(): number {
      return editor.graph.edgeCount;
    },

    selectedNodes(): readonly string[] {
      return editor.getSelectedNodes();
    },

    selectedEdges(): readonly string[] {
      return editor.getSelectedEdges();
    },
  };
  return api;
}
