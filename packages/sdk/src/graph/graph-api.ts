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
  clearSelection,
  createEdge,
  moveNode,
  redo,
  removeEdge,
  removeNode,
  selectMultiple,
  undo,
  updateNodeProperties,
  validateGraph,
  type EditorEngine,
  type UseCaseError,
} from "@nodera/application";
import type { ValidationLevel, ValidationReport } from "@nodera/validation";
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

/** One node to add, in the public `type` vocabulary of the SDK. */
export interface AddNodeRequest {
  /** Globally qualified node definition type, e.g. `http.request`. */
  readonly type: string;
  /** Explicit instance id; generated from the definition when omitted. */
  readonly nodeId?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly position?: NodePosition;
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
 * The graph surface of the builder.
 *
 * Mutation is reported as `Result` so the host branches once per call; the
 * reads (`nodes`, `edges`, `nodeCount`, `selectedNodes`, history flags) mirror
 * the editor state, answer in the §9 vocabulary and never allocate diagnostics.
 */
export interface BuilderGraphApi {
  addNode(request: AddNodeRequest): Result<NodeInstanceView, SdkIssues>;
  removeNode(nodeId: string): Result<NodeInstanceView, SdkIssues>;
  moveNode(nodeId: string, position: NodePosition): Result<NodeInstanceView, SdkIssues>;
  /** Writes each property value through the update use case, one history unit each. */
  updateProperties(
    nodeId: string,
    properties: Readonly<Record<string, unknown>>,
  ): Result<NodeInstanceView, SdkIssues>;
  connect(request: ConnectRequest): Result<EdgeInstanceView, SdkIssues>;
  disconnect(edgeId: string): Result<EdgeInstanceView, SdkIssues>;
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
 * Builds the graph facade of a builder over its editing session.
 *
 * The editor owns the graph, the history and the events; this API owns only
 * the translation between the public vocabulary and the use case contracts.
 * `isDisposed` is the builder's own lifecycle flag: a disposed builder refuses
 * every mutation with `sdk.disposed` and keeps every read working, because the
 * state the host already received must stay renderable.
 */
export function createGraphApi(
  editor: EditorEngine,
  isDisposed: () => boolean,
): BuilderGraphApi {
  return {
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
        (request.position === undefined ? undefined : positionIssues(request.position));
      if (invalid !== undefined) {
        return err(invalid);
      }
      const added = addNode(editor, {
        definitionId: request.type,
        ...(request.nodeId === undefined ? {} : { nodeId: request.nodeId }),
        ...(request.properties === undefined ? {} : { properties: request.properties }),
        ...(request.position === undefined ? {} : { position: request.position }),
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
      const removed = removeNode(editor, { nodeId });
      return removed.ok
        ? ok(toNodeInstanceView(removed.value.node))
        : err([useCaseIssue(removed.error)]);
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
      return connected.ok ? ok(toEdgeInstanceView(connected.value)) : err([useCaseIssue(connected.error)]);
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
}
