/**
 * `example.developer-tools` — the plugin facet of interface actions.
 *
 * FASE7's "nuevas acciones de interfaz" map to the framework's declarative
 * interface contracts (S10): a `tool` is an action a toolbar, a palette or a
 * context menu offers, a `panel` is a surface the host may place, and a `dialog`
 * is a surface the UI state may open by id. All three are data: no component is
 * contributed, so the host keeps control of how the actions look (AGENTS.md
 * §4.5, §9).
 *
 * The manifest declares exactly the tools, panels and dialog the activation
 * registers (D2, D13).
 */

import type { PluginDefinition, PluginManifest } from "@nodera/plugin-api";
import type {
  BuilderPluginApi,
  PanelDefinition,
  SdkIssues,
  ToolDefinition,
} from "@nodera/sdk";

/* ------------------------------------------------------------------ */
/*  Stable identifiers                                                 */
/* ------------------------------------------------------------------ */

/** Globally qualified id of the plugin itself. */
export const DEVELOPER_TOOLS_PLUGIN_ID = "example.developer-tools";

/** Tool that runs the framework's own graph validation. */
export const VALIDATE_TOOL_ID = "example.dev.tool.validate";

/** Tool that triggers a host handler through the `custom` command kind. */
export const DUMP_GRAPH_TOOL_ID = "example.dev.tool.dump-graph";

/** Panel that reports the issues the developer tools collect. */
export const ISSUES_PANEL_ID = "example.dev.panel.issues";

/** Panel that explains the shortcuts the plugin installs. */
export const SHORTCUTS_PANEL_ID = "example.dev.panel.shortcuts";

/** Dialog the UI state may open to show those shortcuts. */
export const SHORTCUTS_DIALOG_ID = "example.dev.dialog.shortcuts";

/* ------------------------------------------------------------------ */
/*  Contributions                                                      */
/* ------------------------------------------------------------------ */

/**
 * Validation action.
 *
 * It declares the framework command instead of a handler, so the presentation
 * adapter routes it to the validation use case of the editing session.
 */
export const VALIDATE_TOOL: ToolDefinition = {
  id: VALIDATE_TOOL_ID,
  label: "Validate graph",
  description: "Runs every registered validator over the current graph.",
  icon: "check",
  group: "Developer",
  command: { kind: "validate" },
};

/**
 * Action the framework does not know about.
 *
 * `custom` defers to a host-provided handler, which is how a plugin offers an
 * interface action without the framework learning its semantics. Nothing here
 * executes anything: the plugin never runs the tool (AGENTS.md §9).
 */
export const DUMP_GRAPH_TOOL: ToolDefinition = {
  id: DUMP_GRAPH_TOOL_ID,
  label: "Dump graph",
  description: "Asks the host to print the portable document of the current graph.",
  icon: "braces",
  group: "Developer",
  command: { kind: "custom", id: "example.dev.dump-graph" },
};

/** Panel an issue list fits in: bottom region, next to the built-in validation panel. */
export const ISSUES_PANEL: PanelDefinition = {
  id: ISSUES_PANEL_ID,
  title: "Developer issues",
  description: "Issues reported by the developer-tools validators.",
  region: "bottom",
  size: 160,
  order: 10,
};

/** Panel that documents the tools the plugin adds. */
export const SHORTCUTS_PANEL: PanelDefinition = {
  id: SHORTCUTS_PANEL_ID,
  title: "Shortcuts",
  description: "Keyboard shortcuts contributed by the developer tools.",
  region: "right",
  size: 220,
  order: 10,
};

/** Dialog contract, derived from the public contribution surface. */
type DialogDefinition = Parameters<BuilderPluginApi["dialogs"]["register"]>[0];

/**
 * Dialog the host opens by id.
 *
 * It is declarative: a title, a description and a size token. The presentation
 * adapter decides how that becomes an accessible surface.
 */
export const SHORTCUTS_DIALOG: DialogDefinition = {
  id: SHORTCUTS_DIALOG_ID,
  title: "Developer shortcuts",
  description: "Every action the developer-tools plugin adds to this editor.",
  size: "lg",
};

/* ------------------------------------------------------------------ */
/*  Manifest                                                           */
/* ------------------------------------------------------------------ */

/** Declarative contract of the plugin (S3, S8). */
export const DEVELOPER_TOOLS_MANIFEST: PluginManifest = {
  id: DEVELOPER_TOOLS_PLUGIN_ID,
  name: "Example developer tools",
  version: "1.0.0",
  description: "Two tools, two panels and one dialog contributed as declarative interface actions.",
  author: { name: "Nodera examples" },
  compatibility: {
    sdkVersion: "^1.0.0",
    documentFormat: "ggd",
    documentVersion: "1.0.0",
  },
  contributions: [
    { type: "tool", id: VALIDATE_TOOL_ID },
    { type: "tool", id: DUMP_GRAPH_TOOL_ID },
    { type: "panel", id: ISSUES_PANEL_ID },
    { type: "panel", id: SHORTCUTS_PANEL_ID },
    { type: "dialog", id: SHORTCUTS_DIALOG_ID },
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

/** The plugin: the interface actions, their panels and the dialog. */
export const developerToolsPlugin: PluginDefinition<BuilderPluginApi> = {
  manifest: DEVELOPER_TOOLS_MANIFEST,
  activate({ api }) {
    assertRegistered(
      DEVELOPER_TOOLS_PLUGIN_ID,
      "validate tool",
      api.tools.register(VALIDATE_TOOL),
    );
    assertRegistered(
      DEVELOPER_TOOLS_PLUGIN_ID,
      "dump-graph tool",
      api.tools.register(DUMP_GRAPH_TOOL),
    );
    assertRegistered(
      DEVELOPER_TOOLS_PLUGIN_ID,
      "issues panel",
      api.panels.register(ISSUES_PANEL),
    );
    assertRegistered(
      DEVELOPER_TOOLS_PLUGIN_ID,
      "shortcuts panel",
      api.panels.register(SHORTCUTS_PANEL),
    );
    assertRegistered(
      DEVELOPER_TOOLS_PLUGIN_ID,
      "shortcuts dialog",
      api.dialogs.register(SHORTCUTS_DIALOG),
    );
  },
};
