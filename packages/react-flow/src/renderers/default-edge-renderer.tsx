import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import type { FC, CSSProperties, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { memo, useCallback, useRef, useState } from "react";

import type { EdgeGeometry } from "@nodera/edge-registry";
import { useTranslate } from "@nodera/ui-react";

import { edgeStyleHintsFromData } from "./edge-options.js";
import { useNoderaEditor, useNoderaWaypointEditing } from "../canvas/editor-context.js";
import { useEditorGraph } from "../canvas/use-editor-graph.js";
import { updateEdgeWaypoints } from "@nodera/application";

/* ------------------------------------------------------------------ */
/*  Token-driven edge styles (D2/D8)                                   */
/* ------------------------------------------------------------------ */

/**
 * Edge path style.
 *
 * CSS custom properties with literal fallbacks: the theme engine writes
 * `--ndr-edge-*` on a wrapper element and an unthemed host still renders a
 * visible edge. Selection uses its own tokens so it is expressed by more
 * than one visual channel (class + stroke colour + width).
 */
const EDGE_STYLE = {
  stroke: "var(--ndr-edge-stroke-color, #7c8896)",
  strokeWidth: "var(--ndr-edge-stroke-width, 1.5)",
} as const;

const SELECTED_EDGE_STYLE = {
  stroke: "var(--ndr-edge-stroke-color-selected, #2563eb)",
  strokeWidth: "var(--ndr-edge-stroke-width-selected, 2.5)",
} as const;

/**
 * Style the renderer draws an unselected edge with.
 *
 * The token values are the fallback of every field, so an edge that declares no
 * renderer-only hint is drawn exactly as before. The definition's own
 * `metadata.style.strokeWidth` / `dashArray` (published by `toReactFlowEdges` as
 * `data.styleHints`) replace the width and the dash pattern when present; the
 * stroke colour stays token-driven so the theme keeps control of the palette.
 */
function edgeStyle(data: unknown): CSSProperties {
  const hints = edgeStyleHintsFromData(data);
  return {
    stroke: EDGE_STYLE.stroke,
    strokeWidth: hints?.strokeWidth ?? EDGE_STYLE.strokeWidth,
    ...(hints?.dashArray === undefined ? {} : { strokeDasharray: hints.dashArray }),
  };
}

/* ------------------------------------------------------------------ */
/*  Declared geometry (S9)                                             */
/* ------------------------------------------------------------------ */

/**
 * The geometry this edge draws, read from `data.geometry`.
 *
 * `toReactFlowEdges` writes the definition's declared geometry there, so the
 * shape follows the definition instead of always being a bezier. Edge data is
 * document data: only the four declared values are accepted, and an unfamiliar
 * one (a stale or hostile key) falls back to the bezier default rather than
 * being coerced.
 */
function geometryFromData(data: unknown): EdgeGeometry {
  if (typeof data !== "object" || data === null) {
    return "bezier";
  }
  const geometry = (data as { geometry?: unknown }).geometry;
  if (
    geometry === "straight" ||
    geometry === "bezier" ||
    geometry === "step" ||
    geometry === "smooth"
  ) {
    return geometry;
  }
  return "bezier";
}

/** The argument object every React Flow path helper in this file takes. */
interface PathParams {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly sourcePosition: Position;
  readonly targetPosition: Position;
}

/**
 * Draw one pair of points with the helper that implements the declared
 * geometry.
 *
 * React Flow exports no `getStepPath`: its own `StepEdge` is
 * `getSmoothStepPath` with `borderRadius: 0`, so the step shape is requested
 * from that same helper. `getStraightPath` takes no handle positions, which is
 * why each helper gets its own argument object.
 *
 * @returns `[path, labelX, labelY, offsetX, offsetY]`, like every helper here.
 */
function geometryPath(
  geometry: EdgeGeometry,
  params: PathParams,
): [string, number, number, number, number] {
  switch (geometry) {
    case "straight":
      return getStraightPath({
        sourceX: params.sourceX,
        sourceY: params.sourceY,
        targetX: params.targetX,
        targetY: params.targetY,
      });
    case "step":
      return getSmoothStepPath({ ...params, borderRadius: 0 });
    case "smooth":
      return getSmoothStepPath(params);
    case "bezier":
    default:
      return getBezierPath(params);
  }
}

/** The absolute `M x,y` every path helper opens its path with. */
const LEADING_MOVE =
  /^M\s*[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?[,\s]+[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?\s*/;

/**
 * Drop the `M x,y` a helper opens with, so the rest of its commands can be
 * appended to a path that already starts at that same point. The helpers emit
 * absolute commands, so dropping the move leaves the segment's own geometry.
 */
function withoutLeadingMove(path: string): string {
  return path.replace(LEADING_MOVE, "");
}

/**
 * The direction a segment leaves (or reaches) an intermediate point, derived
 * from the delta between the two points: the larger component wins, which is
 * the axis the segment visibly runs along.
 */
function directionFromDelta(dx: number, dy: number): Position {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? Position.Right : Position.Left;
  }
  return dy >= 0 ? Position.Bottom : Position.Top;
}

/* ------------------------------------------------------------------ */
/*  Path builder: with or without waypoints                            */
/* ------------------------------------------------------------------ */

/**
 * Compute the SVG path of one edge, honouring its declared geometry.
 *
 * Without waypoints each geometry is a single helper call: straight, bezier
 * (the default), step or smooth. With waypoints the path is a chain
 * source → w1 → … → wn → target, drawn per segment:
 *
 * - straight: one line per pair of points.
 * - step / smooth: one orthogonal (stepped) segment per pair, each routed with
 *   the direction its own delta gives it.
 * - bezier: the same connected cubic chain this renderer has always drawn, so
 *   a waypoint-bent bezier keeps its exact shape.
 *
 * @param sourceX     — source handle X in flow coords
 * @param sourceY     — source handle Y in flow coords
 * @param targetX     — target handle X in flow coords
 * @param targetY     — target handle Y in flow coords
 * @param sourcePosition — source handle side
 * @param targetPosition — target handle side
 * @param waypoints   — ordered intermediate points in flow coords
 * @param geometry    — declared geometry; bezier when the definition declares none
 * @returns `[path, labelX, labelY]` in the same shape as `getBezierPath`
 */
export function buildEdgePathThroughWaypoints(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position,
  waypoints: { x: number; y: number }[],
  geometry: EdgeGeometry = "bezier",
): [string, number, number, number, number] {
  const params: PathParams = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  };

  if (waypoints.length === 0) {
    return geometryPath(geometry, params);
  }

  const lastWaypoint = waypoints[waypoints.length - 1]!;
  // Label position: the last waypoint.
  const labelX = lastWaypoint.x;
  const labelY = lastWaypoint.y;

  if (geometry !== "bezier") {
    // One helper call per consecutive pair, concatenated: the first segment
    // keeps its leading `M`, every later one is appended without it.
    const points = [
      { x: sourceX, y: sourceY },
      ...waypoints,
      { x: targetX, y: targetY },
    ];
    let chained = "";
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i]!;
      const to = points[i + 1]!;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      // The handle sides decide the ends; every intermediate point takes the
      // direction of the segment it belongs to.
      const fromPosition = i === 0 ? sourcePosition : directionFromDelta(dx, dy);
      const toPosition =
        i === points.length - 2 ? targetPosition : directionFromDelta(dx, dy);
      const [segment] = geometryPath(geometry, {
        sourceX: from.x,
        sourceY: from.y,
        targetX: to.x,
        targetY: to.y,
        sourcePosition: fromPosition,
        targetPosition: toPosition,
      });
      chained = i === 0 ? segment : `${chained} ${withoutLeadingMove(segment)}`;
    }
    return [chained, labelX, labelY, 0, 0];
  }

  const cubic = 0.5519; // Bezier control-point ratio (getBezierPath constant).

  // Resolve handle positions for a segment: the vector from the *other*
  // endpoint towards the current one.  This keeps the curvature consistent
  // with `getBezierPath`'s direction-aware logic.
  const controlVectorFor = (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    fromDir: Position,
    toDir: Position,
  ): { cx1: number; cy1: number; cx2: number; cy2: number } => {
    const dx = toX - fromX;
    const dy = toY - fromY;

    let cx1: number, cy1: number, cx2: number, cy2: number;

    switch (fromDir) {
      case Position.Right:  cx1 = fromX + Math.abs(dx) * cubic; cy1 = fromY; break;
      case Position.Left:   cx1 = fromX - Math.abs(dx) * cubic; cy1 = fromY; break;
      case Position.Top:    cx1 = fromX; cy1 = fromY - Math.abs(dy) * cubic; break;
      case Position.Bottom: cx1 = fromX; cy1 = fromY + Math.abs(dy) * cubic; break;
      default: cx1 = fromX; cy1 = fromY;
    }

    switch (toDir) {
      case Position.Right:  cx2 = toX - Math.abs(dx) * cubic; cy2 = toY; break;
      case Position.Left:   cx2 = toX + Math.abs(dx) * cubic; cy2 = toY; break;
      case Position.Top:    cx2 = toX; cy2 = toY + Math.abs(dy) * cubic; break;
      case Position.Bottom: cx2 = toX; cy2 = toY - Math.abs(dy) * cubic; break;
      default: cx2 = toX; cy2 = toY;
    }

    return { cx1, cy1, cx2, cy2 };
  };

  // Determine the primary direction for the first and last segments.
  const firstFromDir = sourcePosition;
  const lastToDir = targetPosition;

  let path = "";

  // --- Segment: source → first waypoint ---
  {
    const wp = waypoints[0]!;
    const { cx1, cy1, cx2, cy2 } = controlVectorFor(sourceX, sourceY, wp.x, wp.y, firstFromDir, Position.Right);
    path += `M ${sourceX} ${sourceY} C ${cx1} ${cy1} ${cx2} ${cy2} ${wp.x} ${wp.y} `;
  }

  // --- Segments: waypoint → waypoint (interior) ---
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const { cx1, cy1, cx2, cy2 } = controlVectorFor(a.x, a.y, b.x, b.y, Position.Right, Position.Right);
    path += `C ${cx1} ${cy1} ${cx2} ${cy2} ${b.x} ${b.y} `;
  }

  // --- Segment: last waypoint → target ---
  {
    const wp = waypoints[waypoints.length - 1]!;
    const { cx1, cy1, cx2, cy2 } = controlVectorFor(wp.x, wp.y, targetX, targetY, Position.Right, lastToDir);
    path += `C ${cx1} ${cy1} ${cx2} ${cy2} ${targetX} ${targetY}`;
  }

  return [path, labelX, labelY, 0, 0];
}

/* ------------------------------------------------------------------ */
/*  Waypoint handle style                                              */
/* ------------------------------------------------------------------ */

/**
 * Style of a waypoint handle: small circle that is visible on the selected
 * edge and hoverable / focusable (AGENTS.md §15).
 */
const WAYPOINT_HANDLE_STYLE: CSSProperties = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  background: "var(--ndr-edge-stroke-color-selected, #2563eb)",
  border: "2px solid #fff",
  cursor: "grab",
  pointerEvents: "all",
  zIndex: 10,
  transition: "transform 0.1s ease",
};

const WAYPOINT_HANDLE_ACTIVE_STYLE: CSSProperties = {
  ...WAYPOINT_HANDLE_STYLE,
  cursor: "grabbing",
  transform: "scale(1.3)",
};

/* ------------------------------------------------------------------ */
/*  DefaultEdgeRenderer                                                */
/* ------------------------------------------------------------------ */

/**
 * The default custom edge for Nodera. React Flow calls it with
 * {@link EdgeProps}; it draws the edge's declared geometry itself (straight,
 * bezier, step or smooth, from `data.geometry`) and renders a {@link BaseEdge}
 * plus an optional label layer.
 *
 * When the mapped edge carries `data.waypoints` the path is routed through
 * them (S2, S7), keeping the declared geometry per segment.  When selected the
 * renderer also paints draggable waypoint handles as plain divs inside a
 * wrapper overlay.
 *
 * Dragging a handle commits once on drag end through
 * {@link updateEdgeWaypoints}.  Double-clicking a handle removes it.
 * Double-clicking the edge path creates a new waypoint at the grab point.
 *
 * Wrapped in `React.memo` (S7/D10). React Flow hands an edge the geometry and
 * flags of that one edge, so a canvas re-render that changes none of them — any
 * other node moving, panning, another element being selected — no longer
 * re-renders this path. The renderer still re-renders on its own when the
 * document changes, through the `useEditorGraph` subscription below.
 */
const DefaultEdgeRendererImpl: FC<EdgeProps> = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Bottom,
  targetPosition = Position.Top,
  data,
  label,
  selected,
  markerStart,
  markerEnd,
  id,
  style: mappedStyle,
}) => {
  // --- Context: read editor, waypoints and gesture gate ---
  const editor = useNoderaEditor();
  const t = useTranslate();
  const waypointEditingEnabled = useNoderaWaypointEditing();

  // Read waypoints from edge data; the mapper puts them here from the domain.
  const edgeWaypoints = (data as { waypoints?: { x: number; y: number }[] } | undefined)
    ?.waypoints;

  // Stable ref so gesture handlers always see the committed waypoints.
  const waypointsRef = useRef(edgeWaypoints);
  waypointsRef.current = edgeWaypoints;

  // Re-render when the document changes so the handle list stays in sync.
  // Only call when editor is set so unit tests that render the component
  // without a provider do not crash.
  if (editor) {
    useEditorGraph(editor);
  }

  /* ---------------------------------------------------------------- */
  /*  Waypoint gestures                                                */
  /*                                                                  */
  /*  React Flow paints a ~20px transparent interaction band ABOVE the  */
  /*  visible edge path, so handlers must live on this component's     */
  /*  wrapper <g>, never on the path: an event on the band is a        */
  /*  sibling of the path and would never reach it. Handles (rendered  */
  /*  through <foreignObject>) bubble into the same wrapper. Pointer   */
  /*  capture keeps the gesture alive off the edge band.               */
  /*                                                                  */
  /*  When `waypointEditingEnabled` is false (the default), all       */
  /*  gesture handlers no-op and no waypoint handles are rendered —  */
  /*  the edge still routes through existing waypoints.              */
  /* ---------------------------------------------------------------- */

  type Gesture =
    | {
        kind: "create";
        origin: { x: number; y: number };
        current: { x: number; y: number };
        moved: boolean;
      }
    | {
        kind: "move";
        index: number;
        origin: { x: number; y: number };
        current: { x: number; y: number };
        moved: boolean;
      }
    | null;

  const [gesture, setGesture] = useState<Gesture>(null);
  const gestureRef = useRef<Gesture>(null);
  gestureRef.current = gesture;

  /** Pointer position in flow coordinates, undoing the viewport pan/zoom. */
  const flowCoordsFromEvent = useCallback((event: PointerEvent | MouseEvent) => {
    const pane = (event.target as Element | null)?.closest?.(".react-flow__pane");
    if (!pane) {
      return { x: event.clientX, y: event.clientY };
    }
    const rect = pane.getBoundingClientRect();
    let x = event.clientX - rect.left;
    let y = event.clientY - rect.top;
    const viewport = pane.querySelector(".react-flow__viewport");
    const transform = viewport ? window.getComputedStyle(viewport).transform : "none";
    if (transform !== "none" && transform !== "" && typeof DOMMatrixReadOnly === "function") {
      const matrix = new DOMMatrixReadOnly(transform);
      x = (x - matrix.e) / (matrix.a || 1);
      y = (y - matrix.f) / (matrix.d || 1);
    }
    return { x, y };
  }, []);

  /** Commits one waypoint list as ONE history unit (empty clears). */
  const commitWaypoints = useCallback(
    (points: readonly { x: number; y: number }[]) => {
      if (!editor || !id) return;
      updateEdgeWaypoints(editor, {
        edgeId: id,
        waypoints: points.length === 0 ? undefined : points,
      });
    },
    [editor, id],
  );

  const onPathPointerDown = useCallback(
    (event: ReactPointerEvent<SVGGElement>) => {
      if (!waypointEditingEnabled) return;
      if (gestureRef.current !== null) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const coords = flowCoordsFromEvent(event.nativeEvent);
      setGesture({ kind: "create", origin: coords, current: coords, moved: false });
    },
    [flowCoordsFromEvent, waypointEditingEnabled],
  );

  const onPathPointerMove = useCallback(
    (event: ReactPointerEvent<SVGGElement>) => {
      if (!waypointEditingEnabled) return;
      const current = gestureRef.current;
      if (current === null) return;
      const coords = flowCoordsFromEvent(event.nativeEvent);
      const moved =
        current.moved ||
        Math.hypot(coords.x - current.origin.x, coords.y - current.origin.y) >
          (current.kind === "create" ? 5 : 2);
      setGesture({ ...current, current: coords, moved });
    },
    [flowCoordsFromEvent, waypointEditingEnabled],
  );

  const onPathPointerUp = useCallback(
    (event: ReactPointerEvent<SVGGElement>) => {
      if (!waypointEditingEnabled) {
        setGesture(null);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        return;
      }
      const current = gestureRef.current;
      setGesture(null);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      // A plain click (no drag) stays a selection for React Flow.
      if (current === null || !current.moved) return;
      if (current.kind === "create") {
        commitWaypoints([...(waypointsRef.current ?? []), current.current]);
        return;
      }
      commitWaypoints(
        (waypointsRef.current ?? []).map((wp, i) =>
          i === current.index ? current.current : wp,
        ),
      );
    },
    [commitWaypoints, waypointEditingEnabled],
  );

  const onPathDoubleClick = useCallback(
    (event: ReactMouseEvent<SVGGElement>) => {
      // Keep React Flow's pane double-click zoom out of the edge gesture.
      event.stopPropagation();
      if (!waypointEditingEnabled) return;
      if (!editor || !id) return;
      const coords = flowCoordsFromEvent(event.nativeEvent);
      commitWaypoints([...(waypointsRef.current ?? []), coords]);
    },
    [editor, id, flowCoordsFromEvent, commitWaypoints, waypointEditingEnabled],
  );

  const onPointerDownHandle = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, index: number) => {
      if (!waypointEditingEnabled) return;
      // A handle drag is not a path drag.
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const wp = waypointsRef.current?.[index];
      if (wp === undefined) return;
      setGesture({ kind: "move", index, origin: wp, current: wp, moved: false });
      event.currentTarget.focus();
    },
    [waypointEditingEnabled],
  );

  const onDoubleClickHandle = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, index: number) => {
      if (!waypointEditingEnabled) return;
      event.stopPropagation();
      const current = waypointsRef.current;
      if (current === undefined) return;
      commitWaypoints(current.filter((_, i) => i !== index));
    },
    [commitWaypoints, waypointEditingEnabled],
  );

  const onKeyDownHandle = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>, index: number) => {
      if (!waypointEditingEnabled) return;
      const current = waypointsRef.current;
      if (current === undefined) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        commitWaypoints(current.filter((_, i) => i !== index));
        return;
      }
      const steps: Readonly<Record<string, { dx?: number; dy?: number }>> = {
        ArrowUp: { dy: -1 },
        ArrowDown: { dy: 1 },
        ArrowLeft: { dx: -1 },
        ArrowRight: { dx: 1 },
      };
      const step = steps[event.key];
      if (step === undefined) return;
      event.preventDefault();
      const scale = event.shiftKey ? 10 : 1;
      commitWaypoints(
        current.map((wp, i) =>
          i === index
            ? { x: wp.x + (step.dx ?? 0) * scale, y: wp.y + (step.dy ?? 0) * scale }
            : wp,
        ),
      );
    },
    [commitWaypoints, waypointEditingEnabled],
  );

  // --- Path: the declared geometry, through the waypoints when there are any ---
  const baseWaypoints = edgeWaypoints ?? [];
  const liveWaypoints =
    gesture === null
      ? baseWaypoints
      : gesture.kind === "create"
        ? gesture.moved
          ? [...baseWaypoints, gesture.current]
          : baseWaypoints
        : baseWaypoints.map((wp, i) => (i === gesture.index ? gesture.current : wp));

  // One call for both cases: the builder delegates a waypoint-free edge to the
  // helper of its declared geometry, which is the bezier it always drew when
  // the definition declares none.
  const [path, labelX, labelY] = buildEdgePathThroughWaypoints(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    liveWaypoints,
    geometryFromData(data),
  );

  const labelFromData = (data as { label?: unknown } | undefined)?.label;
  const text =
    label ??
    (typeof labelFromData === "string" && labelFromData.length > 0 ? labelFromData : undefined);

  return (
    <>
      {/* Gesture wrapper: reachable by the pointer whatever path layer RF
          paints. The handles live inside it so their events bubble here. */}
      <g
        onPointerDown={onPathPointerDown}
        onPointerMove={onPathPointerMove}
        onPointerUp={onPathPointerUp}
        onDoubleClick={onPathDoubleClick}
      >
        <BaseEdge
          path={path}
          style={
            selected
              ? SELECTED_EDGE_STYLE
              : { ...edgeStyle(data), ...mappedStyle }
          }
          className={selected ? "nodera-edge-selected" : undefined}
          // The resolved marker references React Flow derived from the edge
          // object: without forwarding them the arrows are set but never paint.
          {...(markerStart === undefined ? {} : { markerStart })}
          {...(markerEnd === undefined ? {} : { markerEnd })}
        />
        {/* Ghost waypoint while a create drag is active: visible feedback
            before the edge is even selected (selection lands on the click). */}
        {gesture?.kind === "create" && gesture.moved && (
          <circle
            data-nodera-waypoint-ghost=""
            cx={gesture.current.x}
            cy={gesture.current.y}
            r={5}
            style={{
              fill: "var(--ndr-edge-stroke-color-selected, #2563eb)",
              stroke: "#fff",
              strokeWidth: 2,
            }}
          />
        )}
        {/* Waypoint handles: only when enabled, selected, and there is
            something to grab. Rendered as HTML inside <foreignObject>: a
            plain div inside an SVG <g> is never painted by the browser. */}
        {waypointEditingEnabled &&
          selected &&
          liveWaypoints.map((wp, index) => (
            <foreignObject
              key={`${id}-wp-${index}`}
              x={wp.x - 8}
              y={wp.y - 8}
              width={16}
              height={16}
              style={{ overflow: "visible" }}
            >
              <div
                data-nodera-waypoint-index={index}
                data-nodera-waypoint-id={`${id}-wp-${index}`}
                role="button"
                aria-label={t("canvas.waypoint", { index: index + 1 })}
                tabIndex={0}
                style={{
                  width: "16px",
                  height: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "transparent",
                  cursor: "grab",
                }}
                onPointerDown={(event) => onPointerDownHandle(event, index)}
                onDoubleClick={(event) => onDoubleClickHandle(event, index)}
                onKeyDown={(event) => onKeyDownHandle(event, index)}
              >
                <span
                  style={
                    gesture?.kind === "move" && gesture.index === index
                      ? WAYPOINT_HANDLE_ACTIVE_STYLE
                      : WAYPOINT_HANDLE_STYLE
                  }
                />
              </div>
            </foreignObject>
          ))}
      </g>
      {text && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "none",
              fontSize: "var(--ndr-edge-label-font-size, 11px)",
              color: "var(--ndr-edge-label-color, #334155)",
              background: "var(--ndr-edge-label-background, #ffffff)",
              fontFamily: "var(--nodera-font-family, sans-serif)",
            }}
            className="nodera-edge-label"
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Re-export for consumers                                            */
/* ------------------------------------------------------------------ */

/**
 * The default Nodera edge, memoized on React Flow's edge props.
 *
 * See {@link DefaultEdgeRendererImpl} for the renderer itself; the identity is
 * stable so a parent re-render with unchanged props reuses the previous render.
 */
export const DefaultEdgeRenderer: FC<EdgeProps> = memo(DefaultEdgeRendererImpl);

export { defaultEdgeOptionsFromVisual, type EdgeOptions } from "./edge-options.js";