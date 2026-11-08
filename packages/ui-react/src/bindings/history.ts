import { useCallback, useEffect, useMemo, useReducer } from "react";

import { redo as redoHistory, undo as undoHistory, type EditorEngine } from "@nodera/application";

/**
 * History surface state.
 *
 * `undoSize` counts the units that can still be undone (the redo stack is
 * excluded), `redoSize` the units that can be re-applied. Labels come from the
 * history engine, oldest first, so a history panel renders application data
 * instead of duplicating the stack.
 */
export interface HistoryState {
  readonly labels: readonly string[];
  readonly undoSize: number;
  readonly redoSize: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  undo(): void;
  redo(): void;
}

/** Subscribes to the history engine and binds undo/redo to the use cases. */
export function useHistory(editor: EditorEngine): HistoryState {
  const [version, bumpVersion] = useReducer((value: number) => value + 1, 0);

  useEffect(
    () =>
      editor.history.subscribe(() => {
        bumpVersion();
      }),
    [editor],
  );

  const undo = useCallback(() => {
    undoHistory(editor);
  }, [editor]);

  const redo = useCallback(() => {
    redoHistory(editor);
  }, [editor]);

  return useMemo<HistoryState>(() => {
    const redoSize = editor.history.redoSize();
    const total = editor.history.size();
    return {
      labels: editor.history.labels(),
      undoSize: total - redoSize,
      redoSize,
      canUndo: editor.history.canUndo(),
      canRedo: editor.history.canRedo(),
      undo,
      redo,
    };
  }, [editor, version, undo, redo]);
}
