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
 * the host requests from its own controls turns that grid into ranks. That
 * difference is the point of the demo.
 *
 * The same seeding serves the boot and the options panel's "Reset graph"
 * action, so a reset re-creates exactly the graph the demo starts with instead
 * of a second copy of it that could drift.
 */

import { assertValid, createBuilder, type Builder } from "@nodera/sdk";
import type { GraphLayoutConfiguration, SdkIssue, SdkIssues } from "@nodera/sdk";
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
  // The demo boots on the ranked strategy, so the surface it implies is declared
  // here too: fixed connections and no port handles, exactly what the strategy
  // control applies when the host switches back to `layered`.
  connections: "fixed",
  ports: "hidden",
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
 * Seeds the graph through the public Graph API, collecting what the SDK refused.
 *
 * Every creation goes through `builder.graph`, so the same rules apply as for
 * any host: the definition must exist, the ports must exist, each call is one
 * history unit, and `mode: "auto"` is what decides whether the node gets a
 * position at all. The refusals are returned rather than thrown, because the
 * boot fails loudly on them while "Reset graph" reports them in the status line.
 */
function seedGraph(builder: Builder): SdkIssues {
  const issues: SdkIssue[] = [];
  for (const node of SEED_NODES) {
    const added = builder.graph.addNode({ type: node.type, nodeId: node.nodeId });
    if (!added.ok) {
      issues.push(...added.error);
    }
  }
  for (const [source, target] of SEED_EDGES) {
    const connected = builder.graph.connect({ source, target });
    if (!connected.ok) {
      issues.push(...connected.error);
    }
  }
  return issues;
}

/** Composes the demo builder. */
export function createDemoBuilder(): Builder {
  const builder = assertValid(
    createBuilder({
      id: DEMO_BUILDER_ID,
      adapter: createReactFlowAdapter(),
      registry: { nodes: DEMO_NODES },
      // The host asks for the edge affordance; the framework adds no control it
      // was not asked for, and the same flag is what `builder.features` reports.
      features: { edgeInsertion: true },
      document: { format: "ggd", version: "1.0.0" },
      graph: { graphId: "demo-layout-switch", layout: DEMO_LAYOUT },
    }),
  );

  const seeding = seedGraph(builder);
  if (seeding.length > 0) {
    // The seed is this host's own code, not a host decision: a refusal means the
    // example is broken, so it stops the boot instead of painting a graph
    // nobody asked for.
    throw new Error(
      `The demo could not seed its graph: ${seeding.map((issue) => issue.message).join("; ")}`,
    );
  }
  // Boot sequence of a host that declares a ranked layout: compose, seed, then
  // apply the layout once. Without it the first paint shows the add-time grid,
  // which is not what a layered host wants a person to see on load.
  assertValid(builder.graph.arrange());
  return builder;
}

/**
 * Re-creates the seeded graph in place: the options panel's "Reset graph" action.
 *
 * Every step is the public Graph API, so a reset is the same kind of change as
 * any host edit and each one is its own history unit. The edges are dropped
 * first, so the result never depends on `graph.layout.onRemove`: under
 * `"splice"` a removal joins the neighbours it finds, and a reset must not grow
 * edges out of the order the nodes happen to be removed in. A graph without
 * nodes holds no edges, so the two passes together leave nothing behind.
 *
 * The caller re-applies the arrangement: resetting is about the graph, and the
 * direction and spacings the host's controls hold are the host's own state.
 */
export function resetDemoGraph(builder: Builder): SdkIssues {
  const issues: SdkIssue[] = [];
  for (const edge of builder.graph.edges()) {
    const disconnected = builder.graph.disconnect(edge.id);
    if (!disconnected.ok) {
      issues.push(...disconnected.error);
    }
  }
  for (const node of builder.graph.nodes()) {
    const removed = builder.graph.removeNode(node.id);
    if (!removed.ok) {
      issues.push(...removed.error);
    }
  }
  issues.push(...seedGraph(builder));
  return issues;
}
