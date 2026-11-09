/**
 * Feature resolution of a builder configuration.
 *
 * A host names the capabilities it wants; the builder only advertises what it
 * actually implements. Accepting a flag the SDK cannot honour would be a lie
 * (AGENTS.md §13), so an enabled but unsupported feature is a hard failure
 * while announcing its absence (`false`) is a legitimate, silent no-op.
 */

import { err, ok, type Result } from "@nodera/contracts";
import type { UiStateStore } from "@nodera/ui-core";
import {
  disposedIssue,
  isPlainObject,
  sdkError,
  shapeIssue,
  type SdkIssue,
  type SdkIssues,
} from "../errors.js";

/** Capabilities the builder implements today, and therefore accepts. */
export const SUPPORTED_FEATURES = [
  "minimap",
  "history",
  "validation",
  "edgeInsertion",
] as const;

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

/**
 * Runtime feature API of an assembled builder.
 *
 * The resolved flags stay readable exactly as declared, but the edge
 * insertion affordance is presentation state: the getter reads the UI store,
 * so `builder.features.edgeInsertion` always reflects the current value and
 * `setEdgeInsertion` flips it without a rebuild.
 */
export interface BuilderFeaturesApi {
  readonly minimap: boolean;
  readonly history: boolean;
  readonly validation: boolean;
  /** Reactive: reads the UI store seeded from the declared flag. */
  readonly edgeInsertion: boolean;
  /**
   * Enables or disables the per-edge "+" at runtime.
   *
   * Returns the applied value, or `sdk.disposed` on a disposed builder and
   * `sdk.invalid-input` at `features.edgeInsertion` for a non-boolean; a
   * refused call leaves the stored state untouched.
   */
  setEdgeInsertion(enabled: boolean): Result<boolean, SdkIssues>;
}

/**
 * Binds the resolved flags to the builder's UI store.
 *
 * `isDisposed` is the builder's own disposed flag, so the runtime setter
 * refuses with the same `sdk.disposed` diagnostic as every other mutation
 * after `dispose`.
 */
export function createFeaturesApi(
  resolved: ResolvedFeatures,
  store: UiStateStore,
  isDisposed: () => boolean,
): BuilderFeaturesApi {
  return {
    minimap: resolved.minimap,
    history: resolved.history,
    validation: resolved.validation,
    get edgeInsertion(): boolean {
      return store.getState().edgeInsertion;
    },
    setEdgeInsertion(enabled: boolean): Result<boolean, SdkIssues> {
      if (isDisposed()) {
        return err([disposedIssue("features.setEdgeInsertion")]);
      }
      if (typeof enabled !== "boolean") {
        return err([
          shapeIssue(
            'Feature "edgeInsertion" must be a boolean',
            enabled,
            ["features", "edgeInsertion"],
          ),
        ]);
      }
      store.setEdgeInsertion(enabled);
      return ok(enabled);
    },
  };
}

const DEFAULT_FEATURES: ResolvedFeatures = Object.freeze({
  minimap: true,
  history: true,
  validation: true,
  // Off by default: the affordance adds a control to the canvas, so the host
  // that wants it says so (`features: { edgeInsertion: true }`) instead of
  // discovering a button on every edge of every graph.
  edgeInsertion: false,
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
 * asked for the absence of the capability. A flag that is not a boolean is
 * malformed data, never a truthy value.
 */
export function resolveFeatures(
  input: BuilderFeaturesInput = {},
): Result<ResolvedFeatures, SdkIssues> {
  if (!isPlainObject(input)) {
    return err([
      shapeIssue("Builder features must be an object of booleans", input, ["features"]),
    ]);
  }

  const issues: SdkIssue[] = [];
  const resolved: Record<BuilderFeature, boolean> = { ...DEFAULT_FEATURES };

  for (const [feature, value] of Object.entries(input)) {
    if (value !== undefined && typeof value !== "boolean") {
      issues.push(
        shapeIssue(`Feature "${feature}" must be a boolean`, value, ["features", feature]),
      );
      continue;
    }
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
    if (typeof value === "boolean") {
      resolved[feature] = value;
    }
  }

  return issues.length > 0 ? err(issues) : ok(resolved);
}
