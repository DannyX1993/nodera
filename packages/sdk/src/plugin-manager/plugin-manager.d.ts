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
import { type Result } from "@nodera/contracts";
import type { PluginDefinition, PluginIssues } from "../plugin-api/index.js";
import type { Builder } from "../builder/builder.js";
import { type BuilderPluginApi } from "../plugin/plugin.js";
import { type PluginRecord } from "./plugin-records.js";
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
    install(plugins: readonly PluginDefinition<BuilderPluginApi>[]): Result<readonly PluginRecord[], PluginIssues>;
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
/**
 * Creates the lifecycle manager of one builder.
 *
 * The manager owns its records: two managers over the same builder are
 * independent lifecycles, and the SDK still refuses to install the same plugin
 * id twice per builder.
 */
export declare function createPluginManager(builder: Builder, options?: PluginManagerOptions): PluginManager;
//# sourceMappingURL=plugin-manager.d.ts.map