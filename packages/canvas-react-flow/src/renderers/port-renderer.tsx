import { Handle, Position } from "@xyflow/react";

import type { NoderaNodeData } from "./node-renderer-props.js";

/* ------------------------------------------------------------------ */
/*  PortHandle                                                         */
/* ------------------------------------------------------------------ */

/**
 * Renders a React Flow {@link Handle} wired to a single port.
 *
 * Position mapping (documented for Canvas consumers):
 *   - input   → left  (target handle; Canvas runs with ConnectionMode=loose)
 *   - output  → right (source handle; Canvas runs with ConnectionMode=loose)
 *   - bidirectional → right (treated as source)
 *
 * The canvas layer uses `ConnectionMode="loose"` which allows
 * connections to any handle regardless of source/target semantics,
 * so direction only drives accessible labelling and visual placement.
 */
export function PortHandle({
  portId,
  direction = "bidirectional",
  name,
}: {
  portId: string;
  direction?: NoderaNodeData["ports"][0]["direction"];
  name?: string;
}) {
  const type: "target" | "source" =
    direction === "input" ? "target" : "source";

  const position: Position =
    direction === "input" ? Position.Left : Position.Right;

  // Prefer the semantic name for accessibility; fall back to the id.
  const ariaLabel = name ?? portId;

  return (
    <Handle
      id={portId}
      type={type}
      position={position}
      aria-label={ariaLabel}
      data-nodera-port-id={portId}
      data-nodera-port-direction={direction}
      className="nodera-port-handle"
    />
  );
}