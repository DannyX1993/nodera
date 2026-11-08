/**
 * Host vocabulary of the layout-switch demo.
 *
 * Three declarative node definitions: a source, a stage and a sink. They are
 * plain SDK data (`type`, `label`, `ports`), never components, and the example
 * adds no custom renderer — the binding's default node renderer draws them,
 * because this demo is about placement, not about drawing.
 *
 * The definitions are also the vocabulary the node-creation dialog offers: the
 * palette reads the same registry, so a new node is never a second kind of
 * thing.
 */

import type { NodeDefinitionInput } from "@nodera/sdk";

/** Source node type: the only rank-0 kind in the seeded graph. */
export const INGEST_NODE_TYPE = "demo.stage.ingest";

/** Intermediate stage: one input, one output. */
export const TRANSFORM_NODE_TYPE = "demo.stage.transform";

/** Sink node type: one input and nothing to feed forward. */
export const OUTPUT_NODE_TYPE = "demo.stage.output";

/** Definitions the builder registers before the host touches it. */
export const DEMO_NODES: readonly NodeDefinitionInput[] = [
  {
    type: INGEST_NODE_TYPE,
    version: "1.0.0",
    label: "Ingest",
    description: "Where the demo pipeline starts. A source node, so the layered strategy puts it in rank 0.",
    category: "stage",
    ports: { outputs: [{ id: "out", name: "Items", dataType: "any" }] },
  },
  {
    type: TRANSFORM_NODE_TYPE,
    version: "1.0.0",
    label: "Transform",
    description: "Intermediate stage. Its rank is the longest path that reaches it from a source node.",
    category: "stage",
    ports: {
      inputs: [{ id: "in", name: "In", dataType: "any" }],
      outputs: [{ id: "out", name: "Out", dataType: "any" }],
    },
  },
  {
    type: OUTPUT_NODE_TYPE,
    version: "1.0.0",
    label: "Publish",
    description: "Sink of the demo pipeline: one input, no output.",
    category: "stage",
    ports: { inputs: [{ id: "in", name: "In", dataType: "any" }] },
  },
];
