/**
 * Contribution withdrawal: one removal surface per declared contribution kind.
 *
 * The manager uninstalls a plugin by withdrawing the contributions its manifest
 * *declares*, because the SDK installation result reports contribution ids
 * without their kind (D13). Each declared kind therefore maps to exactly one
 * builder surface, and `renderers` maps to none: a renderer binding attaches an
 * opaque value to a slot and is not a contribution, so uninstall never removes
 * it.
 *
 * Removal is best effort by contract: the manager keeps going after a failure so
 * one already-removed definition cannot block the rest of the withdrawal, and
 * every failure is reported as a plugin diagnostic on the returned record.
 */
import type { PluginIssues, PluginManifest } from "../plugin-api/index.js";
import type { Builder } from "../builder/builder.js";
/**
 * Withdraws every declared contribution of one plugin, in reverse declaration
 * order, and returns the failures.
 *
 * Reverse order undoes the plugin's own registration order, so a plugin that
 * depends on a previously registered contribution of its own is withdrawn
 * safely. A failure never stops the withdrawal.
 */
export declare function removeContributions(builder: Builder, pluginId: string, manifest: PluginManifest): PluginIssues;
//# sourceMappingURL=contribution-removal.d.ts.map