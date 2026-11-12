/**
 * `@nodera/plugin-manager` has been folded into `@nodera/sdk`.
 *
 * The manager (manifest validation, dependency resolution, conflict detection
 * and the install/activate/retire lifecycle) now lives in
 * `packages/sdk/src/plugin-manager/` and is re-exported from the SDK barrel.
 * Folding it removed the `@nodera/sdk ↔ @nodera/plugin-manager` cycle: the
 * manager always ran *over* the SDK surface, so the two belong to one artifact.
 * This package stays in the workspace as a private, unpublished shell: its
 * manifest keeps the workspace graph and the turbo task graph unchanged, and
 * nothing is exported here on purpose — an import of `@nodera/plugin-manager`
 * must fail loudly instead of resolving to a stale copy of code the SDK owns.
 */

export {};
