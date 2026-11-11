/**
 * `example.kitchen-sink` (the `plugins/example-plugin` directory) — one
 * contribution of every remaining kind.
 *
 * Together with the other four example plugins this one completes the FASE7
 * contribution surface (S2, S10): a `theme`, a `layout`, a `layout-strategy` and
 * an `exporter`. The four are deliberately different in nature:
 *
 * - the theme and the layout are declarative data the host applies;
 * - the layout strategy and the exporter are *code* the host calls, so they are
 *   the example of a plugin contributing behaviour through a port rather than
 *   through a document;
 * - none of them holds a component, a function in serializable data or a
 *   reference to a framework (AGENTS.md §5, §6).
 *
 * The manifest declares exactly the four contributions the activation registers
 * (D2, D13).
 */

import type { PluginDefinition, PluginManifest } from "@nodera/plugin-api";
import type {
  BuilderPluginApi,
  CreateThemeInput,
  DesignTokens,
  GraphLayoutStrategy,
  LayoutDefinition,
  SdkIssues,
} from "@nodera/sdk";

/* ------------------------------------------------------------------ */
/*  Stable identifiers                                                 */
/* ------------------------------------------------------------------ */

/** Globally qualified id of the plugin itself. */
export const KITCHEN_SINK_PLUGIN_ID = "example.kitchen-sink";

/** Id of the theme the plugin contributes. */
export const BLUEPRINT_THEME_ID = "example.sink.theme.blueprint";

/** Id of the layout the plugin contributes. */
export const WORKSPACE_LAYOUT_ID = "example.sink.layout.workspace";

/** Id of the placement strategy the plugin contributes. */
export const GRID_STRATEGY_ID = "example.sink.strategy.grid";

/** Id of the exporter the plugin contributes. */
export const NDJSON_EXPORTER_ID = "example.sink.exporter.ndjson";

/** Format id the exporter writes: one JSON line per document. */
export const NDJSON_FORMAT = "ndjson";

/* ------------------------------------------------------------------ */
/*  Theme                                                              */
/* ------------------------------------------------------------------ */

/**
 * Token set of the theme.
 *
 * Every group is declared, because a theme is either fully applicable or not a
 * theme at all. The values are plain strings: the theme engine projects them
 * into CSS custom properties and the plugin never touches the DOM.
 */
export const BLUEPRINT_TOKENS: DesignTokens = {
  colors: {
    background: "#0f172a",
    surface: "#152238",
    surfaceAlt: "#1c2c47",
    border: "#2a3d5c",
    borderStrong: "#3b5479",
    text: "#e6edf7",
    textMuted: "#9db0cc",
    accent: "#4da3ff",
    accentText: "#08121f",
    danger: "#ff7a7a",
    warning: "#ffc861",
    success: "#7ce2a5",
    focus: "#4da3ff",
  },
  spacing: { xs: "2px", sm: "4px", md: "8px", lg: "16px" },
  typography: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSizeSm: "11px",
    fontSize: "12px",
    fontSizeLg: "14px",
  },
  borders: { radius: "4px", width: "1px" },
  shadows: { panel: "0 1px 2px rgba(3, 10, 22, 0.6)" },
  icons: { color: "#9db0cc" },
  node: {
    background: "#152238",
    borderColor: "#2a3d5c",
    textColor: "#e6edf7",
    radius: "4px",
  },
  edge: { color: "#4da3ff", width: "1.5px" },
  handle: { background: "#4da3ff", borderColor: "#0f172a" },
  selection: { outlineColor: "#4da3ff", outlineWidth: "2px" },
  canvas: { background: "#0b1220", gridColor: "#1c2c47" },
};

/** Dark "blueprint" theme: graphite surfaces with a single blue accent. */
export const BLUEPRINT_THEME: CreateThemeInput = {
  id: BLUEPRINT_THEME_ID,
  name: "Blueprint",
  description: "Monospaced, low-contrast chrome so the graph is the only loud thing on screen.",
  colorScheme: "dark",
  tokens: BLUEPRINT_TOKENS,
};

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

/**
 * Workspace layout the host may apply.
 *
 * It places panels the framework ships, so the plugin depends on no other
 * plugin: a layout names panels by id and the host decides which plugin
 * contributed them.
 */
export const WORKSPACE_LAYOUT: LayoutDefinition = {
  id: WORKSPACE_LAYOUT_ID,
  name: "Example workspace",
  description: "Palette on the left, properties on the right, validation at the bottom.",
  regionSizes: { left: 220, right: 280, bottom: 150 },
  panels: [
    { panelId: "header", region: "header", size: 44 },
    { panelId: "palette", region: "left", size: 220 },
    { panelId: "properties", region: "right", size: 280 },
    { panelId: "validation", region: "bottom", size: 150 },
    { panelId: "footer", region: "footer", size: 28 },
  ],
};

/* ------------------------------------------------------------------ */
/*  Layout strategy                                                    */
/* ------------------------------------------------------------------ */

/** Fallback box of a node the caller did not measure. */
const FALLBACK_NODE_SIZE = { width: 140, height: 40 } as const;

/**
 * Placement strategy that lays the graph out on a square grid.
 *
 * It answers for every node it receives — the caller decides which positions it
 * writes — and computes plain coordinates from the options the host declared, so
 * it holds no state and can run anywhere (AGENTS.md §4.2).
 */
export const GRID_STRATEGY: GraphLayoutStrategy = {
  id: GRID_STRATEGY_ID,
  place(input) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(input.nodes.length)));
    const box = input.options.nodeSize ?? FALLBACK_NODE_SIZE;
    const stepX = box.width + input.options.nodeSpacing;
    const stepY = box.height + input.options.nodeSpacing;
    const positions = input.nodes.map((node, index) => ({
      nodeId: node.id,
      position: {
        x: (index % columns) * stepX,
        y: Math.floor(index / columns) * stepY,
      },
    }));
    return { ok: true, value: { positions } };
  },
};

/* ------------------------------------------------------------------ */
/*  Exporter                                                           */
/* ------------------------------------------------------------------ */

/** Exporter contract, derived from the public contribution surface. */
type Exporter = Parameters<BuilderPluginApi["exporters"]["register"]>[0];

/**
 * Exporter that writes one JSON document per line.
 *
 * The input is already-validated domain data, but it is still serialized in a
 * guarded way: a value JSON cannot represent becomes a structured
 * `serialization-failed` diagnostic instead of an exception.
 */
export const ndjsonExporter: Exporter = {
  id: NDJSON_EXPORTER_ID,
  format: NDJSON_FORMAT,
  version: "1.0.0",
  exportContent(document) {
    try {
      return { ok: true, value: `${JSON.stringify(document)}\n` };
    } catch {
      return {
        ok: false,
        error: {
          kind: "serialization-failed",
          message: "The document cannot be serialized as JSON",
        },
      };
    }
  },
};

/* ------------------------------------------------------------------ */
/*  Manifest                                                           */
/* ------------------------------------------------------------------ */

/** Declarative contract of the plugin (S3, S8). */
export const KITCHEN_SINK_MANIFEST: PluginManifest = {
  id: KITCHEN_SINK_PLUGIN_ID,
  name: "Example kitchen sink",
  version: "1.0.0",
  description: "A theme, a layout, a layout strategy and an exporter in one plugin.",
  author: { name: "Nodera examples" },
  compatibility: {
    sdkVersion: "^0.0.0",
    documentFormat: "ggd",
    documentVersion: "1.0.0",
  },
  contributions: [
    { type: "theme", id: BLUEPRINT_THEME_ID },
    { type: "layout", id: WORKSPACE_LAYOUT_ID },
    { type: "layout-strategy", id: GRID_STRATEGY_ID },
    { type: "exporter", id: NDJSON_EXPORTER_ID, version: "1.0.0" },
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

/** The plugin: theme, layout, placement strategy and exporter. */
export const kitchenSinkPlugin: PluginDefinition<BuilderPluginApi> = {
  manifest: KITCHEN_SINK_MANIFEST,
  activate({ api }) {
    assertRegistered(
      KITCHEN_SINK_PLUGIN_ID,
      "theme",
      api.themes.register(BLUEPRINT_THEME),
    );
    assertRegistered(
      KITCHEN_SINK_PLUGIN_ID,
      "layout",
      api.layouts.register(WORKSPACE_LAYOUT),
    );
    assertRegistered(
      KITCHEN_SINK_PLUGIN_ID,
      "layout strategy",
      api.layoutStrategies.register(GRID_STRATEGY),
    );
    assertRegistered(
      KITCHEN_SINK_PLUGIN_ID,
      "exporter",
      api.exporters.register(ndjsonExporter),
    );
  },
};
