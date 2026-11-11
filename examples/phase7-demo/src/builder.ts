/**
 * Composition root of the Phase 7 demo.
 *
 * Everything here goes through the public surface — `@nodera/sdk`,
 * `@nodera/plugin-manager` and the five example plugins — which is the whole
 * point of the demo: a host application composes the ecosystem it trusts, in
 * the order the plugin lifecycle defines, and the editor then renders whatever
 * those plugins contributed.
 *
 * | Step | Surface                                                        |
 * | ---- | -------------------------------------------------------------- |
 * | 1    | `createBuilder(...)` with the React Flow adapter and the flags  |
 * | 2    | `createPluginManager(builder).install([...])` — discover,       |
 * |      | resolve, validate, register, activate                           |
 * | 3    | `builder.bindRenderer(kind, id, component)` — the host half of  |
 * |      | every presentation contribution                                 |
 * | 4    | `builder.layout.register/setDefault` — the geometry a plugin    |
 * |      | cannot declare, including where its panels sit                  |
 * | 5    | `builder.graph.addNode/connect` — a graph of plugin node types  |
 *
 * ## Why `example.ai-nodes` is not installed on the mounted builder
 *
 * `ai-nodes` binds *opaque renderer descriptors* — plain data — into the
 * `nodes` renderer slot. The React binding validates a whole binding snapshot
 * and refuses a builder whose renderer values are not React components
 * (`createRendererSet` throws `InvalidRendererBindingError` naming every
 * offender), so mounting such a builder is impossible. A host cannot override
 * those ids either: `bindRenderer` reports `sdk.duplicate-id` instead of
 * rebinding a live id, and uninstall never withdraws a renderer binding.
 *
 * The demo therefore installs the four plugins a React host can render, and
 * shows the fifth as declared-but-not-mounted ({@link UNMOUNTED_PLUGINS}) —
 * the honest picture of today's ecosystem, not a hidden failure. See
 * `builder.test.ts` for the executable statement of that limitation.
 */

import {
  assertOk,
  assertValid,
  createBuilder,
  type Builder,
  type BuilderDocumentConfiguration,
  type LayoutDefinition,
} from "@nodera/sdk";
import { aiNodesPlugin } from "@nodera/ai-nodes";
import {
  BASIC_NODES_PLUGIN_ID,
  FLOW_EDGE_TYPE,
  START_NODE_TYPE,
  TRANSFORM_NODE_TYPE,
  basicNodesPlugin,
} from "@nodera/basic-nodes";
import { DATA_NODES_PLUGIN_ID, dataNodesPlugin } from "@nodera/data-nodes";
import {
  DEVELOPER_TOOLS_PLUGIN_ID,
  ISSUES_PANEL_ID,
  SHORTCUTS_PANEL_ID,
  developerToolsPlugin,
} from "@nodera/developer-tools";
import {
  BLUEPRINT_THEME_ID,
  KITCHEN_SINK_PLUGIN_ID,
  kitchenSinkPlugin,
} from "@nodera/example-plugin";
import { createPluginManager, type PluginManager } from "@nodera/plugin-manager";
import { createReactFlowAdapter } from "@nodera/react-flow";

import { createIssuesPanel, createShortcutsPanel, StartNode, TransformNode } from "./renderers.js";

/* ------------------------------------------------------------------ */
/*  Stable identifiers of the demo composition                         */
/* ------------------------------------------------------------------ */

/** Id of the builder this host composes. */
export const DEMO_BUILDER_ID = "demo.phase7-builder";

/** Id of the layout the host declares on top of the plugin-contributed ones. */
export const DEMO_LAYOUT_ID = "demo.layout.ecosystem";

/** Built-in theme the configuration names; the plugin theme is applied after install. */
export const BUILT_IN_THEME_ID = "nodera.light";

/** Built-in layout the configuration names, replaced by {@link DEMO_LAYOUT_ID}. */
export const BUILT_IN_LAYOUT_ID = "nodera.layout.editor";

/** Document contract the demo host reads and writes. */
const DOCUMENT: BuilderDocumentConfiguration = { format: "ggd", version: "1.0.0" };

/** Plugins the mounted builder installs, in installation order. */
const MOUNTED_PLUGINS = [
  basicNodesPlugin,
  dataNodesPlugin,
  developerToolsPlugin,
  kitchenSinkPlugin,
] as const;

/** Ids of those plugins, in the same order. */
export const DEMO_PLUGIN_IDS: readonly string[] = MOUNTED_PLUGINS.map(
  (plugin) => plugin.manifest.id,
);

/** The node and panel ids the four installed plugins contribute. */
export const PLUGIN_IDS = {
  basicNodes: BASIC_NODES_PLUGIN_ID,
  dataNodes: DATA_NODES_PLUGIN_ID,
  developerTools: DEVELOPER_TOOLS_PLUGIN_ID,
  kitchenSink: KITCHEN_SINK_PLUGIN_ID,
  startNode: START_NODE_TYPE,
  transformNode: TRANSFORM_NODE_TYPE,
  flowEdge: FLOW_EDGE_TYPE,
  issuesPanel: ISSUES_PANEL_ID,
  shortcutsPanel: SHORTCUTS_PANEL_ID,
  blueprintTheme: BLUEPRINT_THEME_ID,
} as const;

/**
 * Plugins the host knows about but does not install on this builder.
 *
 * Read from their manifests, which is exactly what a host inspects before it
 * decides to run third-party code (AGENTS.md §9). `reason` names why this
 * particular host cannot mount them.
 */
export const UNMOUNTED_PLUGINS: readonly {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly contributions: readonly string[];
  readonly reason: string;
}[] = [
  {
    id: aiNodesPlugin.manifest.id,
    name: aiNodesPlugin.manifest.name,
    version: aiNodesPlugin.manifest.version,
    contributions: (aiNodesPlugin.manifest.contributions ?? []).map(
      (entry) => `${entry.type}:${entry.id}`,
    ),
    reason:
      "binds opaque renderer descriptors into the nodes slot; the React binding refuses a builder whose renderer values are not components, and a live renderer id cannot be rebound",
  },
];

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

/**
 * Layout the host applies at boot.
 *
 * It places the two panels `example.developer-tools` contributes next to the
 * framework's palette and properties inspector: a plugin declares a panel, and
 * only the host's layout decides where — and whether — it appears.
 */
const DEMO_LAYOUT: LayoutDefinition = {
  id: DEMO_LAYOUT_ID,
  name: "Plugin ecosystem",
  description: "Palette, properties and both developer-tools panels around the canvas.",
  regionSizes: { left: 240, right: 340, bottom: 180 },
  panels: [
    { panelId: "header", region: "header", size: 44 },
    { panelId: "palette", region: "left", size: 240 },
    { panelId: "properties", region: "right", size: 320 },
    { panelId: ISSUES_PANEL_ID, region: "bottom", size: 180 },
    { panelId: SHORTCUTS_PANEL_ID, region: "right", size: 220 },
    { panelId: "validation", region: "bottom", size: 180 },
    { panelId: "footer", region: "footer", size: 28 },
  ],
};

/* ------------------------------------------------------------------ */
/*  Managers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Manager that installed the plugins of each builder.
 *
 * The lifecycle manager owns the records that `uninstall` needs, so the demo
 * keeps the exact instance `createDemoBuilder` installed with — a second
 * manager over the same builder would hold no record and refuse the uninstall.
 */
const managers = new WeakMap<Builder, PluginManager>();

/** The manager that composed `builder`; a read before composition is a bug. */
export function demoPluginManager(builder: Builder): PluginManager {
  const manager = managers.get(builder);
  if (manager === undefined) {
    throw new Error("The builder was not composed by createDemoBuilder");
  }
  return manager;
}

/* ------------------------------------------------------------------ */
/*  Composition steps                                                  */
/* ------------------------------------------------------------------ */

/** Joins the diagnostics of a failed plugin call into one line. */
function issueSummary(issues: readonly { readonly code: string; readonly message: string }[]): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
}

/**
 * Installs the plugins through the lifecycle manager.
 *
 * Fail-closed: the manager validates every manifest, resolves dependencies and
 * detects conflicts before running any plugin code, so a rejected set leaves
 * the builder untouched and this throws instead of booting a half ecosystem.
 */
function installPlugins(builder: Builder): PluginManager {
  const manager = createPluginManager(builder, { sdkVersion: "0.0.0" });
  const installed = manager.install(MOUNTED_PLUGINS);
  if (!installed.ok) {
    throw new Error(`The demo could not install its plugins: ${issueSummary(installed.error)}`);
  }
  managers.set(builder, manager);
  return manager;
}

/**
 * Binds the host's components to the renderer ids the plugins declare.
 *
 * A contribution is data; this is where it becomes a React component. Panel ids
 * are the panel's own id because neither panel declares a separate `renderer`.
 */
function bindRenderers(builder: Builder): void {
  assertOk(builder.bindRenderer("nodes", START_NODE_TYPE, StartNode));
  assertOk(builder.bindRenderer("nodes", TRANSFORM_NODE_TYPE, TransformNode));
  assertOk(builder.bindRenderer("panels", ISSUES_PANEL_ID, createIssuesPanel(builder)));
  assertOk(builder.bindRenderer("panels", SHORTCUTS_PANEL_ID, createShortcutsPanel(builder)));
}

/** Registers the host layout and applies it, then opens on the plugin's theme. */
function applyHostLayoutAndTheme(builder: Builder): void {
  assertOk(builder.layout.register(DEMO_LAYOUT));
  assertOk(builder.layout.setDefault(DEMO_LAYOUT_ID));
  // The built-in theme is what the configuration applied; the theme a plugin
  // contributed is registered by then, so the demo opens on the plugin's theme.
  assertOk(builder.theme.setDefault(BLUEPRINT_THEME_ID));
}

/**
 * Seeds a graph of plugin node types so the canvas is never empty.
 *
 * Everything is written through `builder.graph`, i.e. the application use
 * cases: the same port, history and event rules apply as for any host. The two
 * `basic-nodes` definitions declare no properties, so the values below are the
 * demo's illustrative data, rendered back by the host's own node renderers.
 */
function seedDemoGraph(builder: Builder): void {
  const start = assertValid(
    builder.graph.addNode({
      type: START_NODE_TYPE,
      nodeId: "demo-node-start",
      position: { x: 60, y: 140 },
      properties: { value: 42 },
    }),
  );

  const transform = assertValid(
    builder.graph.addNode({
      type: TRANSFORM_NODE_TYPE,
      nodeId: "demo-node-transform",
      position: { x: 380, y: 140 },
      properties: { expression: "value * 2" },
    }),
  );

  assertValid(
    builder.graph.connect({
      source: start.id,
      target: transform.id,
      sourcePort: "out",
      targetPort: "in",
      type: FLOW_EDGE_TYPE,
      label: "value",
    }),
  );
}

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

/**
 * Composes the demo builder.
 *
 * The one call a host application writes: engine adapter, feature flags,
 * document contract, initial UI state, then the plugin lifecycle, the host
 * renderers, the layout and a seeded graph.
 */
export function createDemoBuilder(): Builder {
  const builder = assertValid(
    createBuilder({
      id: DEMO_BUILDER_ID,
      adapter: createReactFlowAdapter(),
      features: { minimap: true, history: true, validation: true },
      document: DOCUMENT,
      ui: { theme: BUILT_IN_THEME_ID, layout: BUILT_IN_LAYOUT_ID },
    }),
  );

  installPlugins(builder);
  bindRenderers(builder);
  applyHostLayoutAndTheme(builder);
  seedDemoGraph(builder);

  return builder;
}
