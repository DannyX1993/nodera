import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import type { FC } from "react";

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
      <BaseEdge path={path} className={selected ? "nodera-edge-selected" : undefined} />
      {text && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "none",
              fontSize: 12,
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
