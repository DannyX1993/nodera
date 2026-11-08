import { useCallback } from "react";

import {
  addNode,
  clearSelection,
  copySelection,
  cutSelection,
  pasteSelection,
  redo as redoHistory,
  removeEdge,
  removeNode,
  selectEdge,
  selectNode,
  undo as undoHistory,
  validateGraph,
  type EditorEngine,
} from "@nodera/application";
import type { ToolCommand } from "@nodera/ui-core";

/** Host-side capabilities a command may need from the canvas adapter. */
export interface CanvasCommandHandlers {
  /** Fits the graph into the canvas viewport. */
  readonly fitView?: () => void;
  /** Handles a `custom` command the host declares. */
  readonly onCustom?: (id: string, editor: EditorEngine) => void;
}

/**
 * Executes one declarative tool command against the application use cases.
 *
 * Returns `true` only when the command actually ran: a failed use case, a
 * missing canvas handler or a command owned by another binding (panel commands
 * belong to the layout actions) returns `false`, so a surface never reports a
 * success that did not happen.
 */
export type EditorCommandExecutor = (
  command: ToolCommand,
  handlers?: CanvasCommandHandlers,
) => boolean;

/** Binds the tool commands to the application use cases. */
export function useEditorCommands(editor: EditorEngine): EditorCommandExecutor {
  return useCallback<EditorCommandExecutor>(
    (command, handlers) => {
      switch (command.kind) {
        case "undo":
          return undoHistory(editor);
        case "redo":
          return redoHistory(editor);
        case "delete-selection": {
          const nodeIds = editor.getSelectedNodes();
          const edgeIds = editor.getSelectedEdges();
          if (nodeIds.length === 0 && edgeIds.length === 0) {
            return false;
          }
          for (const edgeId of edgeIds) {
            removeEdge(editor, { edgeId });
          }
          for (const nodeId of nodeIds) {
            removeNode(editor, { nodeId });
          }
          clearSelection(editor);
          return true;
        }
        case "copy-selection":
          return copySelection(editor).ok;
        case "cut-selection":
          return cutSelection(editor).ok;
        case "paste-selection":
          return pasteSelection(editor).ok;
        case "validate":
          validateGraph(editor);
          return true;
        case "select-node":
          return selectNode(editor, { nodeId: command.nodeId }).ok;
        case "select-edge":
          return selectEdge(editor, { edgeId: command.edgeId }).ok;
        case "clear-selection":
          return clearSelection(editor).ok;
        case "add-node":
          return addNode(editor, { definitionId: command.definitionId }).ok;
        case "fit-view": {
          if (handlers?.fitView === undefined) {
            return false;
          }
          handlers.fitView();
          return true;
        }
        case "custom": {
          if (handlers?.onCustom === undefined) {
            return false;
          }
          handlers.onCustom(command.id, editor);
          return true;
        }
        case "toggle-panel":
        case "dock-panel":
        case "float-panel":
          // Panel placement is UI state: `useLayoutActions` owns these commands.
          return false;
      }
    },
    [editor],
  );
}
