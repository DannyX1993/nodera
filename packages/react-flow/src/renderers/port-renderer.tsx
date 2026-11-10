import { Handle, Position } from "@xyflow/react";

import { useNoderaPortAxis } from "../canvas/editor-context.js";
import {
  defaultPortPlacement,
  type PortPlacement,
} from "./port-placement.js";
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

/** React Flow position for each side a port may occupy. */
const POSITION_BY_PLACEMENT: Readonly<Record<PortPlacement, Position>> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
};

/**
 * React Flow position of a port that occupies `placement`.
 *
 * Exported because the canvas also draws inert and hidden handles under its
 * connection and ports policies: every handle of one port must land on the same
 * side, or the edge anchors rake across the node when the policy changes.
 */
export function positionForPlacement(placement: PortPlacement): Position {
  return POSITION_BY_PLACEMENT[placement];
}

/**
 * Renders a React Flow {@link Handle} wired to a single port.
 *
 * Placement and handle type are independent:
 *   - the handle type comes from the port direction — `input` → target handle,
 *     `output`/`bidirectional` → source handle;
 *   - the side comes from `placement` when given, otherwise from the default
 *     rule for the current layout axis and the direction (input faces left on a
 *     horizontal graph and top on a vertical one; output and bidirectional face
 *     right and bottom respectively).
 *
 * The canvas layer uses `ConnectionMode="loose"` which allows connections to
 * any handle regardless of source/target semantics, so the direction drives the
 * handle type and the accessible labelling, never the geometry alone.
 */
export function PortHandle({
  portId,
  direction = "bidirectional",
  name,
  placement,
}: PortHandleProps) {
  const axis = useNoderaPortAxis();

  const type: "target" | "source" =
    direction === "input" ? "target" : "source";

  const position: Position = positionForPlacement(
    placement ?? defaultPortPlacement(direction, axis),
  );

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
