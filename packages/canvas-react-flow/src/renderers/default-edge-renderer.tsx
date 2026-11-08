import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import type { FC } from "react";

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

/* ------------------------------------------------------------------ */
/*  DefaultEdgeRenderer                                                */
/* ------------------------------------------------------------------ */

/**
 * The default custom edge for Nodera. React Flow calls it with
 * {@link EdgeProps}; it computes the bezier path itself and renders a
 * {@link BaseEdge} plus an optional label layer.
 *
 * The `label` comes from the mapped edge (`label` prop or `data.label`).
 * Selection is expressed with a dedicated class so it is not
 * communicated through color alone (accessibility rule).
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
}) => {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const labelFromData = (data as { label?: unknown } | undefined)?.label;
  const text =
    label ??
    (typeof labelFromData === "string" && labelFromData.length > 0 ? labelFromData : undefined);

  return (
    <>
      <BaseEdge
        path={path}
        style={selected ? SELECTED_EDGE_STYLE : EDGE_STYLE}
        className={selected ? "nodera-edge-selected" : undefined}
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
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Re-export for consumers                                            */
/* ------------------------------------------------------------------ */

export { defaultEdgeOptionsFromVisual, type EdgeOptions } from "./edge-options.js";
