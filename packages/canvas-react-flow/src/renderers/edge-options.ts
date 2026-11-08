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
 *   - `metadata.style.strokeWidth` → `strokeWidth`
 *   - `metadata.style.dashArray`   → `strokeDasharray` (`string` kept, `number[]` joined)
 *
 * The style hints are the renderer-only half of an authored edge style: the
 * domain stores every key it does not declare under `visual.metadata.style`, so
 * a documented `style: { strokeWidth: 2 }` becomes an edge option here instead
 * of being dropped. Hint keys are read one by one and only when their value has
 * the right type — an unknown key or a wrong-typed value is ignored, never
 * coerced, so stale or hostile document data can only make a hint disappear.
 */
export function defaultEdgeOptionsFromVisual(visual?: {
  lineStyle?: EdgeLineStyle;
  color?: string;
  animation?: EdgeAnimation;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
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

  // Renderer-only style hints → the same style fields.
  applyStyleHints(result, visual.metadata);

  // Return undefined-shallow object only when at least one field is set.
  const keys = Object.keys(result);
  if (keys.length === 0) {
    return undefined;
  }

  return result as EdgeOptions;
}

/** Whether a value is a plain record, the only shape `style` may have. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a value is an array of finite numbers, the second form of `dashArray`. */
function isNumberArray(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => typeof entry === "number" && Number.isFinite(entry))
  );
}

/** A `dashArray` hint as a CSS `stroke-dasharray` value. */
function dashArrayHint(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.length > 0 ? value : undefined;
  }
  if (isNumberArray(value)) {
    return value.join(" ");
  }
  return undefined;
}

/**
 * The renderer-only style hints of an edge definition, already validated.
 *
 * The keys keep the authored vocabulary (`dashArray`, not `strokeDasharray`) so
 * a renderer receives the value the host declared; it maps it to whichever
 * field it draws with.
 */
export interface EdgeStyleHints {
  readonly strokeWidth?: number;
  readonly dashArray?: string;
}

/**
 * Validates the honoured keys of one `metadata.style` record.
 *
 * Only `strokeWidth` (number) and `dashArray` (string or number[]) survive: an
 * unknown key or a wrong-typed value is dropped, never coerced, so stale or
 * hostile document data can only make a hint disappear.
 */
export function edgeStyleHintsFromStyle(style: unknown): EdgeStyleHints | undefined {
  if (!isRecord(style)) {
    return undefined;
  }

  const strokeWidth = style["strokeWidth"];
  const hints: {
    strokeWidth?: number;
    dashArray?: string;
  } = {};
  if (typeof strokeWidth === "number" && Number.isFinite(strokeWidth)) {
    hints.strokeWidth = strokeWidth;
  }
  const dashArray = dashArrayHint(style["dashArray"]);
  if (dashArray !== undefined) {
    hints.dashArray = dashArray;
  }

  return Object.keys(hints).length > 0 ? hints : undefined;
}

/** The renderer-only style hints an edge definition declares, if any. */
export function edgeStyleHints(visual?: {
  metadata?: Readonly<Record<string, unknown>>;
}): EdgeStyleHints | undefined {
  return edgeStyleHintsFromStyle(visual?.metadata?.["style"]);
}

/**
 * The style hints a definition published on its mapped React Flow edge.
 *
 * `toReactFlowEdges` stores them under `data.styleHints`, so a renderer reads
 * the definition's own values instead of a flattened React Flow style object in
 * which a hint cannot be distinguished from `lineStyle`.
 */
export function edgeStyleHintsFromData(data: unknown): EdgeStyleHints | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  return edgeStyleHintsFromStyle(data["styleHints"]);
}

/**
 * Copies the honoured hints of `visual.metadata.style` into `result`.
 *
 * An absent, malformed or unfamiliar hint contributes nothing: the function
 * never throws and never coerces.
 */
function applyStyleHints(
  result: Partial<EdgeOptions>,
  metadata: Readonly<Record<string, unknown>> | undefined,
): void {
  const hints = edgeStyleHintsFromStyle(metadata?.["style"]);
  if (hints === undefined) {
    return;
  }

  if (hints.strokeWidth !== undefined) {
    result.strokeWidth = hints.strokeWidth;
  }
  if (hints.dashArray !== undefined) {
    result.strokeDasharray = hints.dashArray;
  }
}