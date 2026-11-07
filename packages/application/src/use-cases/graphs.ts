/**
 * Graph use cases: CreateGraph, LoadGraph, ClearGraph, DeleteGraph,
 * UpdateGraphMetadata.
 *
 * Create/Load start a new editing target: they replace the current graph and
 * reset selection. Clear/Delete and metadata updates are reversible commands.
 */

import {
  createGraphId,
  err,
  ok,
  type Result,
} from "@nodera/contracts";
import { Graph, type GraphMetadata, type GraphSettings } from "@nodera/graph-model";
import type { EditorEngine } from "../editor-engine.js";
import { emitChanged, type UseCaseError } from "./errors.js";

function randomGraphId(): string {
  return `graph-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateGraphInput {
  readonly graphId?: string;
  readonly metadata?: GraphMetadata;
  readonly settings?: GraphSettings;
}

/** Replaces the current graph with a fresh empty one (one undo unit). */
export function createGraph(
  editor: EditorEngine,
  input: CreateGraphInput = {},
): Result<Graph, UseCaseError> {
  const previous = editor.graph;
  const graph = new Graph(
    createGraphId(input.graphId ?? randomGraphId()),
    input.metadata ?? {},
    input.settings,
  );
  editor.history.push(editor.editorState, {
    label: "create-graph",
    apply: () => {
      editor.replaceGraph(graph);
    },
    reverse: () => {
      editor.replaceGraph(previous);
    },
  });
  editor.events.emit({ name: "graph.created", payload: { graphId: graph.id } });
  return ok(graph);
}

export interface LoadGraphInput {
  readonly graphId?: string;
  /** Explicit graph to load; when omitted a fresh graph is loaded. */
  readonly graph?: Graph;
}

/**
 * Loads a graph as the new editing target: replaces graph, selection and
 * clipboard context. History is cleared: previous undo units belong to the
 * previous graph and reversing them onto the new target would be wrong.
 */
export function loadGraph(
  editor: EditorEngine,
  input: LoadGraphInput = {},
): Result<Graph, UseCaseError> {
  const graph = input.graph ?? new Graph(createGraphId(input.graphId ?? randomGraphId()));
  editor.replaceGraph(graph);
  editor.history.clear();
  editor.events.emit({ name: "graph.loaded", payload: { graphId: graph.id } });
  return ok(graph);
}

/** Removes every node and edge; reversible as one undo unit. */
export function clearGraph(
  editor: EditorEngine,
): Result<{ nodes: number; edges: number }, UseCaseError> {
  const removed = editor.graph.clear();
  if (removed.nodes.length === 0 && removed.edges.length === 0) {
    return ok({ nodes: 0, edges: 0 });
  }
  const nodes = removed.nodes;
  const edges = removed.edges;
  editor.history.push(editor.editorState, {
    label: "clear-graph",
    apply: () => {
      editor.graph.clear();
    },
    reverse: () => {
      for (const node of nodes) {
        editor.graph.addNode(node);
      }
      for (const edge of edges) {
        editor.graph.addEdge(edge);
      }
    },
  });
  emitChanged(editor, "clear-graph");
  return ok({ nodes: nodes.length, edges: edges.length });
}

/**
 * Deletes the graph content and resets its metadata to empty, as one undo
 * unit. The editing session continues on the same graph entity.
 */
export function deleteGraph(
  editor: EditorEngine,
): Result<void, UseCaseError> {
  const removed = editor.graph.clear();
  const nodes = removed.nodes;
  const edges = removed.edges;
  const previousMetadata = editor.graph.metadata;
  editor.history.push(editor.editorState, {
    label: "delete-graph",
    apply: () => {
      editor.graph.clear();
      editor.graph.setMetadata({});
    },
    reverse: () => {
      for (const node of nodes) {
        editor.graph.addNode(node);
      }
      for (const edge of edges) {
        editor.graph.addEdge(edge);
      }
      editor.graph.setMetadata(previousMetadata);
    },
  });
  emitChanged(editor, "delete-graph");
  return ok(undefined);
}

export interface UpdateGraphMetadataInput {
  readonly metadata: GraphMetadata;
}

/** Replaces the graph metadata; reversible. */
export function updateGraphMetadata(
  editor: EditorEngine,
  input: UpdateGraphMetadataInput,
): Result<Graph, UseCaseError> {
  const previous = editor.graph.metadata;
  editor.history.push(editor.editorState, {
    label: "update-graph-metadata",
    apply: () => {
      editor.graph.setMetadata(input.metadata);
    },
    reverse: () => {
      editor.graph.setMetadata(previous);
    },
  });
  emitChanged(editor, "update-graph-metadata");
  return ok(editor.graph);
}
