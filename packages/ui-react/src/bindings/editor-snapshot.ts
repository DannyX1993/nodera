import { useEffect, useMemo, useReducer } from "react";

import { EDITOR_EVENT_NAMES, type EditorEngine } from "@nodera/application";
import type { Graph } from "@nodera/graph-model";
import type { ToolAvailabilityContext } from "@nodera/ui-core";

/**
 * Immutable read model of the editor engine.
 *
 * React never mutates the engine and never reads it during render without a
 * snapshot: this value is derived from the application-owned editor state and
 * refreshed by the documented event bus, which keeps the presentation layer a
 * consumer of the application contracts (S5, S8).
 */
export interface EditorSnapshot {
  /** Increments on every editor event, so consumers can invalidate derived data. */
  readonly version: number;
  readonly graph: Graph;
  readonly selectedNodes: readonly string[];
  readonly selectedEdges: readonly string[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly clipboardSize: number;
}

/**
 * Subscribes to every documented editor event and re-derives the snapshot.
 *
 * The event bus is the only refresh channel, so any application use case that
 * mutates the editor refreshes every subscriber with no extra wiring.
 */
export function useEditorSnapshot(editor: EditorEngine): EditorSnapshot {
  const [version, bumpVersion] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    const unsubscribes = [...EDITOR_EVENT_NAMES].map((name) =>
      editor.events.subscribe(name, () => {
        bumpVersion();
      }),
    );
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [editor]);

  return useMemo<EditorSnapshot>(
    () => ({
      version,
      graph: editor.graph,
      selectedNodes: editor.getSelectedNodes(),
      selectedEdges: editor.getSelectedEdges(),
      canUndo: editor.canUndo(),
      canRedo: editor.canRedo(),
      clipboardSize: editor.getClipboard().length,
    }),
    [editor, version],
  );
}

/** Editor facts that decide whether a declarative tool is available. */
export function useToolAvailability(editor: EditorEngine): ToolAvailabilityContext {
  const snapshot = useEditorSnapshot(editor);

  return useMemo<ToolAvailabilityContext>(
    () => ({
      canUndo: snapshot.canUndo,
      canRedo: snapshot.canRedo,
      selectedNodeCount: snapshot.selectedNodes.length,
      selectedEdgeCount: snapshot.selectedEdges.length,
      clipboardSize: snapshot.clipboardSize,
    }),
    [snapshot],
  );
}
