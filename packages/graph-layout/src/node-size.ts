import type { GraphLayoutNodeSize } from "./strategy.js";

/**
 * Fallback box of a node that carries no size of its own, in flow units.
 *
 * It matches the `--ndr-node-min-width` / `--ndr-node-min-height` token defaults
 * of the default node renderer, so a host that never measures its nodes still
 * gets a grid whose gaps are the gaps the painted boxes have. Only a fallback:
 * a node's own `width`/`height` and the host's `nodeSize` always win.
 *
 * This is the framework's **one** default box. Every grid reads it through
 * {@link resolveLayoutNodeSize}, so nobody carries a second literal that has to
 * agree.
 */
export const DEFAULT_LAYOUT_NODE_SIZE = { width: 140, height: 40 } as const;

/**
 * The box a placement reserves for a node: the one the host declared, or
 * {@link DEFAULT_LAYOUT_NODE_SIZE}.
 *
 * The layered strategy resolves its per-node fallback with it and the SDK's
 * add-time step does the same, so a host that declares no `nodeSize` gets the
 * same box from an added node and from an arrangement. A declared box is
 * returned as it is — this resolves a fallback, it never validates or copies —
 * and the default is one shared object, never a fresh equal one.
 */
export function resolveLayoutNodeSize(
  nodeSize: GraphLayoutNodeSize | undefined,
): GraphLayoutNodeSize {
  return nodeSize ?? DEFAULT_LAYOUT_NODE_SIZE;
}
