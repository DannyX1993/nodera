/**
 * Feature resolution of a builder configuration.
 *
 * A host names the capabilities it wants; the builder only advertises what it
 * actually implements. Accepting a flag the SDK cannot honour would be a lie
 * (AGENTS.md §13), so an enabled but unsupported feature is a hard failure
 * while announcing its absence (`false`) is a legitimate, silent no-op.
 */

import { err, ok, type Result } from "@nodera/contracts";
import { sdkError, type SdkIssue, type SdkIssues } from "../errors.js";

/** Capabilities the builder implements today, and therefore accepts. */
export const SUPPORTED_FEATURES = ["minimap", "history", "validation"] as const;

/** One capability a host may request. */
export type BuilderFeature = (typeof SUPPORTED_FEATURES)[number];

/**
 * Feature flags as the host declares them.
 *
 * Deliberately open: any key is accepted at the type level so a configuration
 * written against a future SDK still type-checks, and the runtime reports the
 * keys this SDK cannot implement instead of silently ignoring them.
 */
export interface BuilderFeaturesInput {
  readonly [feature: string]: boolean | undefined;
}

/** Every supported feature with its resolved flag. */
export type ResolvedFeatures = Readonly<Record<BuilderFeature, boolean>>;

const DEFAULT_FEATURES: ResolvedFeatures = Object.freeze({
  minimap: true,
  history: true,
  validation: true,
});

function isSupportedFeature(feature: string): feature is BuilderFeature {
  return (SUPPORTED_FEATURES as readonly string[]).includes(feature);
}

/**
 * Resolves the requested feature flags.
 *
 * Supported flags keep the declared value (default: enabled). A key this SDK
 * does not implement is rejected only when the host enables it: reporting the
 * same diagnostic for `grouping: false` would punish a caller that explicitly
 * asked for the absence of the capability.
 */
export function resolveFeatures(
  input: BuilderFeaturesInput = {},
): Result<ResolvedFeatures, SdkIssues> {
  const issues: SdkIssue[] = [];
  const resolved: Record<BuilderFeature, boolean> = { ...DEFAULT_FEATURES };

  for (const [feature, value] of Object.entries(input)) {
    if (!isSupportedFeature(feature)) {
      if (value === true) {
        issues.push({
          ...sdkError(
            "sdk.feature-unsupported",
            `Feature "${feature}" is not implemented by this SDK; ` +
              `supported features are: ${SUPPORTED_FEATURES.join(", ")}`,
            { path: ["features", feature], metadata: { feature } },
          ),
          severity: "error",
        });
      }
      continue;
    }
    if (value !== undefined) {
      resolved[feature] = value;
    }
  }

  return issues.length > 0 ? err(issues) : ok(resolved);
}
