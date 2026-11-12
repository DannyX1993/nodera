import type { PluginManifest } from "./manifest.js";

/**
 * Plugin lifecycle contract.
 *
 * The manager drives a plugin through the FASE7 lifecycle
 * (discover → resolve → validate → register → activate → deactivate →
 * unregister); this module declares the states a plugin can be in and the
 * hooks a plugin can implement.
 */

/** One state of a plugin across the lifecycle. */
export type PluginState =
  | "discovered"
  | "resolved"
  | "validated"
  | "registered"
  | "active"
  | "inactive"
  | "unregistered"
  | "error";

/** What a plugin receives when one of its lifecycle hooks runs. */
export interface PluginContext<TApi = unknown> {
  /** The manifest the plugin was loaded with. */
  readonly manifest: PluginManifest;
  /** The contribution surface, provided by the host SDK. */
  readonly api: TApi;
}

/**
 * A manifest-declared plugin, generic over the contribution surface it targets.
 *
 * The concrete `TApi` is the host SDK's contribution surface (its
 * `PluginApi`); the plugin contract stays independent of any SDK by leaving it
 * generic, so the same contract serves a future non-SDK host.
 */
export interface PluginDefinition<TApi = unknown> {
  readonly manifest: PluginManifest;
  /** Registers the plugin's contributions and marks it active. Synchronous. */
  activate(ctx: PluginContext<TApi>): void;
  /** Optional cleanup the plugin performs when it is deactivated. Synchronous. */
  deactivate?(ctx: PluginContext<TApi>): void;
}
