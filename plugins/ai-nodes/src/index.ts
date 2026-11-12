/**
 * `example.ai-nodes` — a framework-agnostic plugin of node definitions.
 *
 * It contributes two node definitions and nothing else. Presentation stays on
 * the host side: a node type *is* its renderer id, so a definition already
 * declares which renderer the UI must resolve for it, and the host binds the
 * component itself with `builder.bindRenderer("nodes", "example.ai.classify", C)`.
 *
 * That split is what keeps the plugin portable (AGENTS.md §7, §9, D8):
 *
 * - this package imports neither React nor React Flow, so it can be loaded by a
 *   non-React host;
 * - the plugin binds no renderer at all. `api.renderers.bind` is the
 *   *host/framework-aware* channel — a value bound there must be something the
 *   presentation adapter can paint (for `@nodera/react-flow`, a React
 *   component). A plain-data descriptor bound into `nodes` makes
 *   `createRendererSet` reject the whole builder with
 *   `InvalidRendererBindingError`, which is exactly why a framework-agnostic
 *   plugin must not use that channel;
 * - the manifest declares exactly the two node contributions the activation
 *   registers, so a host can plan, conflict-check and later withdraw them.
 */

import type { PluginDefinition, PluginManifest } from "@nodera/plugin-api";
import type {
  BuilderPluginApi,
  NodeDefinitionInput,
  SdkIssues,
} from "@nodera/sdk";

/* ------------------------------------------------------------------ */
/*  Stable identifiers                                                 */
/* ------------------------------------------------------------------ */

/** Globally qualified id of the plugin itself. */
export const AI_NODES_PLUGIN_ID = "example.ai-nodes";

/**
 * Node type that labels the value it receives.
 *
 * The type doubles as the renderer id the host binds a component for.
 */
export const CLASSIFY_NODE_TYPE = "example.ai.classify";

/** Node type that embeds the value it receives. */
export const EMBED_NODE_TYPE = "example.ai.embed";

/* ------------------------------------------------------------------ */
/*  Contributions                                                      */
/* ------------------------------------------------------------------ */

/** Node that classifies the value it receives into labels. */
export const CLASSIFY_NODE: NodeDefinitionInput = {
  type: CLASSIFY_NODE_TYPE,
  version: "1.0.0",
  label: "Classify",
  description: "Labels the value it receives.",
  category: "Example / AI",
  ports: {
    inputs: [{ id: "in", name: "In", dataType: "any", required: true }],
    outputs: [{ id: "labels", name: "Labels", dataType: "array" }],
  },
};

/** Node that turns the value it receives into an embedding. */
export const EMBED_NODE: NodeDefinitionInput = {
  type: EMBED_NODE_TYPE,
  version: "1.0.0",
  label: "Embed",
  description: "Turns the value it receives into an embedding.",
  category: "Example / AI",
  ports: {
    inputs: [{ id: "in", name: "In", dataType: "any", required: true }],
    outputs: [{ id: "vector", name: "Vector", dataType: "array" }],
  },
};

/* ------------------------------------------------------------------ */
/*  Manifest                                                           */
/* ------------------------------------------------------------------ */

/** Declarative contract of the plugin (S3, S8). */
export const AI_NODES_MANIFEST: PluginManifest = {
  id: AI_NODES_PLUGIN_ID,
  name: "Example AI nodes",
  version: "1.0.0",
  description: "Two node definitions; the host binds the components that paint them.",
  author: { name: "Nodera examples" },
  compatibility: {
    sdkVersion: "^0.0.0",
    documentFormat: "ggd",
    documentVersion: "1.0.0",
    definitionVersions: {
      [CLASSIFY_NODE_TYPE]: "1.0.0",
      [EMBED_NODE_TYPE]: "1.0.0",
    },
  },
  contributions: [
    { type: "node", id: CLASSIFY_NODE_TYPE, version: "1.0.0" },
    { type: "node", id: EMBED_NODE_TYPE, version: "1.0.0" },
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
 * has; the SDK turns it into `sdk.plugin-invalid` and the installation fails
 * closed.
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

/** The plugin: two node definitions, no presentation binding. */
export const aiNodesPlugin: PluginDefinition<BuilderPluginApi> = {
  manifest: AI_NODES_MANIFEST,
  activate({ api }) {
    assertRegistered(
      AI_NODES_PLUGIN_ID,
      "classify node",
      api.nodes.register(CLASSIFY_NODE),
    );
    assertRegistered(
      AI_NODES_PLUGIN_ID,
      "embed node",
      api.nodes.register(EMBED_NODE),
    );
  },
};
