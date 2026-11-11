# @nodera/plugin-manager

The infrastructure of the plugin ecosystem: manifest validation, dependency
resolution, conflict detection and the lifecycle manager that installs a
host-selected set of plugins onto a Nodera builder.

The package sits where `docs/GLOBAL-ARCHITECTURE.md` puts the plugin system — in
the infrastructure layer — and it composes the *public* surface only. A plugin
reaches the builder through `installPlugin` of `@nodera/sdk`, so it is subject to
exactly the validation, duplicate detection and events a host is, and the manager
never reimplements a registry its own way.

It does not do the following:

- import `@nodera/domain`, `@nodera/application`, `@nodera/document`, a `ui-*`
  package, `@nodera/react-flow` or a core registry directly — it composes the
  SDK, and `pnpm check:architecture` fails when it does not;
- discover plugins on disk, download them or scan a directory: the host decides
  which `PluginDefinition`s exist (security, `docs/FASE7-DEFINITION.md`);
- load a module asynchronously: every hook is synchronous, because loading a
  plugin is the host's job before it hands the definition over;
- render anything or hold UI state.

## Install

The workspace package is consumed from source (`main`/`types` →
`./src/index.ts`):

```json
{
  "dependencies": {
    "@nodera/plugin-manager": "workspace:*"
  }
}
```

Runtime dependencies: `@nodera/plugin-api`, `@nodera/sdk`, `@nodera/contracts`.
Every public name is exported from `src/index.ts`.

## Pure functions

Three functions answer without touching a builder, so a host can validate a set
before composing anything:

```ts
validatePluginManifest(value: unknown): Result<PluginManifest, PluginIssues>;
resolveDependencyOrder(
  manifests: readonly PluginManifest[],
): Result<readonly PluginManifest[], PluginIssues>;
detectPluginConflicts(manifests: readonly PluginManifest[]): Result<void, PluginIssues>;
```

- **`validatePluginManifest`** treats its input as untrusted data: it checks the
  required fields, the id rule, the version shape, dependencies, compatibility,
  contributions and permissions, reports every problem as
  `plugin.invalid-manifest` with a precise `path`, and ignores unknown keys so a
  forward-compatible manifest still validates.
- **`resolveDependencyOrder`** orders the discovered set dependency-first,
  collapses duplicate ids (first declaration wins) so ordering stays total, and
  reports `plugin.missing-dependency`, `plugin.dependency-cycle` and
  `plugin.invalid-manifest` for an unsupported range. It never downloads.
- **`detectPluginConflicts`** fails on a shared plugin id
  (`plugin.duplicate-plugin`) and on a shared `(type, id)` contribution
  (`plugin.contribution-conflict`), from the declarations alone, before any
  plugin code runs.

### Version ranges

`semver.ts` implements a deliberately small grammar, and anything outside it is
`plugin.invalid-manifest` rather than an approximate interpretation:

| Declaration | Meaning |
| --- | --- |
| absent or `*` | any version |
| `1.2.3` | exactly that version |
| `^1.2.3` | same major, `>= 1.2.3` |
| `~1.2.3` | same minor, `>= 1.2.3` |

Plugin versions are `major.minor.patch` with an optional prerelease and never
build metadata (`isValidSemver` of `@nodera/contracts` plus that rule). A
prerelease only satisfies a range that opts into prereleases of the same
`major.minor.patch` tuple. The helpers (`isValidVersion`, `parseVersion`,
`compareVersions`, `parseVersionRange`, `satisfiesRange`, `matchesRange`) and
their types (`SemverVersion`, `VersionRange`) are exported as well.

## Lifecycle manager

```ts
const manager = createPluginManager(builder, {
  sdkVersion: "0.0.0",       // compared with compatibility.sdkVersion
  documentFormat: "ggd",     // compared with compatibility.documentFormat
  documentVersion: "1.0.0",  // compared with compatibility.documentVersion
});
```

A host-side fact left out of the options is skipped in the comparison: a host
that declares no SDK version cannot be incompatible with one.

```ts
export interface PluginManager {
  install(plugins: readonly PluginDefinition<BuilderPluginApi>[]): Result<readonly PluginRecord[], PluginIssues>;
  deactivate(pluginId: string): Result<PluginRecord, PluginIssues>;
  uninstall(pluginId: string): Result<PluginRecord, PluginIssues>;
  get(pluginId: string): PluginRecord | undefined;
  list(): readonly PluginRecord[];
}

export interface PluginRecord {
  readonly manifest: PluginManifest;
  readonly state: PluginState;
  readonly contributionIds: readonly string[];
  readonly issues: PluginIssues;
}
```

`install` runs the whole lifecycle for one discovered set, synchronously and in
this order: **discover** (each entry has a manifest and an `activate`) →
**resolve** (topological, dependency-first) → **validate** (manifest plus host
compatibility) → **detect conflicts** (the new set plus what this manager already
holds) → **register and activate** (`installPlugin` registers the contributions
and emits `plugin.registered`, then `activate` runs, the record becomes `active`
and the manager emits `plugin.activated`).

Two rules shape it:

- **Fail closed.** Steps one to four run before any plugin code: a rejected set
  returns its diagnostics and leaves the builder and the manager untouched.
- **Keep what worked.** A plugin whose `activate` throws stays stored in state
  `error` with the contributions it managed to register, exactly like the SDK's
  Phase 6 installation rule. The manager does not undo them.

`deactivate` runs the optional hook and moves the record to `inactive` (emitting
`plugin.deactivated`); it refuses anything that is not `active` with
`plugin.invalid-state`, and an id this manager does not hold with
`plugin.not-found`. `uninstall` withdraws the plugin's declared contributions,
forgets the record and emits `plugin.unregistered`; the returned record reports
state `unregistered` and carries the removal failures in `issues`.

`PluginRecord.issues` is where everything that did not stop the operation lands:
the `plugin.invalid-manifest` warnings of an installation (a contribution the
plugin registered without declaring it) and the failures of an uninstall.

## Contribution withdrawal

`uninstall` withdraws what the manifest *declares*, in reverse declaration order,
because the SDK installation result reports contribution ids without their kind.
One removal surface per kind:

| Kind | Surface used |
| --- | --- |
| `node` / `edge` | `builder.registries.nodes.unregister` / `.edges.unregister` |
| `property` | `builder.properties.unregister` |
| `panel` / `tool` / `theme` / `layout` | `builder.registries.<kind>.unregister` |
| `validator` / `importer` / `exporter` | `builder.validators` / `importers` / `exporters` `.unregister` |
| `dialog` | `builder.dialogs.unregister` |
| `layout-strategy` | `builder.graphLayout.unregister` |
| `renderer` | none — a binding is not a contribution |

A failure never stops the withdrawal: every failure is reported on the returned
record. A contribution the builder does not hold is `plugin.not-found`; any other
removal failure reuses `plugin.deactivation-failed` (there is no separate
`plugin.uninstall-failed` code).

## Known limitation

The SDK remembers, per builder, the plugin ids it has installed, and it never
forgets one (the Phase 6 `installedPlugins` WeakMap). Uninstalling a plugin and
installing **the same id on the same builder** therefore fails inside the SDK
with `sdk.plugin-conflict`, which the manager reports as
`plugin.activation-failed` with the record in state `error`. Use a fresh builder
or a fresh plugin id; that is why every example plugin suite composes one
builder per case.

The full guide — security model, distribution and the limitations above in
context — is [`docs/PLUGINS.md`](../../docs/PLUGINS.md).

## Scripts

`pnpm --filter @nodera/plugin-manager test`, `typecheck`, `build` (`build` and
`typecheck` are both `tsc --noEmit`).
