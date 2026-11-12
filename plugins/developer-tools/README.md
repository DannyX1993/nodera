# @nodera/developer-tools

An example Nodera plugin for interface actions: two tools, two panels and one
dialog, all declarative. It imports `@nodera/sdk` and `@nodera/plugin-api` only,
and contributes no component — the host keeps control of how the actions look.

- **Plugin id:** `example.developer-tools`
- **Version:** `1.0.0`

## What it contributes

| Kind | Id | Export |
| --- | --- | --- |
| `tool` | `example.dev.tool.validate` | `VALIDATE_TOOL` (`command: { kind: "validate" }`) |
| `tool` | `example.dev.tool.dump-graph` | `DUMP_GRAPH_TOOL` (`command: { kind: "custom", id }`) |
| `panel` | `example.dev.panel.issues` | `ISSUES_PANEL` (bottom region) |
| `panel` | `example.dev.panel.shortcuts` | `SHORTCUTS_PANEL` (right region) |
| `dialog` | `example.dev.dialog.shortcuts` | `SHORTCUTS_DIALOG` |

## Install

```ts
import { createPluginManager } from "@nodera/plugin-manager";
import { assertValid, createBuilder } from "@nodera/sdk";
import { developerToolsPlugin, SHORTCUTS_DIALOG_ID } from "@nodera/developer-tools";

const builder = assertValid(createBuilder());
const manager = createPluginManager(builder, { sdkVersion: "1.0.0" });

const installed = manager.install([developerToolsPlugin]);
if (installed.ok) {
  builder.dialogs.all().map((dialog) => dialog.id); // includes SHORTCUTS_DIALOG_ID
  builder.store.openDialog(SHORTCUTS_DIALOG_ID);    // presentation state, not a document write
}
```

## What the example shows

- the three declarative interface actions a plugin can add — `tool`, `panel` and
  `dialog` — which is how the framework receives "nuevas acciones de interfaz";
- the framework command versus the `custom` one: `validate` routes to a use case
  the framework owns, `custom` defers to a handler the host provides;
- nothing is executed by the plugin: it declares actions, and Nodera never runs
  the tools a plugin contributes.

The authoring guide is [`docs/PLUGINS.md`](../../docs/PLUGINS.md).

## Scripts

`pnpm --filter @nodera/developer-tools test`, `typecheck`, `build` (`build` and
`typecheck` are both `tsc --noEmit`).
