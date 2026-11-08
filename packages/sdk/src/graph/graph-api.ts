/**
 * The SDK Graph API: the supported surface for editing the builder's graph.
 *
 * Every method delegates to the application use case of the same name, so the
 * SDK never reimplements validation, history or events: it only translates the
 * public request vocabulary into use case input and the structured
 * `UseCaseError` back into one SDK diagnostic. Identifiers are shape-checked
 * before they reach a use case, because a branded identifier constructor throws
 * and the SDK never throws for data.
 *
 * `undo`/`redo`/`canUndo`/`canRedo` return the history engine's booleans
 * unwrapped: there is no data problem to report, only a cursor position.
 */

import { err, isValidIdShape, ok, type Result } from "@nodera/contracts";
import type { Edge, Node, NodePosition, PortDirection } from "@nodera/graph-model";
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
import { sdkError, type SdkIssue, type SdkIssues } from "../errors.js";

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
 * reads (`nodeCount`, `selectedNodes`, history flags) mirror the editor state
 * and never allocate diagnostics.
 */
export interface BuilderGraphApi {
  addNode(request: AddNodeRequest): Result<Node, SdkIssues>;
  removeNode(nodeId: string): Result<Node, SdkIssues>;
  moveNode(nodeId: string, position: NodePosition): Result<Node, SdkIssues>;
  /** Writes each property value through the update use case, one history unit each. */
  updateProperties(
    nodeId: string,
    properties: Readonly<Record<string, unknown>>,
  ): Result<Node, SdkIssues>;
  connect(request: ConnectRequest): Result<Edge, SdkIssues>;
  disconnect(edgeId: string): Result<Edge, SdkIssues>;
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
function identifierIssues(kind: string, value: string): SdkIssues | undefined {
  if (isValidIdShape(value)) {
    return undefined;
  }
  return [
    {
      ...sdkError(
        "sdk.invalid-input",
        `${kind} id must be a non-empty string without whitespace`,
        { metadata: { value } },
      ),
      severity: "error",
    },
  ];
}

/** First identifier that is malformed, in the order the caller passed them. */
function endpointIssues(
  endpoints: readonly (readonly [string, string])[],
): SdkIssues | undefined {
  for (const [kind, value] of endpoints) {
    const issues = identifierIssues(kind, value);
    if (issues !== undefined) {
      return issues;
    }
  }
  return undefined;
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
 */
export function createGraphApi(editor: EditorEngine): BuilderGraphApi {
  return {
    addNode(request: AddNodeRequest): Result<Node, SdkIssues> {
      if (request.nodeId !== undefined) {
        const issues = identifierIssues("Node", request.nodeId);
        if (issues !== undefined) {
          return err(issues);
        }
      }
      const added = addNode(editor, {
        definitionId: request.type,
        ...(request.nodeId === undefined ? {} : { nodeId: request.nodeId }),
        ...(request.properties === undefined ? {} : { properties: request.properties }),
        ...(request.position === undefined ? {} : { position: request.position }),
      });
      return added.ok ? ok(added.value) : err([useCaseIssue(added.error)]);
    },

    removeNode(nodeId: string): Result<Node, SdkIssues> {
      const issues = identifierIssues("Node", nodeId);
      if (issues !== undefined) {
        return err(issues);
      }
      const removed = removeNode(editor, { nodeId });
      return removed.ok ? ok(removed.value.node) : err([useCaseIssue(removed.error)]);
    },

    moveNode(nodeId: string, position: NodePosition): Result<Node, SdkIssues> {
      const issues = identifierIssues("Node", nodeId);
      if (issues !== undefined) {
        return err(issues);
      }
      const moved = moveNode(editor, { nodeId, position });
      return moved.ok ? ok(moved.value) : err([useCaseIssue(moved.error)]);
    },

    updateProperties(
      nodeId: string,
      properties: Readonly<Record<string, unknown>>,
    ): Result<Node, SdkIssues> {
      const issues = identifierIssues("Node", nodeId);
      if (issues !== undefined) {
        return err(issues);
      }
      let updated: Node | undefined;
      for (const [name, value] of Object.entries(properties)) {
        const result = updateNodeProperties(editor, { nodeId, name, value });
        if (!result.ok) {
          return err([useCaseIssue(result.error)]);
        }
        updated = result.value;
      }
      if (updated !== undefined) {
        return ok(updated);
      }
      const existing = editor.getNode(nodeId);
      return existing === undefined ? err([missingNodeIssue(nodeId)]) : ok(existing);
    },

    connect(request: ConnectRequest): Result<Edge, SdkIssues> {
      const issues = endpointIssues([
        ["Source node", request.source],
        ["Target node", request.target],
      ]);
      if (issues !== undefined) {
        return err(issues);
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
      return connected.ok ? ok(connected.value) : err([useCaseIssue(connected.error)]);
    },

    disconnect(edgeId: string): Result<Edge, SdkIssues> {
      const issues = identifierIssues("Edge", edgeId);
      if (issues !== undefined) {
        return err(issues);
      }
      const removed = removeEdge(editor, { edgeId });
      return removed.ok ? ok(removed.value) : err([useCaseIssue(removed.error)]);
    },

    select(request: SelectRequest): Result<void, SdkIssues> {
      const nodes = request.nodes ?? [];
      const edges = request.edges ?? [];
      const issues = endpointIssues([
        ...nodes.map((nodeId) => ["Node", nodeId] as const),
        ...edges.map((edgeId) => ["Edge", edgeId] as const),
      ]);
      if (issues !== undefined) {
        return err(issues);
      }
      const selected = selectMultiple(editor, {
        ...(request.nodes === undefined ? {} : { nodeIds: request.nodes }),
        ...(request.edges === undefined ? {} : { edgeIds: request.edges }),
      });
      return selected.ok ? ok(undefined) : err([useCaseIssue(selected.error)]);
    },

    clearSelection(): Result<void, SdkIssues> {
      const cleared = clearSelection(editor);
      return cleared.ok ? ok(undefined) : err([useCaseIssue(cleared.error)]);
    },

    undo(): boolean {
      return undo(editor);
    },

    redo(): boolean {
      return redo(editor);
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
      return options.levels === undefined
        ? validateGraph(editor)
        : validateGraph(editor, { levels: options.levels });
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
