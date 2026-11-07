/**
 * History use cases: Undo, Redo.
 *
 * They delegate to the composed history engine and emit the single
 * `graph.changed` event describing the cursor movement; command-specific
 * events are not re-emitted on undo/redo (the operation already announced
 * itself when it was applied the first time).
 */

import type { EditorEngine } from "../editor-engine.js";

/** Reverts the last operation. Returns false when there is nothing to undo. */
export function undo(editor: EditorEngine): boolean {
  const done = editor.history.undo(editor.editorState);
  if (done) {
    editor.events.emit({
      name: "graph.changed",
      payload: { graphId: editor.graph.id, cause: "undo" },
    });
  }
  return done;
}

/** Re-applies the last undone operation. Returns false when nothing to redo. */
export function redo(editor: EditorEngine): boolean {
  const done = editor.history.redo(editor.editorState);
  if (done) {
    editor.events.emit({
      name: "graph.changed",
      payload: { graphId: editor.graph.id, cause: "redo" },
    });
  }
  return done;
}
