/**
 * Selection use cases: SelectNode, SelectEdge, SelectMultiple,
 * ClearSelection.
 *
 * Selection is editor state (AGENTS.md §5.3): it is never serialized into the
 * portable document and it does not create history units. The documented
 * `node.selected` event is emitted when a node enters the selection, and every
 * successful selection use case emits `selection.changed` with the resulting
 * selection, so panels can re-render without reading editor internals.
 */

import { createEdgeId, createNodeId, err, ok, type Result } from "@nodera/contracts";
import type { EditorEngine } from "../editor-engine.js";
import type { UseCaseError } from "./errors.js";

/**
 * Emits `selection.changed` with the selection the mutation produced.
 *
 * The payload carries the post-mutation identifiers in selection order, so a
 * listener never needs to read the editor state to render the selection.
 */
function emitSelectionChanged(editor: EditorEngine): void {
  editor.events.emit({
    name: "selection.changed",
    payload: {
      selectedNodes: editor.getSelectedNodes(),
      selectedEdges: editor.getSelectedEdges(),
    },
  });
}

export interface SelectNodeInput {
  readonly nodeId: string;
  /** Adds to the current selection instead of replacing it. */
  readonly additive?: boolean;
}

/** Selects one node, replacing the selection unless `additive`. */
export function selectNode(
  editor: EditorEngine,
  input: SelectNodeInput,
): Result<void, UseCaseError> {
  const nodeId = createNodeId(input.nodeId);
  if (editor.graph.getNode(nodeId) === undefined) {
    return err({
      kind: "node-not-found",
      message: `Graph has no node with id "${input.nodeId}"`,
      elementId: input.nodeId,
    });
  }
  if (!input.additive) {
    editor.editorState.selectedNodes.clear();
    editor.editorState.selectedEdges.clear();
  }
  editor.editorState.selectedNodes.add(nodeId);
  editor.events.emit({ name: "node.selected", payload: { nodeId } });
  emitSelectionChanged(editor);
  return ok(undefined);
}

export interface SelectEdgeInput {
  readonly edgeId: string;
  readonly additive?: boolean;
}

/** Selects one edge, replacing the selection unless `additive`. */
export function selectEdge(
  editor: EditorEngine,
  input: SelectEdgeInput,
): Result<void, UseCaseError> {
  const edgeId = createEdgeId(input.edgeId);
  if (editor.graph.getEdge(edgeId) === undefined) {
    return err({
      kind: "edge-not-found",
      message: `Graph has no edge with id "${input.edgeId}"`,
      elementId: input.edgeId,
    });
  }
  if (!input.additive) {
    editor.editorState.selectedNodes.clear();
    editor.editorState.selectedEdges.clear();
  }
  editor.editorState.selectedEdges.add(edgeId);
  emitSelectionChanged(editor);
  return ok(undefined);
}

export interface SelectMultipleInput {
  readonly nodeIds?: readonly string[];
  readonly edgeIds?: readonly string[];
}

/** Replaces the whole selection with the given nodes and edges. */
export function selectMultiple(
  editor: EditorEngine,
  input: SelectMultipleInput,
): Result<void, UseCaseError> {
  const nodeIds = input.nodeIds ?? [];
  const edgeIds = input.edgeIds ?? [];
  for (const raw of nodeIds) {
    if (editor.graph.getNode(createNodeId(raw)) === undefined) {
      return err({
        kind: "node-not-found",
        message: `Graph has no node with id "${raw}"`,
        elementId: raw,
      });
    }
  }
  for (const raw of edgeIds) {
    if (editor.graph.getEdge(createEdgeId(raw)) === undefined) {
      return err({
        kind: "edge-not-found",
        message: `Graph has no edge with id "${raw}"`,
        elementId: raw,
      });
    }
  }
  editor.editorState.selectedNodes.clear();
  editor.editorState.selectedEdges.clear();
  for (const raw of nodeIds) {
    editor.editorState.selectedNodes.add(createNodeId(raw));
  }
  for (const raw of edgeIds) {
    editor.editorState.selectedEdges.add(createEdgeId(raw));
  }
  emitSelectionChanged(editor);
  return ok(undefined);
}

/** Clears the whole selection (nodes and edges). */
export function clearSelection(editor: EditorEngine): Result<void, UseCaseError> {
  editor.editorState.selectedNodes.clear();
  editor.editorState.selectedEdges.clear();
  emitSelectionChanged(editor);
  return ok(undefined);
}
