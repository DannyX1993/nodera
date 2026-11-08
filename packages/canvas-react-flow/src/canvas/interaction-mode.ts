import type { InteractionMode } from "@nodera/ui-core";

/**
 * Canvas interaction mode (S5 "Modo de interacción").
 *
 * The mode itself is editor/UI state owned by `@nodera/ui-core`
 * (`UiState.interactionMode`); this alias exists so the canvas adapter can
 * expose its own prop without re-declaring the union, and so a change in the
 * shared mode is a compile error here instead of silent drift.
 */
export type CanvasInteractionMode = InteractionMode;

/** React Flow drag props that implement one interaction mode. */
export interface CanvasInteractionSettings {
  /**
   * Mouse buttons whose drag pans the viewport. `true` pans with any button;
   * an array lists the React Flow `MouseButton` indices (`0` left, `1`
   * middle, `2` right).
   */
  readonly panOnDrag: boolean | number[];
  /** Whether dragging on the pane draws a selection box. */
  readonly selectionOnDrag: boolean;
}

/**
 * Translates an interaction mode into the React Flow drag props.
 *
 * - `"select"`: the left button belongs to the selection surface, so a left
 *   drag on the pane draws a selection box and panning moves to the middle and
 *   right buttons.
 * - `"pan"`: any drag pans the viewport and a drag never selects.
 *
 * Pure mapping: no React, no store access, no side effect. The canvas applies
 * it on `<ReactFlow>`; the host passes the mode it reads from the UI store.
 */
export function canvasInteractionSettings(mode: CanvasInteractionMode): CanvasInteractionSettings {
  switch (mode) {
    case "pan":
      return { panOnDrag: true, selectionOnDrag: false };
    case "select":
      return { panOnDrag: [1, 2], selectionOnDrag: true };
  }
}
