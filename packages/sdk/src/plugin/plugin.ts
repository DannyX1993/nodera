/**
 * The plugin authoring contract of the SDK (Phase 6).
 *
 * A plugin is a third party that contributes definitions to a builder through
 * one narrow api: nodes, edges, properties, panels, tools, themes, layouts,
 * graph validators, importers, exporters, dialogs, layout strategies and opaque
 * renderer bindings. Installation is synchronous and additive — no manifest, no
 * dependency resolution and no activation lifecycle, which belong to a later
 * phase. What this module owns is the *contract*: which id and version a plugin
 * must declare, what happens to a contribution that fails, and what the host can
 * observe afterwards.
 *
 * Two rules shape the implementation:
 *
 * - Fail before running anything. An invalid id or version, or an id that is
 *   already installed, is reported without calling `install` at all, so a
 *   rejected plugin can never leave a half-registration behind.
 * - Keep what worked, report what did not. A contribution that fails does not
 *   undo the plugin's successful ones; every failure is collected in the
 *   returned issues *and* announced through `plugin.error`. Only a completely
 *   successful install announces `plugin.registered`.
 * - One `plugin.error` per failed plugin. A throwing `install` aborts the
 *   plugin, so its throw is what the host is told about — once — even when an
 *   earlier contribution of the same install had already failed. Without a
 *   throw, each failed contribution keeps its own event, which is what lets a
 *   listener react to the specific diagnostic.
 *
 * Renderer bindings are not contributions: `renderers.bind` attaches an opaque
 * value to an existing slot and therefore never appears in `contributionIds`.
 * Its failures are `SdkIssues`, exactly like the builder method it delegates to,
 * so a plugin author sees the one error shape of the public surface.
 */

import { err, ok, type Result } from "@nodera/contracts";
import type { Exporter, Importer } from "@nodera/domain";
import type { GraphLayoutStrategy } from "@nodera/graph-layout";
import type { PropertyDefinition } from "@nodera/property-system";
import type { CreateThemeInput, ThemeDefinition } from "@nodera/theme-engine";
import type {
  DialogDefinition,
  LayoutDefinition,
  PanelDefinition,
  ToolDefinition,
} from "@nodera/ui-core";
import type { GraphValidator } from "@nodera/validation";
import type { RendererKind } from "../adapter/renderer-bindings.js";
import type { EdgeDefinitionInput } from "../authoring/edges.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import type { PropertyInput } from "../authoring/properties.js";
import type { Builder } from "../builder/builder.js";
import type { EdgeDefinitionView, NodeDefinitionView } from "../view/definitions.js";
import {
  describeValue,
  isPlainObject,
  isQualifiedId,
  sdkError,
  type SdkIssue,
  type SdkIssues,
  type SdkIssueCode,
  type SdkIssueOptions,
} from "../errors.js";

/** Registration slots a plugin can contribute to. Deliberately not extensible. */
export interface BuilderPluginApi {
  /** Registers a node definition; the plugin reads it back in the §9 vocabulary. */
  readonly nodes: {
    register(input: NodeDefinitionInput): Result<NodeDefinitionView, SdkIssues>;
  };
  /** Registers an edge definition; the plugin reads it back in the §9 vocabulary. */
  readonly edges: {
    register(input: EdgeDefinitionInput): Result<EdgeDefinitionView, SdkIssues>;
  };
  readonly properties: {
    register(input: PropertyInput): Result<PropertyDefinition, SdkIssues>;
  };
  readonly panels: {
    register(panel: PanelDefinition): Result<PanelDefinition, SdkIssues>;
  };
  readonly tools: {
    register(tool: ToolDefinition): Result<ToolDefinition, SdkIssues>;
  };
  readonly themes: {
    register(input: CreateThemeInput): Result<ThemeDefinition, SdkIssues>;
  };
  readonly layouts: {
    register(layout: LayoutDefinition): Result<LayoutDefinition, SdkIssues>;
  };
  /**
   * Contributes a graph validator — code, not declarative data.
   *
   * The validator joins the registry the editing session validates with, so it
   * takes part in the next validation with no re-composition.
   */
  readonly validators: {
    register(validator: GraphValidator): Result<GraphValidator, SdkIssues>;
  };
  /** Contributes an importer for one document format. */
  readonly importers: {
    register(importer: Importer): Result<Importer, SdkIssues>;
  };
  /** Contributes an exporter for one document format. */
  readonly exporters: {
    register(exporter: Exporter): Result<Exporter, SdkIssues>;
  };
  /** Contributes a declarative dialog the UI state may open by id. */
  readonly dialogs: {
    register(dialog: DialogDefinition): Result<DialogDefinition, SdkIssues>;
  };
  /** Contributes a graph placement strategy the host may select. */
  readonly layoutStrategies: {
    register(strategy: GraphLayoutStrategy): Result<GraphLayoutStrategy, SdkIssues>;
  };
  /**
   * Binds an opaque presentation value to a renderer slot.
   *
   * The SDK never inspects the value; a binding is recorded as a contribution
   * only through its diagnostics, never in `contributionIds`.
   */
  readonly renderers: {
    bind(kind: RendererKind, id: string, value: unknown): Result<void, SdkIssues>;
  };
}

/** One plugin: a stable identity, a version and its contributions. */
export interface BuilderPlugin {
  /** Globally qualified id, e.g. `vendor.feature-name`. Installed once per builder. */
  readonly id: string;
  /** Version of the plugin itself, semver-shaped. */
  readonly version: string;
  /**
   * Contributes definitions through the api.
   *
   * A throw is caught and reported as `sdk.plugin-invalid`; it never escapes
   * `use()`.
   */
  readonly install: (api: BuilderPluginApi) => void;
}

/** What installing one plugin produced. */
export interface PluginInstallation {
  readonly pluginId: string;
  readonly version: string;
  /** Contribution ids in the order the plugin registered them. */
  readonly contributionIds: readonly string[];
}

/** Shape of a semver version, matching the document version convention. */
const PLUGIN_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Plugin ids installed per builder.
 *
 * An id counts as installed as soon as `install` runs, whatever the plugin did:
 * its contributions may already be registered, so re-running it would only
 * produce duplicates. A builder is long-lived, so a `WeakMap` keyed by it is
 * enough and leaks nothing when the host drops the builder.
 */
const installedPlugins = new WeakMap<Builder, Set<string>>();

/** Contributions and failures of one installation attempt. */
interface PluginRecorder {
  readonly contributionIds: string[];
  readonly failures: SdkIssue[];
  /**
   * Failure groups awaiting announcement, one per failed contribution.
   *
   * They are held until the install returns, because a throw that aborts the
   * plugin must produce exactly one event and supersede them: the host is told
   * why the plugin stopped, not every step on the way.
   */
  readonly announcements: SdkIssues[];
}

/** Builds one SDK issue. */
function pluginIssue(
  code: SdkIssueCode,
  message: string,
  options: SdkIssueOptions = {},
): SdkIssue {
  return { ...sdkError(code, message, options), severity: "error" };
}

/** Message of a thrown value, whatever the plugin threw. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Set of plugin ids already installed on a builder. */
function installedOn(builder: Builder): Set<string> {
  const existing = installedPlugins.get(builder);
  if (existing !== undefined) {
    return existing;
  }
  const created = new Set<string>();
  installedPlugins.set(builder, created);
  return created;
}

/** Every reason a plugin cannot be installed, checked before `install` runs. */
function pluginIssues(plugin: BuilderPlugin): SdkIssue[] {
  if (!isPlainObject(plugin)) {
    return [
      pluginIssue(
        "sdk.plugin-invalid",
        `A plugin must be an object declaring id, version and install; received ${describeValue(plugin)}`,
        { path: ["plugin"] },
      ),
    ];
  }

  const issues: SdkIssue[] = [];
  if (typeof plugin.id !== "string") {
    issues.push(
      pluginIssue(
        "sdk.plugin-invalid",
        `Plugin id must be a string; received ${describeValue(plugin.id)}`,
        { path: ["id"] },
      ),
    );
  } else if (!isQualifiedId(plugin.id)) {
    issues.push(
      pluginIssue(
        "sdk.plugin-invalid",
        `Plugin id "${plugin.id}" must be globally qualified, e.g. "vendor.feature-name"`,
        { path: ["id"], metadata: { value: plugin.id } },
      ),
    );
  }
  if (typeof plugin.version !== "string") {
    issues.push(
      pluginIssue(
        "sdk.plugin-invalid",
        `Plugin version must be a string; received ${describeValue(plugin.version)}`,
        { path: ["version"] },
      ),
    );
  } else if (!PLUGIN_VERSION_PATTERN.test(plugin.version)) {
    issues.push(
      pluginIssue(
        "sdk.plugin-invalid",
        `Plugin version "${plugin.version}" must be semver-shaped (major.minor.patch)`,
        { path: ["version"], metadata: { value: plugin.version } },
      ),
    );
  }
  if (typeof plugin.install !== "function") {
    issues.push(
      pluginIssue(
        "sdk.plugin-invalid",
        `Plugin install must be a function; received ${describeValue(plugin.install)}`,
        { path: ["install"] },
      ),
    );
  }
  return issues;
}

/** Announces one failure group once: its combined message and its first code. */
function emitFailure(builder: Builder, pluginId: string, issues: SdkIssues): void {
  const first = issues[0];
  builder.events.emitSdk("plugin.error", {
    pluginId,
    message: issues.map((issue) => issue.message).join("; "),
    code: first === undefined ? "sdk.plugin-invalid" : first.code,
  });
}

/**
 * Builds the api one installation receives.
 *
 * Every slot goes through the builder method of the same name, so a plugin is
 * subject to exactly the validation, registry rules and renderer bindings a
 * host is — and reports its contributions without any of them going through a
 * private path.
 */
function createPluginApi(
  builder: Builder,
  plugin: BuilderPlugin,
  recorder: PluginRecorder,
): BuilderPluginApi {
  function record<TContribution>(
    registered: Result<TContribution, SdkIssues>,
    identity: (contribution: TContribution) => string,
  ): Result<TContribution, SdkIssues> {
    if (registered.ok) {
      recorder.contributionIds.push(identity(registered.value));
      return registered;
    }
    recorder.failures.push(...registered.error);
    recorder.announcements.push(registered.error);
    return registered;
  }

  return {
    // Definitions are contributed and read back in the §9 vocabulary
    // (`type`), the rest of the slots in the core one (`id`).
    nodes: { register: (input) => record(builder.registerNode(input), (node) => node.type) },
    edges: { register: (input) => record(builder.registerEdge(input), (edge) => edge.type) },
    properties: {
      register: (input) => record(builder.registerProperty(input), (entry) => entry.id),
    },
    panels: { register: (panel) => record(builder.registerPanel(panel), (entry) => entry.id) },
    tools: { register: (tool) => record(builder.registerTool(tool), (entry) => entry.id) },
    themes: {
      register: (input) => record(builder.theme.register(input), (entry) => entry.id),
    },
    layouts: {
      register: (layout) => record(builder.layout.register(layout), (entry) => entry.id),
    },
    validators: {
      register: (validator) =>
        record(builder.validators.register(validator), (entry) => entry.id),
    },
    importers: {
      register: (importer) => record(builder.importers.register(importer), (entry) => entry.id),
    },
    exporters: {
      register: (exporter) => record(builder.exporters.register(exporter), (entry) => entry.id),
    },
    dialogs: {
      register: (dialog) => record(builder.dialogs.register(dialog), (entry) => entry.id),
    },
    layoutStrategies: {
      register: (strategy) => record(builder.graphLayout.register(strategy), (entry) => entry.id),
    },
    renderers: {
      bind(kind, id, value) {
        const bound = builder.bindRenderer(kind, id, value);
        if (bound.ok) {
          return ok(undefined);
        }
        // `bindRenderer` already reports `SdkIssues`, the single error shape of
        // the public surface, so the plugin api never exposes `SdkError`.
        recorder.failures.push(...bound.error);
        recorder.announcements.push(bound.error);
        return err(bound.error);
      },
    },
  };
}

/**
 * Installs one plugin into a builder.
 *
 * Fail-closed: nothing runs for a plugin that is rejected. Every failure of a
 * running install is returned together, and announced through `plugin.error`
 * with the one-event-per-failed-plugin rule: a throw aborts the plugin and is
 * the single event it produces, while a completed install emits one event per
 * failed contribution. A successful install announces exactly one
 * `plugin.registered` event with its contribution ids.
 */
export function installPlugin(
  builder: Builder,
  plugin: BuilderPlugin,
): Result<PluginInstallation, SdkIssues> {
  const issues = pluginIssues(plugin);
  if (issues.length > 0) {
    return err(issues);
  }

  const installed = installedOn(builder);
  if (installed.has(plugin.id)) {
    return err([
      pluginIssue(
        "sdk.plugin-conflict",
        `Plugin "${plugin.id}" is already installed; a plugin id is installed once per builder`,
        { path: ["id"], metadata: { value: plugin.id } },
      ),
    ]);
  }
  installed.add(plugin.id);

  const recorder: PluginRecorder = { contributionIds: [], failures: [], announcements: [] };
  let thrown: SdkIssue | undefined;
  try {
    plugin.install(createPluginApi(builder, plugin, recorder));
  } catch (error) {
    thrown = pluginIssue(
      "sdk.plugin-invalid",
      `Plugin "${plugin.id}" threw during install: ${messageOf(error)}`,
      { metadata: { value: plugin.id } },
    );
    recorder.failures.push(thrown);
  }

  if (thrown !== undefined) {
    // The throw aborted the install; it is the one failure the host is told
    // about, whatever contributions had already reported their own.
    emitFailure(builder, plugin.id, [thrown]);
  } else {
    for (const announcement of recorder.announcements) {
      emitFailure(builder, plugin.id, announcement);
    }
  }

  if (recorder.failures.length > 0) {
    return err(recorder.failures);
  }

  const installation: PluginInstallation = {
    pluginId: plugin.id,
    version: plugin.version,
    contributionIds: recorder.contributionIds,
  };
  builder.events.emitSdk("plugin.registered", installation);
  return ok(installation);
}
