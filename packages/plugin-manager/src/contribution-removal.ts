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

import { err, ok, type RegistryError, type Result } from "@nodera/contracts";
import type { PluginContribution, PluginContributionKind, PluginIssue, PluginIssues, PluginManifest } from "@nodera/plugin-api";
import { pluginIssue } from "@nodera/plugin-api";
import type { Builder, SdkIssues } from "@nodera/sdk";

/** Why one removal failed, in the vocabulary the manager reports. */
interface RemovalFailure {
  /** `missing` when the surface holds no such contribution, `rejected` otherwise. */
  readonly reason: "missing" | "rejected";
  readonly message: string;
  readonly sdkCode?: string;
}

/** Outcome of one removal attempt. */
type RemovalResult = Result<unknown, RemovalFailure>;

/** Removes one contribution id through one builder surface. */
type RemovalSurface = (builder: Builder, contributionId: string) => RemovalResult;

/** Normalizes an SDK removal, whose diagnostics are `SdkIssues`. */
function fromSdk(removed: Result<unknown, SdkIssues>): RemovalResult {
  if (removed.ok) return ok(removed.value);
  const first = removed.error[0];
  return err({
    reason: first?.code === "sdk.unknown-definition" ? "missing" : "rejected",
    message: removed.error.map((issue) => issue.message).join("; "),
    ...(first === undefined ? {} : { sdkCode: first.code }),
  });
}

/** Normalizes a core-registry removal, whose error is a `RegistryError`. */
function fromRegistry(removed: Result<unknown, RegistryError>): RemovalResult {
  if (removed.ok) return ok(removed.value);
  return err({
    reason: removed.error.kind === "not-found" ? "missing" : "rejected",
    message: removed.error.message,
  });
}

/**
 * Removal surface of each contribution kind.
 *
 * `undefined` marks a kind that is not stored in a registry: a renderer binding
 * is withdrawn by nobody, which is why it is never declared as removable.
 */
const SURFACES: Readonly<Record<PluginContributionKind, RemovalSurface | undefined>> = {
  node: (builder, id) => fromSdk(builder.registries.nodes.unregister(id)),
  edge: (builder, id) => fromSdk(builder.registries.edges.unregister(id)),
  property: (builder, id) => fromRegistry(builder.properties.unregister(id)),
  panel: (builder, id) => fromRegistry(builder.registries.panels.unregister(id)),
  tool: (builder, id) => fromRegistry(builder.registries.tools.unregister(id)),
  theme: (builder, id) => fromRegistry(builder.registries.themes.unregister(id)),
  layout: (builder, id) => fromRegistry(builder.registries.layouts.unregister(id)),
  validator: (builder, id) => fromSdk(builder.validators.unregister(id)),
  importer: (builder, id) => fromSdk(builder.importers.unregister(id)),
  exporter: (builder, id) => fromSdk(builder.exporters.unregister(id)),
  dialog: (builder, id) => fromSdk(builder.dialogs.unregister(id)),
  "layout-strategy": (builder, id) => fromSdk(builder.graphLayout.unregister(id)),
  renderer: undefined,
};

/** How one failed removal is reported to the host. */
function removalIssue(
  pluginId: string,
  contribution: PluginContribution,
  failure: RemovalFailure,
): PluginIssue {
  const metadata = {
    pluginId,
    contributionId: contribution.id,
    type: contribution.type,
    ...(failure.sdkCode === undefined ? {} : { sdkCode: failure.sdkCode }),
  };
  if (failure.reason === "missing") {
    return pluginIssue(
      "plugin.not-found",
      `Plugin "${pluginId}" declares contribution "${contribution.id}" of type "${contribution.type}" but the builder does not hold it`,
      { metadata },
    );
  }
  return pluginIssue(
    "plugin.deactivation-failed",
    `Contribution "${contribution.id}" of plugin "${pluginId}" could not be removed: ${failure.message}`,
    { metadata },
  );
}

/**
 * Withdraws every declared contribution of one plugin, in reverse declaration
 * order, and returns the failures.
 *
 * Reverse order undoes the plugin's own registration order, so a plugin that
 * depends on a previously registered contribution of its own is withdrawn
 * safely. A failure never stops the withdrawal.
 */
export function removeContributions(
  builder: Builder,
  pluginId: string,
  manifest: PluginManifest,
): PluginIssues {
  const declared = manifest.contributions ?? [];
  const issues: PluginIssue[] = [];

  for (const contribution of [...declared].reverse()) {
    const surface = SURFACES[contribution.type];
    if (surface === undefined) continue;
    const removed = surface(builder, contribution.id);
    if (removed.ok) continue;
    issues.push(removalIssue(pluginId, contribution, removed.error));
  }

  return issues;
}
