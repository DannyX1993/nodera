/**
 * `example.basic-nodes` — the smallest complete example plugin.
 *
 * It contributes declarative data only: two node definitions and the edge
 * definition that connects them. Nothing here is a component or a function
 * stored in a definition, so the same plugin serves any presentation adapter
 * (AGENTS.md §5, §9).
 *
 * The plugin ships a manifest that declares exactly what its `activate` hook
 * registers, with the same kinds and the same ids (D2, D13): the declaration is
 * what lets the plugin manager detect a conflict before running any code and
 * withdraw the contributions again on uninstall.
 */

import type {
  BuilderPluginApi,
  EdgeDefinitionInput,
  NodeDefinitionInput,
  PluginDefinition,
  PluginManifest,
  SdkIssues,
} from "@nodera/sdk";

/* ------------------------------------------------------------------ */
/*  Stable identifiers                                                 */
/* ------------------------------------------------------------------ */

/** Globally qualified id of the plugin itself. */
export const BASIC_NODES_PLUGIN_ID = "example.basic-nodes";

/** Node type that starts a basic graph. */
export const START_NODE_TYPE = "example.basic.start";

/** Node type that applies one step to the value it receives. */
export const TRANSFORM_NODE_TYPE = "example.basic.transform";

/** Edge type that moves a value from one basic node to the next. */
export const FLOW_EDGE_TYPE = "example.basic.flow";

/* ------------------------------------------------------------------ */
/*  Contributions                                                      */
/* ------------------------------------------------------------------ */

/** Entry point of a basic graph: one outgoing port, no incoming one. */
export const START_NODE: NodeDefinitionInput = {
  type: START_NODE_TYPE,
  version: "1.0.0",
  label: "Start",
  description: "Entry point of a basic graph.",
  category: "Example / Basic",
  ports: {
    outputs: [{ id: "out", name: "Out", dataType: "any" }],
  },
};

/** A single transformation step between a start and a sink. */
export const TRANSFORM_NODE: NodeDefinitionInput = {
  type: TRANSFORM_NODE_TYPE,
  version: "1.0.0",
  label: "Transform",
  description: "Applies a single step to the value it receives.",
  category: "Example / Basic",
  ports: {
    inputs: [{ id: "in", name: "In", dataType: "any", required: true }],
    outputs: [{ id: "out", name: "Out", dataType: "any" }],
  },
};

/**
 * The edge the plugin declares.
 *
 * `style` carries the declared visual keys only, so the definition stays
 * framework-neutral: a renderer may paint it, and the document still describes
 * the same edge.
 */
export const FLOW_EDGE: EdgeDefinitionInput = {
  type: FLOW_EDGE_TYPE,
  version: "1.0.0",
  label: "Flow",
  description: "Moves a value from one basic node to the next.",
  style: { lineStyle: "solid", arrowEnd: true, color: "#3b82f6" },
};

/* ------------------------------------------------------------------ */
/*  Manifest                                                           */
/* ------------------------------------------------------------------ */

/**
 * Declarative contract of the plugin.
 *
 * `compatibility` states what the plugin was authored against (S8): the SDK
 * range, the portable document it targets and the version of each definition it
 * contributes.
 */
export const BASIC_NODES_MANIFEST: PluginManifest = {
  id: BASIC_NODES_PLUGIN_ID,
  name: "Example basic nodes",
  version: "1.0.0",
  description: "Two node definitions and one edge definition contributed through the public plugin api.",
  author: { name: "Nodera examples" },
  compatibility: {
    sdkVersion: "^1.0.0",
    documentFormat: "ggd",
    documentVersion: "1.0.0",
    definitionVersions: {
      [START_NODE_TYPE]: "1.0.0",
      [TRANSFORM_NODE_TYPE]: "1.0.0",
      [FLOW_EDGE_TYPE]: "1.0.0",
    },
  },
  contributions: [
    { type: "node", id: START_NODE_TYPE, version: "1.0.0" },
    { type: "node", id: TRANSFORM_NODE_TYPE, version: "1.0.0" },
    { type: "edge", id: FLOW_EDGE_TYPE, version: "1.0.0" },
  ],
};

/* ------------------------------------------------------------------ */
/*  Activation                                                         */
/* ------------------------------------------------------------------ */

/** Outcome of one contribution: the SDK's one error shape, nothing more. */
type ContributionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: SdkIssues };

/**
 * Fails the activation when one contribution was rejected.
 *
 * `activate` cannot return diagnostics, so a throw is the only channel a plugin
 * has; the SDK turns it into `sdk.plugin-invalid`, which fails the installation
 * instead of leaving a half-registered plugin behind.
 */
function assertRegistered(
  pluginId: string,
  label: string,
  outcome: ContributionOutcome,
): void {
  if (outcome.ok) return;
  const details = outcome.error
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join("; ");
  throw new Error(`${pluginId} could not register its ${label}: ${details}`);
}

/** The plugin: one manifest, one activation, no lifecycle state of its own. */
export const basicNodesPlugin: PluginDefinition<BuilderPluginApi> = {
  manifest: BASIC_NODES_MANIFEST,
  activate({ api }) {
    assertRegistered(
      BASIC_NODES_PLUGIN_ID,
      "start node",
      api.nodes.register(START_NODE),
    );
    assertRegistered(
      BASIC_NODES_PLUGIN_ID,
      "transform node",
      api.nodes.register(TRANSFORM_NODE),
    );
    assertRegistered(
      BASIC_NODES_PLUGIN_ID,
      "flow edge",
      api.edges.register(FLOW_EDGE),
    );
  },
};
