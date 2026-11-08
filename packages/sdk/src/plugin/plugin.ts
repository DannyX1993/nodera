/**
 * The plugin authoring contract of the SDK (Phase 6).
 *
 * A plugin is a third party that contributes definitions to a builder through
 * one narrow api: nodes, edges, properties, panels, tools, themes, layouts and
 * opaque renderer bindings. Installation is synchronous and additive — no
 * manifest, no dependency resolution and no activation lifecycle, which belong
 * to a later phase. What this module owns is the *contract*: which id and
 * version a plugin must declare, what happens to a contribution that fails, and
 * what the host can observe afterwards.
 *
 * Two rules shape the implementation:
 *
 * - Fail before running anything. An invalid id or version, or an id that is
 *   already installed, is reported without calling `install` at all, so a
 *   rejected plugin can never leave a half-registration behind.
 * - Keep what worked, report what did not. A contribution that fails does not
 *   undo the plugin's successful ones; every failure is collected in the
 *   returned issues *and* announced once through `plugin.error`. Only a
 *   completely successful install announces `plugin.registered`.
 *
 * Renderer bindings are not contributions: `renderers.bind` attaches an opaque
 * value to an existing slot and therefore never appears in `contributionIds`.
 */

import { err, ok, type Result } from "@nodera/contracts";
import type { EdgeDefinition } from "@nodera/edge-registry";
import type { NodeDefinition } from "@nodera/node-registry";
import type { PropertyDefinition } from "@nodera/property-system";
import type { CreateThemeInput, ThemeDefinition } from "@nodera/theme-engine";
import type { LayoutDefinition, PanelDefinition, ToolDefinition } from "@nodera/ui-core";
import type { RendererKind } from "../adapter/renderer-bindings.js";
import type { EdgeDefinitionInput } from "../authoring/edges.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import type { PropertyInput } from "../authoring/properties.js";
import type { Builder } from "../builder/builder.js";
import {
  isQualifiedId,
  sdkError,
  toIssues,
  type SdkIssue,
  type SdkIssues,
  type SdkIssueCode,
  type SdkIssueOptions,
} from "../errors.js";

/** Registration slots a plugin can contribute to. Deliberately not extensible. */
export interface BuilderPluginApi {
  readonly nodes: {
    register(input: NodeDefinitionInput): Result<NodeDefinition, SdkIssues>;
  };
  readonly edges: {
    register(input: EdgeDefinitionInput): Result<EdgeDefinition, SdkIssues>;
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
  const issues: SdkIssue[] = [];
  if (!isQualifiedId(plugin.id)) {
    issues.push(
      pluginIssue(
        "sdk.plugin-invalid",
        `Plugin id "${plugin.id}" must be globally qualified, e.g. "vendor.feature-name"`,
        { path: ["id"], metadata: { value: plugin.id } },
      ),
    );
  }
  if (!PLUGIN_VERSION_PATTERN.test(plugin.version)) {
    issues.push(
      pluginIssue(
        "sdk.plugin-invalid",
        `Plugin version "${plugin.version}" must be semver-shaped (major.minor.patch)`,
        { path: ["version"], metadata: { value: plugin.version } },
      ),
    );
  }
  return issues;
}

/** Announces one failed contribution once, with its combined message. */
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
  function record<TDefinition extends { readonly id: string }>(
    registered: Result<TDefinition, SdkIssues>,
  ): Result<TDefinition, SdkIssues> {
    if (registered.ok) {
      recorder.contributionIds.push(registered.value.id);
      return registered;
    }
    recorder.failures.push(...registered.error);
    emitFailure(builder, plugin.id, registered.error);
    return registered;
  }

  return {
    nodes: { register: (input) => record(builder.registerNode(input)) },
    edges: { register: (input) => record(builder.registerEdge(input)) },
    properties: { register: (input) => record(builder.registerProperty(input)) },
    panels: { register: (panel) => record(builder.registerPanel(panel)) },
    tools: { register: (tool) => record(builder.registerTool(tool)) },
    themes: { register: (input) => record(builder.theme.register(input)) },
    layouts: { register: (layout) => record(builder.layout.register(layout)) },
    renderers: {
      bind(kind, id, value) {
        const bound = builder.bindRenderer(kind, id, value);
        if (bound.ok) {
          return ok(undefined);
        }
        const issues = toIssues(bound.error);
        recorder.failures.push(...issues);
        emitFailure(builder, plugin.id, issues);
        return err(issues);
      },
    },
  };
}

/**
 * Installs one plugin into a builder.
 *
 * Fail-closed: nothing runs for a plugin that is rejected, and every failure of
 * a running install is returned together. A successful install announces
 * exactly one `plugin.registered` event with its contribution ids.
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

  const recorder: PluginRecorder = { contributionIds: [], failures: [] };
  try {
    plugin.install(createPluginApi(builder, plugin, recorder));
  } catch (error) {
    recorder.failures.push(
      pluginIssue(
        "sdk.plugin-invalid",
        `Plugin "${plugin.id}" threw during install: ${messageOf(error)}`,
        { metadata: { value: plugin.id } },
      ),
    );
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
