import { useCallback } from "react";

import type { Rect, ToolCommand } from "@nodera/ui-core";

import {
  useEditorCommands,
  type CanvasCommandHandlers,
} from "../../bindings/editor-commands.js";
import { useLayoutActions, type LayoutActions } from "../../bindings/layout-actions.js";
import { useCommandBinding } from "./command-binding.js";

/**
 * Default rectangle of a panel floated through a command.
 *
 * A `float-panel` command carries no geometry (the layout engine owns the
 * rules, the command is plain data), so the presentation layer supplies a
 * documented starting rectangle the user can then move. It is never persisted
 * into a document.
 */
export const DEFAULT_FLOATING_RECT: Rect = Object.freeze({
  x: 80,
  y: 80,
  width: 320,
  height: 240,
});

/** Runs one declarative tool command through the surface that owns it. */
export type CommandDispatch = (command: ToolCommand) => boolean;

/**
 * Single entry point every action surface uses to run a tool command.
 *
 * The order is the layer order: application use cases first (the editor owns
 * editing, history, selection and validation), then UI state (panel placement
 * belongs to the layout engine and the UI store), and only when both decline,
 * the host hook. A surface never re-implements a command: it hands the
 * declarative descriptor over and this function routes it.
 *
 * It returns `true` only when something ran, so a click never reports a success
 * the application did not produce. With no editor on the provider, editor
 * commands are skipped instead of throwing and layout commands keep working.
 */
export function useCommandDispatcher(
  handlers?: CanvasCommandHandlers,
  onCommand?: (command: ToolCommand) => void,
): CommandDispatch {
  const { editor, engine } = useCommandBinding();
  const runEditorCommand = useEditorCommands(engine);
  const layout = useLayoutActions();

  return useCallback<CommandDispatch>(
    (command) => {
      if (editor !== undefined && runEditorCommand(command, handlers)) {
        return true;
      }
      if (runLayoutCommand(layout, command)) {
        return true;
      }
      if (onCommand === undefined) {
        return false;
      }
      onCommand(command);
      return true;
    },
    [editor, runEditorCommand, handlers, layout, onCommand],
  );
}

/**
 * Routes a panel-placement command to the layout actions.
 *
 * Availability rules live in the layout engine (capabilities, clamping), so the
 * command counts as handled once it reaches them: whether the state actually
 * changes is the engine's decision, not the surface's.
 */
function runLayoutCommand(actions: LayoutActions, command: ToolCommand): boolean {
  switch (command.kind) {
    case "toggle-panel":
      actions.togglePanel(command.panelId);
      return true;
    case "dock-panel":
      actions.dockPanel(command.panelId, command.region);
      return true;
    case "float-panel":
      actions.floatPanel(command.panelId, DEFAULT_FLOATING_RECT);
      return true;
    default:
      return false;
  }
}
