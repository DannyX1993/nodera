/**
 * Edge use cases: CreateEdge, RemoveEdge, UpdateEdge, ReconnectEdge.
 *
 * Each use case validates through the graph's structural rules, executes one
 * reversible command as a single history unit and emits its documented
 * events. Failed operations mutate nothing, push nothing, emit nothing.
 */

import {
  createEdgeId,
  createNodeId,
  err,
  ok,
  type Result,
} from "@nodera/contracts";
import { Connection, Edge } from "@nodera/graph-model";
import type { EditorEngine } from "../editor-engine.js";
import { emitChanged, toUseCaseError, type UseCaseError } from "./errors.js";

export interface EdgeEndpointInput {
  readonly nodeId: string;
  readonly portId: string;
}

export interface CreateEdgeInput {
  readonly edgeId?: string;
  readonly source: EdgeEndpointInput;
  readonly target: EdgeEndpointInput;
  readonly definitionId?: string;
  readonly label?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

function nextEdgeId(): string {
  return `edge-${Math.random().toString(36).slice(2, 10)}`;
}

/** Creates a directed edge between two node ports. */
export function createEdge(
  editor: EditorEngine,
  input: CreateEdgeInput,
): Result<Edge, UseCaseError> {
  const edge = new Edge(
    createEdgeId(input.edgeId ?? nextEdgeId()),
    new Connection(
      {
        nodeId: createNodeId(input.source.nodeId),
        portId: input.source.portId,
      },
      {
        nodeId: createNodeId(input.target.nodeId),
        portId: input.target.portId,
      },
    ),
    input.definitionId,
    input.label,
    input.metadata,
  );
  const added = editor.graph.addEdge(edge);
  if (!added.ok) {
    return err(toUseCaseError(added.error));
  }
  editor.history.push(editor.editorState, {
    label: "create-edge",
    apply: () => {
      editor.graph.addEdge(edge);
    },
    reverse: () => {
      editor.graph.removeEdge(edge.id);
    },
  });
  editor.events.emit({ name: "edge.created", payload: { edgeId: edge.id } });
  emitChanged(editor, "create-edge");
  return ok(edge);
}

export interface RemoveEdgeInput {
  readonly edgeId: string;
}

/** Removes an edge; reversible by re-adding the captured edge. */
export function removeEdge(
  editor: EditorEngine,
  input: RemoveEdgeInput,
): Result<Edge, UseCaseError> {
  const removed = editor.graph.removeEdge(createEdgeId(input.edgeId));
  if (!removed.ok) {
    return err(toUseCaseError(removed.error));
  }
  const edge = removed.value;
  editor.history.push(editor.editorState, {
    label: "remove-edge",
    apply: () => {
      editor.graph.addEdge(edge);
    },
    reverse: () => {
      editor.graph.removeEdge(edge.id);
    },
  });
  editor.events.emit({ name: "edge.deleted", payload: { edgeId: edge.id } });
  emitChanged(editor, "remove-edge");
  return ok(edge);
}

export interface UpdateEdgeInput {
  readonly edgeId: string;
  readonly label?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Replaces the edge label and/or metadata; reversible. */
export function updateEdge(
  editor: EditorEngine,
  input: UpdateEdgeInput,
): Result<Edge, UseCaseError> {
  const edge = editor.graph.getEdge(createEdgeId(input.edgeId));
  if (edge === undefined) {
    return err({
      kind: "edge-not-found",
      message: `Graph has no edge with id "${input.edgeId}"`,
      elementId: input.edgeId,
    });
  }
  const previousLabel = edge.label;
  const previousMetadata = edge.metadata;
  editor.history.push(editor.editorState, {
    label: "update-edge",
    apply: () => {
      if (input.label !== undefined) {
        edge.setLabel(input.label);
      }
      if (input.metadata !== undefined) {
        edge.setMetadata(input.metadata);
      }
    },
    reverse: () => {
      edge.setLabel(previousLabel);
      edge.setMetadata(previousMetadata);
    },
  });
  editor.events.emit({ name: "edge.updated", payload: { edgeId: edge.id } });
  emitChanged(editor, "update-edge");
  return ok(edge);
}

export interface ReconnectEdgeInput {
  readonly edgeId: string;
  readonly source?: EdgeEndpointInput;
  readonly target?: EdgeEndpointInput;
}

/**
 * Reconnects one or both endpoints of an edge. The new connection is
 * validated against the same structural rules as a new edge; on failure the
 * original edge stays in place and a structured error is returned.
 */
export function reconnectEdge(
  editor: EditorEngine,
  input: ReconnectEdgeInput,
): Result<Edge, UseCaseError> {
  const edge = editor.graph.getEdge(createEdgeId(input.edgeId));
  if (edge === undefined) {
    return err({
      kind: "edge-not-found",
      message: `Graph has no edge with id "${input.edgeId}"`,
      elementId: input.edgeId,
    });
  }
  const nextSource = input.source ?? edge.connection.source;
  const nextTarget = input.target ?? edge.connection.target;
  const removed = editor.graph.removeEdge(edge.id);
  if (!removed.ok) {
    return err(toUseCaseError(removed.error));
  }
  let replacement: Edge;
  try {
    replacement = new Edge(
      edge.id,
      new Connection(
        {
          nodeId: createNodeId(nextSource.nodeId),
          portId: nextSource.portId,
        },
        {
          nodeId: createNodeId(nextTarget.nodeId),
          portId: nextTarget.portId,
        },
      ),
      edge.definitionId,
      edge.label,
      edge.metadata,
    );
  } catch (error) {
    editor.graph.addEdge(edge);
    return err({
      kind: "invalid-input",
      message: error instanceof Error ? error.message : "invalid connection",
      elementId: input.edgeId,
    });
  }
  const added = editor.graph.addEdge(replacement);
  if (!added.ok) {
    editor.graph.addEdge(edge);
    return err(toUseCaseError(added.error));
  }
  const previousEdge = edge;
  editor.history.push(editor.editorState, {
    label: "reconnect-edge",
    apply: () => {
      editor.graph.removeEdge(edge.id);
      editor.graph.addEdge(replacement);
    },
    reverse: () => {
      editor.graph.removeEdge(edge.id);
      editor.graph.addEdge(previousEdge);
    },
  });
  editor.events.emit({ name: "edge.updated", payload: { edgeId: edge.id } });
  emitChanged(editor, "reconnect-edge");
  return ok(replacement);
}
