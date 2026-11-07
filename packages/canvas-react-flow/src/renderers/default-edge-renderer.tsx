import type { BaseEdge as BaseEdgeType } from "@xyflow/react";
import { BaseEdge, EdgeLabelRenderer } from "@xyflow/react";
import type { FC } from "react";

import { defaultEdgeOptionsFromVisual } from "./edge-options.js";
import type { EdgeOptions } from "./edge-options.js";

/* ------------------------------------------------------------------ */
/*  DefaultEdgeRenderer                                                */
/* ------------------------------------------------------------------ */

export interface DefaultEdgeRendererProps {
  readonly path: string;
  readonly label?: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly options?: EdgeOptions;
  readonly selected?: boolean;
}

/**
 * A minimal custom edge that delegates visual options to the
 * `defaultEdgeOptionsFromVisual` helper so the mapper / renderer
 * layers can share the same conversion logic.
 */
export const DefaultEdgeRenderer: FC<DefaultEdgeRendererProps> = ({
  path,
  label,
  labelX,
  labelY,
  options,
}: DefaultEdgeRendererProps) => {
  return (
    <>
      <BaseEdge path={path} style={options} />
      {label && (
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
            {label}
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