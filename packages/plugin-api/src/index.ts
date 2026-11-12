/**
 * `@nodera/plugin-api` has been folded into `@nodera/sdk`.
 *
 * The plugin contracts (manifest, contributions, lifecycle and diagnostics) now
 * live in `packages/sdk/src/plugin-api/` and are re-exported from the SDK
 * barrel, so a plugin or a host imports them from `@nodera/sdk` and nowhere
 * else. This package stays in the workspace as a private, unpublished shell:
 * its manifest keeps the workspace graph and the turbo task graph unchanged,
 * and nothing is exported here on purpose — an import of
 * `@nodera/plugin-api` must fail loudly instead of resolving to a stale copy of
 * contracts the SDK now owns.
 */

export {};
