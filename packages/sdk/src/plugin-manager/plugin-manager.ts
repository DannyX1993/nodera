/**
 * The plugin lifecycle manager (S4, S5, D11): infrastructure over the SDK.
 *
 * It runs the FASE7 lifecycle for a host-selected set of plugins, in the fixed
 * order discover → resolve → validate → register → activate, and then drives
 * deactivation and uninstallation per plugin. Three rules shape it:
 *
 * - Fail closed. Validation, dependency resolution, compatibility and conflict
 *   detection all run before any plugin code, so a rejected set leaves the
 *   builder and the manager untouched. Only a failure of `activate` itself —
 *   third-party code the host chose to run — can happen halfway.
 * - Keep what worked. A plugin whose activation throws stays registered in
 *   state `error`, and the contributions it managed to register remain; that is
 *   the Phase 6 rule the SDK applies, and the manager does not undo it.
 * - Register through the public surface only. Contributions reach the builder
 *   through `installPlugin`, so a plugin is subject to exactly the validation,
 *   duplicate detection and event rules a host is (AGENTS.md §9).
 *
 * Everything is synchronous (D12): loading a plugin module is the host's job
 * before it hands the definition over, so the manager can stay deterministic.
 */

import { err, ok, type Result } from "@nodera/contracts";
import type {
  PluginDefinition,
  PluginIssue,
  PluginIssues,
  PluginManifest,
} from "../plugin-api/index.js";
import { pluginIssue } from "../plugin-api/index.js";
import type { Builder } from "../builder/builder.js";
import type { SdkIssue } from "../errors.js";
import { installPlugin, type BuilderPlugin, type BuilderPluginApi } from "../plugin/plugin.js";
import { SDK_VERSION } from "../version.js";
import { checkCompatibility } from "./compatibility.js";
import { removeContributions } from "./contribution-removal.js";
import { detectPluginConflicts } from "./conflict-detector.js";
import { resolveDependencyOrder } from "./dependency-resolver.js";
import { validatePluginManifest } from "./manifest-validator.js";
import {
  PluginRegistry,
  toRecord,
  type InstalledPlugin,
  type PluginRecord,
} from "./plugin-records.js";

export type { PluginRecord } from "./plugin-records.js";

/** Host facts a plugin's compatibility declaration is checked against (D11). */
export interface PluginManagerOptions {
  /** Version of the SDK this host runs, e.g. `"1.4.0"`. */
  readonly sdkVersion?: string;
  /** Document format this host reads and writes, e.g. `"ggd"`. */
  readonly documentFormat?: string;
  /** Document version this host reads and writes, e.g. `"1.0.0"`. */
  readonly documentVersion?: string;
}

/** Install, withdrawal and inspection surface of one manager (D11). */
export interface PluginManager {
  /**
   * Installs one discovered set: discover, resolve, validate, register and
   * activate, in that order and synchronously.
   *
   * A failure before registration aborts the whole call without running any
   * plugin code. An activation failure stops the call after storing the failed
   * plugin in state `error`.
   */
  install(
    plugins: readonly PluginDefinition<BuilderPluginApi>[],
  ): Result<readonly PluginRecord[], PluginIssues>;
  /** Runs the plugin's deactivation hook and marks it `inactive`. */
  deactivate(pluginId: string): Result<PluginRecord, PluginIssues>;
  /**
   * Withdraws the plugin's declared contributions and forgets it.
   *
   * The returned record carries the removal failures, if any: a failure never
   * stops the withdrawal or the unregistration.
   */
  uninstall(pluginId: string): Result<PluginRecord, PluginIssues>;
  /** One installed plugin, or `undefined` when this manager does not hold it. */
  get(pluginId: string): PluginRecord | undefined;
  /** Every installed plugin, in installation order. */
  list(): readonly PluginRecord[];
}

/** One accepted definition, paired with the manifest that was validated for it. */
interface CandidatePlugin {
  readonly definition: PluginDefinition<BuilderPluginApi>;
  readonly manifest: PluginManifest;
}

/** Message of a thrown value, whatever the plugin threw. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether a host-provided value is shaped like a plugin definition.
 *
 * The manager receives a set the host assembled (possibly from host
 * configuration), so it checks the two members it needs before reading either.
 */
function isDefinition(value: unknown): value is PluginDefinition<BuilderPluginApi> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { readonly manifest?: unknown; readonly activate?: unknown };
  return (
    typeof candidate.manifest === "object" &&
    candidate.manifest !== null &&
    typeof candidate.activate === "function"
  );
}

/** Prefixes validator paths with the index of the definition they came from. */
function withPluginPath(issues: PluginIssues, index: number): PluginIssues {
  return issues.map((issue) =>
    pluginIssue(issue.code, issue.message, {
      path: ["plugins", String(index), ...(issue.path ?? [])],
      severity: issue.severity,
      ...(issue.metadata === undefined ? {} : { metadata: issue.metadata }),
    }),
  );
}

/** Reports one SDK activation diagnostic in the plugin vocabulary. */
function activationIssue(pluginId: string, issue: SdkIssue): PluginIssue {
  return pluginIssue("plugin.activation-failed", issue.message, {
    metadata: {
      pluginId,
      sdkCode: issue.code,
      ...(issue.metadata === undefined ? {} : { sdkMetadata: issue.metadata }),
    },
    ...(issue.path === undefined ? {} : { path: issue.path }),
  });
}

/**
 * Warnings about contributions the plugin registered but did not declare (D13).
 *
 * The declaration is what makes a contribution removable, so an undeclared one
 * is a plugin authoring bug the host must be able to see. It does not stop the
 * plugin: the contribution works, it just cannot be withdrawn by uninstall.
 */
function undeclaredContributionIssues(
  manifest: PluginManifest,
  contributionIds: readonly string[],
): PluginIssues {
  const declared = new Set((manifest.contributions ?? []).map((entry) => entry.id));
  return contributionIds
    .filter((contributionId) => !declared.has(contributionId))
    .map((contributionId) =>
      pluginIssue(
        "plugin.invalid-manifest",
        `Plugin "${manifest.id}" registered contribution "${contributionId}" without declaring it in its manifest; uninstall cannot remove it`,
        {
          severity: "warning",
          metadata: { pluginId: manifest.id, contributionId },
        },
      ),
    );
}

/** Adapts one definition to the SDK contract, capturing the surface it receives. */
function adaptDefinition(
  candidate: CandidatePlugin,
  capture: (api: BuilderPluginApi) => void,
): BuilderPlugin {
  return {
    id: candidate.manifest.id,
    version: candidate.manifest.version,
    install: (api) => {
      capture(api);
      candidate.definition.activate({ manifest: candidate.definition.manifest, api });
    },
  };
}

/** The diagnostic of an unknown plugin id. */
function notFoundIssue(pluginId: string): PluginIssue {
  return pluginIssue("plugin.not-found", `No installed plugin has id "${pluginId}"`, {
    metadata: { pluginId },
  });
}

/**
 * Creates the lifecycle manager of one builder.
 *
 * The manager owns its records: two managers over the same builder are
 * independent lifecycles, and the SDK still refuses to install the same plugin
 * id twice per builder.
 */
export function createPluginManager(
  builder: Builder,
  options: PluginManagerOptions = {},
): PluginManager {
  const registry = new PluginRegistry();

  // The SDK's own version is the compatibility baseline (D5): a host that does
  // not pin another version is assumed to run this exact SDK release, so a
  // manifest's `compatibility.sdkVersion` range is always resolved against a
  // real value. Document format/version stay host facts (no default).
  const hostOptions: PluginManagerOptions = {
    ...options,
    ...(options.sdkVersion === undefined ? { sdkVersion: SDK_VERSION } : {}),
  };

  function install(
    plugins: readonly PluginDefinition<BuilderPluginApi>[],
  ): Result<readonly PluginRecord[], PluginIssues> {
    // a. Discover and validate every manifest before anything else happens.
    const candidates: CandidatePlugin[] = [];
    const invalid: PluginIssue[] = [];
    plugins.forEach((plugin, index) => {
      if (!isDefinition(plugin)) {
        invalid.push(
          pluginIssue(
            "plugin.invalid-manifest",
            `Expected plugin at index ${index} to declare a manifest and an activate function`,
            { path: ["plugins", String(index)] },
          ),
        );
        return;
      }
      const validated = validatePluginManifest(plugin.manifest);
      if (!validated.ok) {
        invalid.push(...withPluginPath(validated.error, index));
        return;
      }
      candidates.push({ definition: plugin, manifest: validated.value });
    });
    if (invalid.length > 0) return err(invalid);

    // b. Resolve dependencies inside the discovered set, dependency-first.
    const ordered = resolveDependencyOrder(candidates.map((entry) => entry.manifest));
    if (!ordered.ok) return err(ordered.error);

    // c. Validate host compatibility of every accepted manifest.
    const incompatibilities = ordered.value.flatMap((manifest) =>
      checkCompatibility(manifest, hostOptions),
    );
    if (incompatibilities.length > 0) return err(incompatibilities);

    // d. Detect conflicts over the validated declarations, before duplicates
    // are collapsed, and against the plugins this manager already holds — which
    // also rejects an id that is already installed.
    const conflicts = detectPluginConflicts([
      ...registry.manifests(),
      ...candidates.map((entry) => entry.manifest),
    ]);
    if (!conflicts.ok) return err(conflicts.error);

    // e. Register and activate, in the resolved order.
    const byId = new Map(candidates.map((entry) => [entry.manifest.id, entry]));
    const records: PluginRecord[] = [];

    for (const manifest of ordered.value) {
      const candidate = byId.get(manifest.id);
      if (candidate === undefined) continue;

      let api: BuilderPluginApi | undefined;
      const installation = installPlugin(
        builder,
        adaptDefinition(candidate, (received) => {
          api = received;
        }),
      );

      if (!installation.ok) {
        const issues = installation.error.map((issue) => activationIssue(manifest.id, issue));
        registry.set({
          definition: candidate.definition,
          manifest,
          state: "error",
          contributionIds: [],
          issues: [],
          ...(api === undefined ? {} : { api }),
        });
        return err(issues);
      }

      const contributionIds = installation.value.contributionIds;
      const installed: InstalledPlugin = {
        definition: candidate.definition,
        manifest,
        state: "active",
        contributionIds,
        issues: undeclaredContributionIssues(manifest, contributionIds),
        ...(api === undefined ? {} : { api }),
      };
      registry.set(installed);
      const record = toRecord(installed);
      records.push(record);
      builder.events.emitSdk("plugin.activated", { pluginId: manifest.id, contributionIds });
    }

    return ok(records);
  }

  function deactivate(pluginId: string): Result<PluginRecord, PluginIssues> {
    const installed = registry.get(pluginId);
    if (installed === undefined) return err([notFoundIssue(pluginId)]);
    if (installed.state !== "active" || installed.api === undefined) {
      return err([
        pluginIssue(
          "plugin.invalid-state",
          `Plugin "${pluginId}" is in state "${installed.state}"; only an active plugin can be deactivated`,
          { metadata: { pluginId, state: installed.state } },
        ),
      ]);
    }

    const context = { manifest: installed.definition.manifest, api: installed.api };
    try {
      installed.definition.deactivate?.(context);
    } catch (error) {
      const issue = pluginIssue(
        "plugin.deactivation-failed",
        `Plugin "${pluginId}" threw during deactivation: ${messageOf(error)}`,
        { metadata: { pluginId } },
      );
      registry.set({ ...installed, state: "error" });
      return err([issue]);
    }

    const deactivated: InstalledPlugin = { ...installed, state: "inactive" };
    registry.set(deactivated);
    builder.events.emitSdk("plugin.deactivated", { pluginId });
    return ok(toRecord(deactivated));
  }

  function uninstall(pluginId: string): Result<PluginRecord, PluginIssues> {
    const installed = registry.get(pluginId);
    if (installed === undefined) return err([notFoundIssue(pluginId)]);

    const issues = removeContributions(builder, pluginId, installed.manifest);
    registry.delete(pluginId);
    const unregistered: InstalledPlugin = { ...installed, state: "unregistered", issues };
    builder.events.emitSdk("plugin.unregistered", { pluginId });
    return ok(toRecord(unregistered));
  }

  return {
    install,
    deactivate,
    uninstall,
    get: (pluginId) => {
      const installed = registry.get(pluginId);
      return installed === undefined ? undefined : toRecord(installed);
    },
    list: () => registry.records(),
  };
}
