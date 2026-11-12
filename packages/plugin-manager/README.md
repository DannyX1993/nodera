# @nodera/plugin-manager (moved)

**This package is internal and no longer publishes anything.** The plugin manager
moved into [`@nodera/sdk`](../sdk/README.md), where a host imports it like the
rest of the public surface.

The code lives in `packages/sdk/src/plugin-manager/` and is re-exported from the
SDK barrel:

```ts
import {
  createPluginManager,
  detectPluginConflicts,
  resolveDependencyOrder,
  validatePluginManifest,
  type PluginManager,
  type PluginRecord,
} from "@nodera/sdk";
```

| What moved | Where it lives now |
| --- | --- |
| `validatePluginManifest` | `packages/sdk/src/plugin-manager/manifest-validator.ts` |
| `resolveDependencyOrder`, version ranges | `packages/sdk/src/plugin-manager/dependency-resolver.ts`, `semver.ts` |
| `detectPluginConflicts` | `packages/sdk/src/plugin-manager/conflict-detector.ts` |
| `createPluginManager`, `PluginManager`, `PluginRecord` | `packages/sdk/src/plugin-manager/plugin-manager.ts`, `plugin-records.ts` |
| contribution withdrawal | `packages/sdk/src/plugin-manager/contribution-removal.ts` |
| host compatibility check | `packages/sdk/src/plugin-manager/compatibility.ts` |

The behaviour is unchanged and the suites moved with the code, so they now run
inside `packages/sdk` (`pnpm --filter @nodera/sdk test`).

Why it moved: the manager only ever composed the *public* SDK surface
(`installPlugin`, the builder's unregister surfaces, the plugin events), so it was
infrastructure over an artifact that already owned the contract — a separate
published package meant a cycle (`sdk ↔ plugin-manager`) and a second public
import path for hosts. Folding it into `@nodera/sdk` removed both.

`packages/plugin-manager` itself stays in the workspace as a private shell so the
workspace and turbo graphs stay unchanged; `src/index.ts` exports nothing on
purpose, so an import of the old specifier fails loudly instead of resolving to
a stale copy of code the SDK now owns.

The authoring guide — security model, lifecycle, contribution withdrawal and the
known limitations — is [`docs/PLUGINS.md`](../../docs/PLUGINS.md).
