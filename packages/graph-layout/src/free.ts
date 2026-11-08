import { ok } from "@nodera/contracts";

import type { GraphLayoutResult, GraphLayoutStrategy } from "./strategy.js";

export const FREE_STRATEGY_ID = "nodera.graph-layout.free";

/**
 * The `free` strategy: it never computes a position, so every position stays in
 * the host's hands. An empty placement answer is the honest one — there is
 * nothing to move — and the caller applies no write at all.
 *
 * No options are involved, because nothing is being arranged: there is no
 * configuration that could make this strategy produce geometry.
 */
export function createFreeStrategy(): GraphLayoutStrategy {
  return { id: FREE_STRATEGY_ID, place: () => ok<GraphLayoutResult>({ positions: [] }) };
}
