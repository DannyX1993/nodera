import { useMemo } from "react";

import { EditorEngine } from "@nodera/application";

import { useNoderaUi } from "../../providers/ui-provider.js";

/**
 * Editor a command surface binds to.
 *
 * Toolbars, context menus and report panels bind to a live editor, but a host
 * may compose a provider without one (S2: a header plus a toolbar arrangement
 * that never renders a graph), and the command bindings require an engine.
 * Every surface therefore always receives an engine: the host editor when it
 * exists, and otherwise an inert one created once per binding and never
 * executed against. Consumers must check `editor` before routing anything to
 * `engine`, so the placeholder never runs a command.
 */
export interface CommandBinding {
  /** Editor the host supplied, if any. */
  readonly editor: EditorEngine | undefined;
  /** Engine the command hooks bind to: the host editor, or the inert one. */
  readonly engine: EditorEngine;
}

/** Resolves the engine a command surface binds to. */
export function useCommandBinding(): CommandBinding {
  const { editor } = useNoderaUi();
  const inert = useMemo(() => new EditorEngine({ graphId: "nodera.ui.no-editor" }), []);
  return useMemo<CommandBinding>(
    () => ({ editor, engine: editor ?? inert }),
    [editor, inert],
  );
}
