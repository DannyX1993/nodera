/**
 * Portable document format version utilities.
 *
 * The document format and every definition/extension version use explicit
 * semver strings so compatibility can be reasoned about portably.
 */

/** Full semantic version, e.g. `1.0.0`. */
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Checks whether a value is a semantic version string. */
export function isValidSemver(value: unknown): value is string {
  return typeof value === "string" && SEMVER_PATTERN.test(value);
}
