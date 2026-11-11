/**
 * Record store of one plugin manager (D6, D11).
 *
 * The manager is stateful across calls: it keeps one entry per installed plugin
 * so it can answer `get`/`list` and so `deactivate`/`uninstall` revert exactly
 * what that plugin registered. Two things live here that a caller never sees:
 * the plugin's original `PluginDefinition` (its lifecycle hooks are code, not
 * data a manifest can carry) and the contribution surface it received when it
 * activated (a deactivation hook runs with the same surface).
 */

import type {
  PluginDefinition,
  PluginIssues,
  PluginManifest,
  PluginState,
} from "@nodera/plugin-api";
import type { BuilderPluginApi } from "@nodera/sdk";

/** What a host can observe about one installed plugin (D11). */
export interface PluginRecord {
  readonly manifest: PluginManifest;
  /** Where the plugin stands in the lifecycle today. */
  readonly state: PluginState;
  /** Contribution ids the plugin registered, in registration order. */
  readonly contributionIds: readonly string[];
  /**
   * Diagnostics about the record that did not stop it, currently the
   * `plugin.invalid-manifest` warnings of a contribution the plugin registered
   * without declaring it (D13), plus the removal failures of an uninstall.
   */
  readonly issues: PluginIssues;
}

/** A stored plugin, including the state a record deliberately hides. */
export interface InstalledPlugin {
  readonly definition: PluginDefinition<BuilderPluginApi>;
  readonly manifest: PluginManifest;
  readonly state: PluginState;
  readonly contributionIds: readonly string[];
  readonly issues: PluginIssues;
  /**
   * Surface the plugin received when it activated.
   *
   * Absent when no activation ran to completion, which is why `deactivate`
   * refuses a plugin that is not active.
   */
  readonly api?: BuilderPluginApi;
}

/** The record of one stored plugin. */
export function toRecord(installed: InstalledPlugin): PluginRecord {
  return {
    manifest: installed.manifest,
    state: installed.state,
    contributionIds: installed.contributionIds,
    issues: installed.issues,
  };
}

/**
 * Installed plugins of one manager, keyed by plugin id.
 *
 * Insertion order is the installation order, which is what `list()` reports and
 * what makes uninstall deterministic. A stored entry is replaced whole, never
 * mutated, so a record handed to a host never changes under it.
 */
export class PluginRegistry {
  private readonly byId = new Map<string, InstalledPlugin>();

  has(pluginId: string): boolean {
    return this.byId.has(pluginId);
  }

  get(pluginId: string): InstalledPlugin | undefined {
    return this.byId.get(pluginId);
  }

  set(installed: InstalledPlugin): void {
    this.byId.set(installed.manifest.id, installed);
  }

  delete(pluginId: string): boolean {
    return this.byId.delete(pluginId);
  }

  /** Stored plugins, in installation order. */
  entries(): readonly InstalledPlugin[] {
    return [...this.byId.values()];
  }

  /** Manifests of the installed plugins, in installation order. */
  manifests(): readonly PluginManifest[] {
    return this.entries().map((installed) => installed.manifest);
  }

  /** Records of the installed plugins, in installation order. */
  records(): readonly PluginRecord[] {
    return this.entries().map(toRecord);
  }
}
