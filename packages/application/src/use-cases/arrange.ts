/**
 * Arrange use case: applies a batch of node positions as one history unit.
 *
 * It is the application entry point for an explicit `Arrange` action: a host
 * computes the geometry elsewhere (a layout strategy, a user action) and hands
 * the resulting positions over, so the arrangement is one reversible change
 * (AGENTS.md §12) instead of N independent moves.
 *
 * All-or-nothing: every node id and every position is validated before the
 * first write. A missing node, a repeated node id or an invalid position
 * returns a structured error and leaves the graph, the history and the event
 * bus untouched (AGENTS.md §12, §13).
 */

import { createNodeId, err, ok, type Result } from "@nodera/contracts";
import type { Node, NodePosition } from "@nodera/graph-model";
import type { EditorEngine } from "../editor-engine.js";
import { emitChanged, type UseCaseError } from "./errors.js";

/** One requested position for one existing node. */
export interface ArrangeMove {
  readonly nodeId: string;
  readonly position: NodePosition;
}

export interface ArrangeGraphInput {
  /**
   * Positions to apply, in the order the caller wants them applied. Ordering
   * is observable only through the returned nodes and the emitted events.
   */
  readonly moves: readonly ArrangeMove[];
}

/** Result value: the moved nodes, in request order. */
export type ArrangeGraphResult = readonly Node[];

/**
 * Applies every requested position as a single undo unit labelled
 * `arrange-graph`, so one undo restores every previous position and one redo
 * reapplies them all.
 */
export function arrangeGraph(
  editor: EditorEngine,
  input: ArrangeGraphInput,
): Result<ArrangeGraphResult, UseCaseError> {
  const requested: {
    readonly node: Node;
    readonly previous: NodePosition | undefined;
    readonly next: NodePosition;
  }[] = [];
  const seen = new Set<string>();
  for (const move of input.moves) {
    if (seen.has(move.nodeId)) {
      return err({
        kind: "invalid-input",
        message: `Arrange request contains node "${move.nodeId}" more than once`,
        elementId: move.nodeId,
      });
    }
    seen.add(move.nodeId);
    const node = editor.graph.getNode(createNodeId(move.nodeId));
    if (node === undefined) {
      return err({
        kind: "node-not-found",
        message: `Graph has no node with id "${move.nodeId}"`,
        elementId: move.nodeId,
      });
    }
    if (!isPosition(move.position)) {
      return err({
        kind: "invalid-input",
        message: `Arrange request has an invalid position for node "${move.nodeId}"`,
        elementId: move.nodeId,
      });
    }
    requested.push({
      node,
      previous: node.position,
      next: { x: move.position.x, y: move.position.y },
    });
  }
  if (requested.length === 0) {
    return ok([]);
  }
  editor.history.push(editor.editorState, {
    label: "arrange-graph",
    apply: () => {
      for (const entry of requested) {
        entry.node.setPosition(entry.next);
      }
    },
    reverse: () => {
      for (const entry of requested) {
        entry.node.setPosition(entry.previous);
      }
    },
  });
  for (const entry of requested) {
    editor.events.emit({ name: "node.updated", payload: { nodeId: entry.node.id } });
  }
  emitChanged(editor, "arrange-graph");
  return ok(requested.map((entry) => entry.node));
}

/** Positions come from outside the framework: validate before trusting them. */
function isPosition(position: unknown): position is NodePosition {
  if (typeof position !== "object" || position === null) {
    return false;
  }
  const candidate = position as { readonly x?: unknown; readonly y?: unknown };
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y)
  );
}
