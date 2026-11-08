import { describe, expect, it } from "vitest";

import { canvasInteractionSettings, type CanvasInteractionMode } from "./interaction-mode.js";

/**
 * Mapping of the editor interaction mode (S5 "Modo de interacción") onto
 * React Flow's pan/selection drag props.
 *
 * These assertions are the observable contract of the mapping itself:
 * React Flow does not expose its resolved `panOnDrag`/`selectionOnDrag`
 * props to jsdom, so `graph-canvas.test.tsx` only proves that the canvas
 * accepts both modes and keeps rendering.
 */
describe("canvasInteractionSettings", () => {
  it("maps select mode so left drag draws a selection box and middle/right pan", () => {
    expect(canvasInteractionSettings("select")).toEqual({
      panOnDrag: [1, 2],
      selectionOnDrag: true,
    });
  });

  it("maps pan mode so any drag pans and drag never selects", () => {
    expect(canvasInteractionSettings("pan")).toEqual({
      panOnDrag: true,
      selectionOnDrag: false,
    });
  });

  it("distinguishes the two modes by who owns the left drag", () => {
    expect(canvasInteractionSettings("select").selectionOnDrag).toBe(true);
    expect(canvasInteractionSettings("pan").selectionOnDrag).toBe(false);
    expect(canvasInteractionSettings("select").panOnDrag).not.toBe(true);
    expect(canvasInteractionSettings("pan").panOnDrag).toBe(true);
  });
});
