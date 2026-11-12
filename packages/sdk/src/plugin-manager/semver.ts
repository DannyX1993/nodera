import { isValidSemver } from "@nodera/contracts";

/**
 * Minimal, honest semver support for plugin dependencies (D9).
 *
 * Supported grammar:
 * - absent or `*` — any version
 * - `x.y.z` — exact version
 * - `^x.y.z` — caret: same major, greater than or equal to `x.y.z`
 * - `~x.y.z` — tilde: same minor, greater than or equal to `x.y.z`
 *
 * Any other operator (`>=`, `>`, `||`, hyphen ranges, `x` wildcards) is
 * unrecognized; callers turn that into `plugin.invalid-manifest`.
 *
 * Plugin versions are `major.minor.patch` with an optional prerelease suffix
 * and never build metadata (the same shape Phase 6 used).
 */

/** A parsed semantic version. */
export interface SemverVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** Ordered prerelease identifiers; empty for a release version. */
  readonly prerelease: readonly string[];
}

/** A version range the supported grammar can express. */
export type VersionRange =
  | { readonly kind: "any" }
  | {
      readonly kind: "exact" | "caret" | "tilde";
      readonly version: SemverVersion;
    };

/**
 * Version shape: numeric tuple plus optional prerelease, never build metadata.
 *
 * `isValidSemver` already rejects leading zeros; this pattern adds the
 * "no build metadata" rule so a plugin version stays a stable identifier.
 */
const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Whether a value is a valid plugin/definition version string. */
export function isValidVersion(value: unknown): value is string {
  return isValidSemver(value) && VERSION_PATTERN.test(value);
}

/** Parses a version string, or returns `undefined` when it is not valid. */
export function parseVersion(value: string): SemverVersion | undefined {
  if (!isValidVersion(value)) return undefined;

  const dash = value.indexOf("-");
  const core = dash === -1 ? value : value.slice(0, dash);
  const prerelease = dash === -1 ? [] : value.slice(dash + 1).split(".");
  const [majorText = "", minorText = "", patchText = ""] = core.split(".");

  return {
    major: Number(majorText),
    minor: Number(minorText),
    patch: Number(patchText),
    prerelease,
  };
}

/** Orders two parsed versions by semver precedence. */
export function compareVersions(left: SemverVersion, right: SemverVersion): number {
  const numeric = left.major - right.major || left.minor - right.minor || left.patch - right.patch;
  if (numeric !== 0) return numeric;
  return comparePrerelease(left.prerelease, right.prerelease);
}

/** Parses a range string, or returns `undefined` when the grammar does not support it. */
export function parseVersionRange(value: string | undefined): VersionRange | undefined {
  if (value === undefined || value === "*") return { kind: "any" };
  if (value.startsWith("^")) {
    const version = parseVersion(value.slice(1));
    return version === undefined ? undefined : { kind: "caret", version };
  }
  if (value.startsWith("~")) {
    const version = parseVersion(value.slice(1));
    return version === undefined ? undefined : { kind: "tilde", version };
  }
  const version = parseVersion(value);
  return version === undefined ? undefined : { kind: "exact", version };
}

/**
 * Whether a version satisfies a range.
 *
 * An unrecognized version or range is `false`, never a throw, so a caller can
 * report it as a diagnostic instead of crashing on untrusted input.
 */
export function satisfiesRange(version: string, range: string | undefined): boolean {
  const candidate = parseVersion(version);
  if (candidate === undefined) return false;
  const parsedRange = parseVersionRange(range);
  if (parsedRange === undefined) return false;
  return matchesRange(candidate, parsedRange);
}

/** Whether a parsed version satisfies a parsed range. */
export function matchesRange(version: SemverVersion, range: VersionRange): boolean {
  if (range.kind === "any") return true;
  const base = range.version;

  // A prerelease only satisfies a range that opts into prereleases of exactly
  // the same `major.minor.patch` tuple (npm precedence semantics).
  if (version.prerelease.length > 0) {
    if (base.prerelease.length === 0) return false;
    if (!isSameTuple(version, base)) return false;
  }

  const comparison = compareVersions(version, base);
  switch (range.kind) {
    case "exact":
      return comparison === 0;
    case "caret":
      return version.major === base.major && comparison >= 0;
    case "tilde":
      return version.major === base.major && version.minor === base.minor && comparison >= 0;
  }
}

function isSameTuple(left: SemverVersion, right: SemverVersion): boolean {
  return left.major === right.major && left.minor === right.minor && left.patch === right.patch;
}

function comparePrerelease(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 && right.length === 0) return 0;
  // A release version has higher precedence than its prereleases.
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) return 0;
    if (leftIdentifier === rightIdentifier) continue;

    const leftNumeric = isNumericIdentifier(leftIdentifier);
    const rightNumeric = isNumericIdentifier(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return Number(leftIdentifier) - Number(rightIdentifier);
    }
    // Numeric identifiers rank below alphanumeric ones.
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }

  // Fewer identifiers rank below a longer set when every shared one matched.
  return left.length - right.length;
}

function isNumericIdentifier(value: string): boolean {
  return /^\d+$/.test(value);
}
