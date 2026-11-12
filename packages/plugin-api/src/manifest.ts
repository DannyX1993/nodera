import type { PluginContribution } from "./contributions.js";

/**
 * Plugin manifest: the declarative contract every plugin ships.
 *
 * FASE7: a plugin declares id, name, version, description, author,
 * dependencies, compatibility, contributions and (when applicable) permissions.
 * The manifest is pure data — no functions, no components — so it can be
 * validated, compared and reported without running third-party code.
 */

/** Author of a plugin. */
export interface PluginAuthor {
  readonly name: string;
  readonly email?: string;
  readonly url?: string;
}

/** A plugin the declaring plugin depends on. */
export interface PluginDependency {
  /** Globally qualified id of the dependency. */
  readonly id: string;
  /** Optional semver range the installed dependency must satisfy. */
  readonly version?: string;
}

/** Compatibility the plugin declares against the host SDK and document. */
export interface PluginCompatibility {
  /** Semver range of the SDK the plugin was authored against. */
  readonly sdkVersion?: string;
  /** Document format the plugin targets, e.g. `"ggd"`. */
  readonly documentFormat?: string;
  /** Document version or range the plugin targets. */
  readonly documentVersion?: string;
  /** Definition versions the plugin contributes or consumes, keyed by definition id. */
  readonly definitionVersions?: Readonly<Record<string, string>>;
}

/**
 * Declarative permissions a plugin requests.
 *
 * These are declarations only: they record what a plugin says it needs, and
 * the host decides what to grant. Declaring a permission never grants it.
 */
export interface PluginPermissions {
  /** The plugin declares it needs network access. */
  readonly network?: boolean;
  /** The plugin declares it needs persistent storage. */
  readonly storage?: boolean;
}

/** The manifest a plugin is distributed with. */
export interface PluginManifest {
  /** Globally qualified id, e.g. `vendor.feature-name`. */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Semver version of the plugin itself. */
  readonly version: string;
  /** Optional human-readable description. */
  readonly description?: string;
  /** Optional author. */
  readonly author?: PluginAuthor;
  /** Optional plugins this plugin depends on. */
  readonly dependencies?: readonly PluginDependency[];
  /** Optional host/document compatibility declaration. */
  readonly compatibility?: PluginCompatibility;
  /** Optional declared contributions, for pre-flight conflict detection. */
  readonly contributions?: readonly PluginContribution[];
  /** Optional declared permissions. */
  readonly permissions?: PluginPermissions;
}
