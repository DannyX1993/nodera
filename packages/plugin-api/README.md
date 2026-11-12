# @nodera/plugin-api

The pure contracts of the Nodera plugin ecosystem: the plugin manifest, the
closed set of contribution kinds, the lifecycle a plugin goes through, the
diagnostic vocabulary every plugin operation reports in, and the one identity
rule plugin and contribution ids share.

The package is what a plugin and a host agree on. It holds no behaviour beyond
`isPluginId` and `pluginIssue`, declares one runtime dependency
(`@nodera/contracts`), and is generic over the contribution surface:
`PluginDefinition<TApi>` names whatever the host offers, so the same contract
serves the Nodera SDK today and a host with a different surface tomorrow.

It does not do the following:

- import React, React DOM, React Flow or any `@nodera/ui-*` package — it is
  framework- and engine-free, and `pnpm check:architecture` fails when it is not;
- depend on `@nodera/sdk`, directly or indirectly: the arrow is
  `plugin-manager → sdk` and `plugins → sdk`, never `sdk → plugin-api`;
- validate, resolve, detect conflicts or run a lifecycle — that is
  [`@nodera/plugin-manager`](../plugin-manager/README.md);
- execute anything: a plugin's hooks are called by the host's manager, and
  Nodera never executes the tools a plugin declares.

## Install

The workspace package is consumed from source. `main` and `types` both point at
`./src/index.ts`, so there is no build step and no `exports` map yet:

```json
{
  "dependencies": {
    "@nodera/plugin-api": "workspace:*"
  }
}
```

Every public name is exported from `src/index.ts`; no other path is a supported
import.

## Manifest

`PluginManifest` is the declarative contract every plugin ships. It is pure data
— no functions, no components — so it can be validated, compared and reported
before third-party code runs:

```ts
export interface PluginManifest {
  readonly id: string;                 // globally qualified, e.g. "vendor.feature-name"
  readonly name: string;
  readonly version: string;            // major.minor.patch, optional prerelease
  readonly description?: string;
  readonly author?: PluginAuthor;      // { name, email?, url? }
  readonly dependencies?: readonly PluginDependency[];
  readonly compatibility?: PluginCompatibility;
  readonly contributions?: readonly PluginContribution[];
  readonly permissions?: PluginPermissions;
}
```

`PluginCompatibility` declares what the plugin was authored against —
`{ sdkVersion?, documentFormat?, documentVersion?, definitionVersions? }` — and
`permissions` (`{ network?, storage? }`) is a declaration only: the host decides
what to grant, and declaring a permission never grants it.

## Contribution kinds

`PluginContributionKind` is a closed set of thirteen kinds, and a manifest lists
the contributions it intends to register as `{ type, id, version? }` entries:

```ts
export type PluginContributionKind =
  | "node"
  | "edge"
  | "property"
  | "renderer"
  | "tool"
  | "panel"
  | "validator"
  | "theme"
  | "layout"
  | "layout-strategy"
  | "importer"
  | "exporter"
  | "dialog";
```

The declaration is what enables pre-flight conflict detection and precise
withdrawal on uninstall. `renderer` is the one kind that is not a contribution at
install time: a renderer binding attaches an opaque value to an existing slot.

## Lifecycle

`PluginDefinition<TApi>` is the manifest plus two synchronous hooks, and
`PluginContext` is what they receive:

```ts
export interface PluginContext<TApi = unknown> {
  readonly manifest: PluginManifest;
  readonly api: TApi;
}

export interface PluginDefinition<TApi = unknown> {
  readonly manifest: PluginManifest;
  activate(ctx: PluginContext<TApi>): void;
  deactivate?(ctx: PluginContext<TApi>): void;
}
```

`activate` returns `void`, so a plugin reports a failure by throwing: the manager
turns the throw into a `plugin.activation-failed` diagnostic. `PluginState` names
the states of the lifecycle contract — `discovered`, `resolved`, `validated`,
`registered`, `active`, `inactive`, `unregistered`, `error` — and a stored
record only ever reports `active`, `inactive` or `error`, because the earlier
states happen inside one `install` call.

## Diagnostics

`PLUGIN_ERROR_CODES` is the closed list of codes the ecosystem reports:

```ts
export const PLUGIN_ERROR_CODES = [
  "plugin.invalid-manifest",
  "plugin.missing-dependency",
  "plugin.dependency-cycle",
  "plugin.incompatible-sdk",
  "plugin.duplicate-plugin",
  "plugin.contribution-conflict",
  "plugin.activation-failed",
  "plugin.deactivation-failed",
  "plugin.not-found",
  "plugin.invalid-state",
] as const;
```

A `PluginIssue` carries `code`, `message`, `severity` (`"error" | "warning"`), an
optional `path` and optional `metadata`. `path` is `readonly string[]`, so an
array index inside a validated manifest is reported as text
(`["dependencies", "0", "version"]`). `pluginIssue(code, message, options)` builds
one; `PluginIssues` is the list an operation returns as the error side of a
`Result`.

## Identity

`isPluginId(value)` is the single identity rule, shared by plugin ids and
contribution ids: at least one dot, no whitespace, no empty segment
(`vendor.feature-name`). Two independent authors therefore cannot collide
accidentally, and an id can be rejected before any code runs.

## Boundaries

`pnpm check:architecture` enforces the package's place in the dependency graph
with the rule `plugin-api-is-pure-contracts`: neither the sources nor the
manifest mention React, React DOM, React Flow or a `@nodera/ui-*` package, and
the runtime dependencies are only `@nodera/contracts`.

The authoring guide, the lifecycle walk-through and the known limitations are in
[`docs/PLUGINS.md`](../../docs/PLUGINS.md).

## Scripts

`pnpm --filter @nodera/plugin-api test`, `typecheck`, `build` (`build` and
`typecheck` are both `tsc --noEmit`).
