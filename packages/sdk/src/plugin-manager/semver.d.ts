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
export type VersionRange = {
    readonly kind: "any";
} | {
    readonly kind: "exact" | "caret" | "tilde";
    readonly version: SemverVersion;
};
/** Whether a value is a valid plugin/definition version string. */
export declare function isValidVersion(value: unknown): value is string;
/** Parses a version string, or returns `undefined` when it is not valid. */
export declare function parseVersion(value: string): SemverVersion | undefined;
/** Orders two parsed versions by semver precedence. */
export declare function compareVersions(left: SemverVersion, right: SemverVersion): number;
/** Parses a range string, or returns `undefined` when the grammar does not support it. */
export declare function parseVersionRange(value: string | undefined): VersionRange | undefined;
/**
 * Whether a version satisfies a range.
 *
 * An unrecognized version or range is `false`, never a throw, so a caller can
 * report it as a diagnostic instead of crashing on untrusted input.
 */
export declare function satisfiesRange(version: string, range: string | undefined): boolean;
/** Whether a parsed version satisfies a parsed range. */
export declare function matchesRange(version: SemverVersion, range: VersionRange): boolean;
//# sourceMappingURL=semver.d.ts.map