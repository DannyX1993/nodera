import type { EditorEngine } from "../editor-engine.js";

/**
 * Structured errors for application use cases. Kinds mirror the domain and
 * graph-model error kinds so hosts can branch without parsing messages.
 */
export type UseCaseErrorKind =
  | "node-not-found"
  | "edge-not-found"
  | "duplicate-node-id"
  | "duplicate-edge-id"
  | "node-definition-not-found"
  | "invalid-node-definition"
  | "self-loop-forbidden"
  | "multi-edge-forbidden"
  | "cycle-forbidden"
  | "invalid-input"
  | "empty-selection"
  | "empty-clipboard";

export interface UseCaseError {
  readonly kind: UseCaseErrorKind;
  readonly message: string;
  readonly elementId?: string;
}

/** Maps graph-model/domain structured errors into use case errors. */
export function toUseCaseError(error: {
  readonly kind: string;
  readonly message: string;
  readonly elementId?: string;
}): UseCaseError {
  return error.elementId === undefined
    ? { kind: error.kind as UseCaseErrorKind, message: error.message }
    : {
        kind: error.kind as UseCaseErrorKind,
        message: error.message,
        elementId: error.elementId,
      };
}

/** Emits the single graph.changed event for one logical operation. */
export function emitChanged(editor: EditorEngine, cause: string): void {
  editor.events.emit({
    name: "graph.changed",
    payload: { graphId: editor.graph.id, cause },
  });
}
