/**
 * `example.ai-nodes` — the plugin facet of presentation contributions.
 *
 * It contributes two node definitions and, next to them, one *renderer binding*
 * per node: the opaque value a presentation adapter resolves when it paints that
 * node. The binding crosses into the SDK as data — this package imports neither
 * React nor React Flow — so the same plugin works with any host that can turn
 * the descriptor into a component (AGENTS.md §7, D8).
 *
 * Two rules are visible here:
 *
 * - a binding is not a contribution. `api.renderers.bind` attaches an opaque
 *   value to an existing slot, so it never appears in the installation's
 *   `contributionIds` and uninstall never withdraws it (D13). The manifest still
 *   declares it, because a declaration is what a host reads before running the
 *   plugin's code (D2);
 * - the manifest declares exactly the node definitions and renderer ids the
 *   activation registers.
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

/** Node type that labels the value it receives. */
export const CLASSIFY_NODE_TYPE = "example.ai.classify";

/** Node type that embeds the value it receives. */
export const EMBED_NODE_TYPE = "example.ai.embed";

/* ------------------------------------------------------------------ */
/*  Renderer descriptors                                               */
/* ------------------------------------------------------------------ */

/**
 * Renderer descriptor a presentation adapter turns into a component.
 *
 * The SDK treats the value as opaque `unknown`; the shape is the plugin's own
 * contract with the hosts that support it. Keeping it plain data — no function,
 * no component — is what lets the same plugin be loaded by a non-React host.
 */
export interface AiNodeRenderer {
  readonly kind: "ai-node";
  /** Accent token the renderer uses to tell the two AI nodes apart. */
  readonly accent: string;
  /** Short badge the renderer paints in the node header. */
  readonly badge: string;
}

/** Renderer descriptor of the classify node. */
export const CLASSIFY_RENDERER: AiNodeRenderer = {
  kind: "ai-node",
  accent: "violet",
  badge: "AI",
};

/** Renderer descriptor of the embed node. */
export const EMBED_RENDERER: AiNodeRenderer = {
  kind: "ai-node",
  accent: "teal",
  badge: "AI",
};

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
  description: "Two node definitions plus the renderer descriptors a host binds for them.",
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
    { type: "renderer", id: CLASSIFY_NODE_TYPE },
    { type: "renderer", id: EMBED_NODE_TYPE },
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

/** The plugin: two node definitions and the renderers bound for them. */
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
    assertRegistered(
      AI_NODES_PLUGIN_ID,
      "classify renderer",
      api.renderers.bind("nodes", CLASSIFY_NODE_TYPE, CLASSIFY_RENDERER),
    );
    assertRegistered(
      AI_NODES_PLUGIN_ID,
      "embed renderer",
      api.renderers.bind("nodes", EMBED_NODE_TYPE, EMBED_RENDERER),
    );
  },
};
