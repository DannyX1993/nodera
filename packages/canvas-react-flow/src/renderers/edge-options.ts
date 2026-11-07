import { MarkerType } from "@xyflow/react";

import type { EdgeLineStyle, EdgeAnimation } from "@nodera/edge-registry";

/** Minimal style shape for BaseEdge rendering. */
export interface EdgeOptions {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  animated?: boolean;
  markerStart?: string;
  markerEnd?: string;
}

/* ------------------------------------------------------------------ */
/*  defaultEdgeOptionsFromVisual                                       */
/* ------------------------------------------------------------------ */

/**
 * Convert an {@link EdgeVisual} value from the edge registry into
 * React Flow {@link EdgeOptions} suitable for a {@link BaseEdge}.
 *
 * Translations:
 *   - `lineStyle` → `strokeDasharray` (solid = none, dashed = "6 6", dotted = "2 4")
 *   - `color`     → `stroke`
 *   - `animation` (flow/dash) → `animated`
 *   - `arrowStart`  → `markerStart` (marker-end arrow id)
 *   - `arrowEnd`    → `markerEnd`   (marker-end arrow id)
 */
export function defaultEdgeOptionsFromVisual(visual?: {
  lineStyle?: EdgeLineStyle;
  color?: string;
  animation?: EdgeAnimation;
  arrowStart?: boolean;
  arrowEnd?: boolean;
}): EdgeOptions | undefined {
  if (!visual) {
    return undefined;
  }

  const result: Partial<EdgeOptions> = {};

  // lineStyle → strokeDasharray
  if (visual.lineStyle === "dashed") {
    result.strokeDasharray = "6 6";
  } else if (visual.lineStyle === "dotted") {
    result.strokeDasharray = "2 4";
  }
  // solid → leave strokeDasharray absent

  // color → stroke
  if (visual.color) {
    result.stroke = visual.color;
  }

  // animation → animated
  if (visual.animation === "flow" || visual.animation === "dash") {
    result.animated = true;
  }

  // arrows → markerStart / markerEnd
  if (visual.arrowStart) {
    result.markerStart = MarkerType.ArrowClosed;
  }
  if (visual.arrowEnd) {
    result.markerEnd = MarkerType.ArrowClosed;
  }

  // Return undefined-shallow object only when at least one field is set.
  const keys = Object.keys(result);
  if (keys.length === 0) {
    return undefined;
  }

  return result as EdgeOptions;
}