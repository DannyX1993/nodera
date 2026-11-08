/**
 * Composition root of the layout-switch demo.
 *
 * One `createBuilder` call composes the whole host: the React Flow adapter, the
 * node vocabulary and the initial placement policy. The demo imports only
 * `@nodera/sdk` and the two React packages, so nothing here reaches an internal
 * Nodera module.
 *
 * The graph is seeded **without positions on purpose**: `mode: "auto"` places
 * those nodes on a deterministic grid at add time, and the explicit `Arrange`
 * the host requests from its own toolbar turns that grid into ranks. That
 * difference is the point of the demo.
 */

import { assertValid, createBuilder, type Builder } from "@nodera/sdk";
import type { GraphLayoutConfiguration } from "@nodera/sdk";
import { createReactFlowAdapter } from "@nodera/react-flow";

import {
  DEMO_NODES,
  INGEST_NODE_TYPE,
  OUTPUT_NODE_TYPE,
  TRANSFORM_NODE_TYPE,
} from "./nodes.js";

/** Id of the builder this host composes. */
export const DEMO_BUILDER_ID = "demo.layout-switch";

/**
 * Placement the host declares at boot.
 *
 * It is configuration, not a behaviour: `mode: "auto"` places an added node that
 * carries no position, and the direction and spacings are what `arrange()` reads
 * when the host's toolbar does not override them for one call. The host's own
 * controls start from these values, which is the only reason they are exported.
 */
export const DEMO_LAYOUT = {
  mode: "auto",
  direction: "horizontal",
  spacing: 240,
  rankSpacing: 280,
} as const satisfies GraphLayoutConfiguration;

/** Nodes of the seed graph, added without a position. */
const SEED_NODES: readonly { readonly nodeId: string; readonly type: string }[] = [
  { nodeId: "ingest", type: INGEST_NODE_TYPE },
  { nodeId: "parse", type: TRANSFORM_NODE_TYPE },
  { nodeId: "enrich", type: TRANSFORM_NODE_TYPE },
  { nodeId: "score", type: TRANSFORM_NODE_TYPE },
  { nodeId: "publish", type: OUTPUT_NODE_TYPE },
];

/**
 * Connections of the seed graph.
 *
 * They are what the layered strategy ranks: `ingest` is the only source, `parse`
 * and `enrich` share rank 1 (so the in-rank spacing is visible), `score` is rank
 * 2 and `publish` rank 3.
 */
const SEED_EDGES: readonly (readonly [string, string])[] = [
  ["ingest", "parse"],
  ["ingest", "enrich"],
  ["parse", "score"],
  ["enrich", "score"],
  ["score", "publish"],
];

/**
 * Seeds the graph through the public Graph API.
 *
 * Every creation goes through `builder.graph`, so the same rules apply as for
 * any host: the definition must exist, the ports must exist, each call is one
 * history unit, and `mode: "auto"` is what decides whether the node gets a
 * position at all.
 */
function seedGraph(builder: Builder): void {
  for (const node of SEED_NODES) {
    assertValid(builder.graph.addNode({ type: node.type, nodeId: node.nodeId }));
  }
  for (const [source, target] of SEED_EDGES) {
    assertValid(builder.graph.connect({ source, target }));
  }
}

/** Composes the demo builder. */
export function createDemoBuilder(): Builder {
  const builder = assertValid(
    createBuilder({
      id: DEMO_BUILDER_ID,
      adapter: createReactFlowAdapter(),
      registry: { nodes: DEMO_NODES },
      document: { format: "ggd", version: "1.0.0" },
      graph: { graphId: "demo-layout-switch", layout: DEMO_LAYOUT },
    }),
  );

  seedGraph(builder);
  return builder;
}
