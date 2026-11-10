import type { PortPlacement } from "@nodera/graph-model";

import type { NoderaNodePort } from "./node-renderer-props.js";

/**
 * Port placement resolution for the canvas.
 *
 * A port has two independent facts: its direction (input/output/bidirectional,
 * the semantic role React Flow turns into a `target`/`source` handle) and its
 * placement (the side of the node it is drawn on). Deriving the side from the
 * direction alone is wrong in a vertical graph: the ranks grow downwards, so an
 * input has to face the top and an output the bottom, or every edge leaves the
 * node sideways across the flow.
 */

/** Axis the layout grows along, i.e. the orientation of the ranks. */
export type PortAxis = "horizontal" | "vertical";

export type { PortPlacement };

/** Every placement a port can occupy. */
export const PORT_PLACEMENTS: readonly PortPlacement[] = [
  "left",
  "right",
  "top",
  "bottom",
];

/**
 * Side a port takes when its declaration does not pin one.
 *
 * - horizontal layout: input faces left, output/bidirectional face right, the
 *   behaviour Nodera has always had.
 * - vertical layout: input faces top, output/bidirectional face bottom, so the
 *   handles sit on the axis the ranks advance along.
 */
export function defaultPortPlacement(
  direction: NoderaNodePort["direction"],
  axis: PortAxis,
): PortPlacement {
  if (axis === "vertical") {
    return direction === "input" ? "top" : "bottom";
  }
  return direction === "input" ? "left" : "right";
}

/**
 * Effective placement of a port: the declared side wins, otherwise the axis
 * default applies.
 *
 * The presentation layer resolves it once, so a host port renderer receives the
 * same value the built-in handle uses instead of re-deriving it.
 */
export function resolvePortPlacement(
  port: NoderaNodePort,
  axis: PortAxis,
): PortPlacement {
  return port.visual?.placement ?? defaultPortPlacement(port.direction, axis);
}
