import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import type { FC, CSSProperties } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import { edgeStyleHintsFromData } from "./edge-options.js";
import { useNoderaEditor } from "../canvas/editor-context.js";
import { useEditorGraph } from "../canvas/use-editor-graph.js";
import { selectEdge, updateEdgeWaypoints } from "@nodera/application";

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
/*  Path builder: with or without waypoints                            */
/* ------------------------------------------------------------------ */

/**
 * Compute an SVG path that routes through the given waypoints.
 *
 * Uses connected cubic bezier segments: source → w1 → w2 → … → target, with
 * the same `getBezierPath` control-point ratio (0.5519) applied per-segment.
 *
 * @param sourceX     — source handle X in flow coords
 * @param sourceY     — source handle Y in flow coords
 * @param targetX     — target handle X in flow coords
 * @param targetY     — target handle Y in flow coords
 * @param sourcePosition — source handle side
 * @param targetPosition — target handle side
 * @param waypoints   — ordered intermediate points in flow coords
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
): [string, number, number, number, number] {
  if (waypoints.length === 0) {
    // Fallback: plain bezier (should not happen since the caller checks length).
    return getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
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

  // Helper: get direction for an intermediate point (treat both as Right).
  const midDir = (dir: Position): Position => {
    if (dir === Position.Left || dir === Position.Right) return Position.Right;
    return Position.Bottom;
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

  // Label position: last waypoint, or the middle of the bezier path.
  let labelX: number, labelY: number;
  if (waypoints.length > 0) {
    const lastWp = waypoints[waypoints.length - 1]!;
    labelX = lastWp.x;
    labelY = lastWp.y;
  } else {
    // Fallback — should not reach here since this function only called with waypoints.
    [, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
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
 * {@link EdgeProps}; it computes the bezier path itself and renders a
 * {@link BaseEdge} plus an optional label layer.
 *
 * When the mapped edge carries `data.waypoints` the path is routed through
 * them (S2, S7).  When selected the renderer also paints draggable waypoint
 * handles as plain divs inside a wrapper overlay.
 *
 * Dragging a handle commits once on drag end through
 * {@link updateEdgeWaypoints}.  Double-clicking a handle removes it.
 * Double-clicking the edge path creates a new waypoint at the grab point.
 */
export const DefaultEdgeRenderer: FC<EdgeProps> = ({
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
}) => {
  // --- Context: read editor and waypoints from mapped data ---
  const editor = useNoderaEditor();

  // Read waypoints from edge data; the mapper puts them here from the domain.
  const edgeWaypoints = (data as { waypoints?: { x: number; y: number }[] } | undefined)
    ?.waypoints;

  // The mapper carries `true` when the edge has waypoints in the domain;
  // React Flow re-derives edges, so we track changes through a ref.
  const waypointsRef = useRef(edgeWaypoints);
  waypointsRef.current = edgeWaypoints;

  // Local state during drag: the transient position of the handle being
  // moved (or the waypoint being created).
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [addingWaypoint, setAddingWaypoint] = useState(false);

  // Stable refs for drag logic (avoid stale closures on pointer events).
  const hasWaypointsRef = useRef(Boolean(waypointsRef.current));
  hasWaypointsRef.current = Boolean(waypointsRef.current);

  const addingRef = useRef(addingWaypoint);
  addingRef.current = addingWaypoint;

  const draggingRef = useRef(false);
  draggingRef.current = dragPosition !== null;

  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  // --- Editor graph hook: re-render when the document changes ---
  // We read edge updates here so the handle list stays in sync with the
  // document without needing an editor prop.  Only call when editor is set
  // so unit tests that render the component without a provider do not crash.
  if (editor) {
    useEditorGraph(editor);
  }

  // --- Helper: pointer → flow coordinates ---
  const flowCoordsFromEvent = useCallback((event: PointerEvent) => {
    // Use the React Flow canvas element's `screenToFlowPosition` if available.
    const canvas = (event.target as SVGElement)?.closest(".react-flow__pane");
    if (canvas && "getBoundingClientRect" in canvas) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left + canvas.scrollLeft,
        y: event.clientY - rect.top + canvas.scrollTop,
      };
    }
    // Fallback: approximate flow coordinates from the event.
    return { x: event.clientX, y: event.clientY };
  }, []);

  // --- Helper: commit the current waypoints (drag end) ---
  const commitWaypoints = useCallback(() => {
    if (!editor || !id) return;

    const current = waypointsRef.current;
    if (!current) return;

    // Apply the current drag position to the waypoints array.
    const updated = current.map((wp, i) => {
      if (i === current.length - 1 && dragPosition) {
        return dragPosition;
      }
      return wp;
    });

    // Remove the drag position (local state cleanup).
    setDragPosition(null);
    setAddingWaypoint(false);
    addingRef.current = false;

    // Commit: one history unit via the application use case.
    updateEdgeWaypoints(editor, { edgeId: id, waypoints: updated });
  }, [editor, id, dragPosition]);

  // --- Waypoint drag handlers ---

  const onPointerDownHandle = useCallback(
    (event: React.PointerEvent, index: number) => {
      if (!editor || !id) return;

      const current = waypointsRef.current;
      if (!current || current.length === 0) return;

      // Capture pointer so we continue receiving move/up even outside the handle.
      (event.target as HTMLElement).setPointerCapture(event.pointerId);

      // Set initial position as the new drag target.
      const wp = current[index]!;
      setDragPosition(wp);

      // Prevent the pointer from triggering the edge's path handler.
      event.stopPropagation();

      // Handle focus for keyboard accessibility.
      (event.target as HTMLElement).focus();
    },
    [editor, id],
  );

  const onPointerMoveHandle = useCallback(
    (event: React.PointerEvent) => {
      if (dragPosition === null || !editor) return;

      const coords = flowCoordsFromEvent(event.nativeEvent);
      setDragPosition({ x: coords.x, y: coords.y });

      // Throttle re-renders with requestAnimationFrame.
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
      });
    },
    [dragPosition, editor, flowCoordsFromEvent],
  );

  const onPointerUpHandle = useCallback(() => {
    if (dragPosition === null) return;
    commitWaypoints();
  }, [dragPosition, commitWaypoints]);

  const onDoubleClickHandle = useCallback(
    (event: React.MouseEvent) => {
      if (!editor || !id) return;

      const current = waypointsRef.current;
      if (!current || current.length === 0) return;

      // Remove the last waypoint on double-click.
      const updated = current.slice(0, -1);
      updateEdgeWaypoints(editor, { edgeId: id, waypoints: updated });
    },
    [editor, id],
  );

  // --- Path computation ---
  let path: string;
  let labelX: number;
  let labelY: number;

  if (edgeWaypoints && edgeWaypoints.length > 0) {
    // Use waypoint-aware path.
    [path, labelX, labelY] = buildEdgePathThroughWaypoints(
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      edgeWaypoints,
    );
  } else {
    // No waypoints: use the classic bezier (byte-identical to pre-change).
    [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
  }

  const labelFromData = (data as { label?: unknown } | undefined)?.label;
  const text =
    label ??
    (typeof labelFromData === "string" && labelFromData.length > 0 ? labelFromData : undefined);

  // --- Pointer event for path-based waypoint creation ---
  const onPathPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!hasWaypointsRef.current && !addingRef.current) {
        // First pointer-down on the path: start tracking drag distance.
        const coords = flowCoordsFromEvent(event.nativeEvent);
        lastPointerRef.current = coords;
        return;
      }

      // If we already have waypoints, the path pointer is for dragging
      // an intermediate point: create a new waypoint.
      if (editor && id && lastPointerRef.current) {
        // Start a drag from this point.
        setDragPosition(lastPointerRef.current);
        setAddingWaypoint(true);
        addingRef.current = true;
      }
      lastPointerRef.current = null;
    },
    [editor, id, flowCoordsFromEvent],
  );

  const onPathPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (lastPointerRef.current === null) return;

      const coords = flowCoordsFromEvent(event.nativeEvent);
      const dx = coords.x - lastPointerRef.current.x;
      const dy = coords.y - lastPointerRef.current.y;

      if (addingRef.current && editor && id) {
        // Already in add mode: update the new waypoint position.
        setDragPosition({ x: coords.x, y: coords.y });

        // Throttle re-renders.
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
        });
      } else if (Math.sqrt(dx * dx + dy * dy) > 5 && !hasWaypointsRef.current) {
        // Dragged beyond 5px on a no-waypoint edge: create first waypoint.
        setDragPosition({ x: coords.x, y: coords.y });
        setAddingWaypoint(true);
        addingRef.current = true;
      }

      lastPointerRef.current = coords;
    },
    [editor, id, flowCoordsFromEvent],
  );

  const onPathPointerUp = useCallback(() => {
    if (addingRef.current) {
      // Commit the newly created waypoint.
      commitWaypoints();
      lastPointerRef.current = null;
    } else {
      // Simple click (no drag): select the edge.
      if (editor && id) {
        selectEdge(editor, { edgeId: id });
      }
      lastPointerRef.current = null;
    }
  }, [commitWaypoints, editor, id]);

  // --- Compute active waypoint position (either dragged WP or last one) ---
  const currentWaypoints = waypointsRef.current;
  const activeWaypointIndex = dragPosition !== null && currentWaypoints ? currentWaypoints.length - 1 : -1;

  return (
    <>
      <BaseEdge
        path={path}
        style={selected ? SELECTED_EDGE_STYLE : edgeStyle(data)}
        className={selected ? "nodera-edge-selected" : undefined}
        onPointerDown={onPathPointerDown}
        onPointerMove={onPathPointerMove}
        onPointerUp={onPathPointerUp}
        // The resolved marker references React Flow derived from the edge
        // object: without forwarding them the arrows are set but never paint.
        {...(markerStart === undefined ? {} : { markerStart })}
        {...(markerEnd === undefined ? {} : { markerEnd })}
      />
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
      {/* Waypoint handles: only visible when the edge is selected and has waypoints */}
      {/* Rendered as plain divs (not EdgeLabelRenderer) so unit tests without
          ReactFlowProvider do not crash.  Positioning is flow-coordinate based
          via the wrapper div. */}
      {selected && currentWaypoints && currentWaypoints.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {currentWaypoints.map((wp, index) => {
            const isActive = index === activeWaypointIndex;
            const isActiveDragging = draggingRef.current && index === activeWaypointIndex;

            return (
              <div
                key={`${id}-wp-${index}`}
                data-nodera-waypoint-index={index}
                data-nodera-waypoint-id={`${id}-wp-${index}`}
                role="button"
                aria-label={`Waypoint ${index + 1}: double-click to remove, drag to move, arrow keys to nudge`}
                tabIndex={0}
                style={{
                  position: "absolute",
                  left: `${wp.x}px`,
                  top: `${wp.y}px`,
                  transform: "translate(-50%, -50%)",
                  ...WAYPOINT_HANDLE_STYLE,
                  ...(isActiveDragging ? WAYPOINT_HANDLE_ACTIVE_STYLE : {}),
                }}
                onPointerDown={(e) => onPointerDownHandle(e, index)}
                onPointerMove={onPointerMoveHandle}
                onPointerUp={onPointerUpHandle}
                onDoubleClick={onDoubleClickHandle}
                // Keyboard: arrow keys nudge the waypoint.
                onKeyDown={(e) => {
                  if (!editor || !id) return;
                  const step = e.shiftKey ? 10 : 1;
                  if (!currentWaypoints) return;
                    let newWps: { x: number; y: number }[] | undefined = [...currentWaypoints];

                  if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "Delete" || e.key === "Backspace") {
                    e.preventDefault();
                  }

                  if (e.key === "Delete" || e.key === "Backspace") {
                    // Remove this waypoint.
                    newWps.splice(index, 1);
                    if (newWps.length === 0) newWps = undefined;
                    updateEdgeWaypoints(editor, { edgeId: id, waypoints: newWps });
                    return;
                  }

                  if (e.key === "Enter" || e.key === " ") {
                    // Keep the waypoint (no change needed, just release drag).
                    return;
                  }

                  if (e.key === "ArrowUp") {
                    const wp = newWps[index]!; newWps[index] = { ...wp, y: wp.y - step };
                  } else if (e.key === "ArrowDown") {
                    const wp2 = newWps[index]!; newWps[index] = { ...wp2, y: wp2.y + step };
                  } else if (e.key === "ArrowLeft") {
                    const wp3 = newWps[index]!; newWps[index] = { ...wp3, x: wp3.x - step };
                  } else if (e.key === "ArrowRight") {
                    const wp4 = newWps[index]!; newWps[index] = { ...wp4, x: wp4.x + step };
                  } else {
                    return;
                  }

                  updateEdgeWaypoints(editor, { edgeId: id, waypoints: newWps });
                }}
              />
            );
          })}
        </div>
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Re-export for consumers                                            */
/* ------------------------------------------------------------------ */

export { defaultEdgeOptionsFromVisual, type EdgeOptions } from "./edge-options.js";