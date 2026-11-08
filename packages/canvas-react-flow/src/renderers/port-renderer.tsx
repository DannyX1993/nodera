import { Handle, Position } from "@xyflow/react";

import type { NoderaPortRendererProps } from "./node-renderer-props.js";

/* ------------------------------------------------------------------ */
/*  PortHandle                                                         */
/* ------------------------------------------------------------------ */

/**
 * Props accepted by {@link PortHandle}.
 *
 * `direction` is optional here (defaulting to `bidirectional`) so the
 * default handle stays usable on its own, while a value that satisfies
 * {@link NoderaPortRendererProps} is always accepted.
 */
export type PortHandleProps = Omit<NoderaPortRendererProps, "direction"> & {
  readonly direction?: NoderaPortRendererProps["direction"];
};

/**
 * Inline styles for the handle.
 *
 * Every value is a CSS custom property with a literal fallback (D2/D8):
 * the theme engine writes `--ndr-handle-*` variables on a wrapper element,
 * and a host without a theme still gets a usable handle because the
 * fallback is part of the value. No stylesheet is required.
 */
const PORT_HANDLE_STYLE = {
  width: "var(--ndr-handle-size, 8px)",
  height: "var(--ndr-handle-size, 8px)",
  backgroundColor: "var(--ndr-handle-background, #ffffff)",
  borderWidth: "var(--ndr-handle-border-width, 1.5px)",
  borderStyle: "solid",
  borderColor: "var(--ndr-handle-border-color, #7c8896)",
  borderRadius: "var(--ndr-handle-radius, 50%)",
} as const;

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
}: PortHandleProps) {
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
      style={PORT_HANDLE_STYLE}
    />
  );
}
