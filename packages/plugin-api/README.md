# @nodera/plugin-api (moved)

**This package is internal and no longer publishes anything.** The plugin
contracts moved into [`@nodera/sdk`](../sdk/README.md), where a plugin and a host
import them like the rest of the public surface.

The code lives in `packages/sdk/src/plugin-api/` and is re-exported from the SDK
barrel:

```ts
import type {
  PluginDefinition,
  PluginManifest,
  PluginContribution,
  PluginIssue,
} from "@nodera/sdk";
import { isPluginId, pluginIssue } from "@nodera/sdk";
```

| What moved | Where it lives now |
| --- | --- |
| `PluginManifest`, `PluginAuthor`, `PluginDependency`, `PluginCompatibility`, `PluginPermissions` | `packages/sdk/src/plugin-api/manifest.ts` |
| `PluginContribution`, `PluginContributionKind` | `packages/sdk/src/plugin-api/contributions.ts` |
| `PluginContext`, `PluginDefinition`, `PluginState` | `packages/sdk/src/plugin-api/lifecycle.ts` |
| `PLUGIN_ERROR_CODES`, `PluginIssue(s)`, `pluginIssue` | `packages/sdk/src/plugin-api/errors.ts` |
| `isPluginId` | `packages/sdk/src/plugin-api/ids.ts` |

Why it moved: `@nodera/plugin-manager` always depended on `@nodera/sdk` (it
installs plugins over the builder surface), so keeping the contracts in a third
package added a second public import path for a plugin without adding a
boundary. Folding both into the SDK removed the `sdk ↔ plugin-manager` cycle and
made `@nodera/sdk` the single import a plugin needs.

`packages/plugin-api` itself stays in the workspace as a private shell so the
workspace and turbo graphs stay unchanged; `src/index.ts` exports nothing on
purpose, so an import of the old specifier fails loudly instead of resolving to
a stale copy of contracts the SDK now owns.

The authoring guide is [`docs/PLUGINS.md`](../../docs/PLUGINS.md).
