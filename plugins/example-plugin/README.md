# @nodera/example-plugin

An example Nodera plugin with one contribution of every remaining kind: a theme,
a layout, a layout strategy and an exporter. Together with the other four example
plugins it completes the contribution surface. It imports `@nodera/sdk` and
`@nodera/plugin-api` only.

- **Plugin id:** `example.kitchen-sink` (the directory is `plugins/example-plugin`)
- **Version:** `1.0.0`

## What it contributes

| Kind | Id | Export |
| --- | --- | --- |
| `theme` | `example.sink.theme.blueprint` | `BLUEPRINT_THEME` (tokens: `BLUEPRINT_TOKENS`) |
| `layout` | `example.sink.layout.workspace` | `WORKSPACE_LAYOUT` |
| `layout-strategy` | `example.sink.strategy.grid` | `GRID_STRATEGY` |
| `exporter` | `example.sink.exporter.ndjson` (format `ndjson`) | `ndjsonExporter` |

## Install

```ts
import { createPluginManager } from "@nodera/plugin-manager";
import { assertValid, createBuilder } from "@nodera/sdk";
import { kitchenSinkPlugin, BLUEPRINT_THEME_ID, NDJSON_FORMAT } from "@nodera/example-plugin";

const builder = assertValid(createBuilder());
const manager = createPluginManager(builder, { sdkVersion: "1.0.0" });

const installed = manager.install([kitchenSinkPlugin]);
if (installed.ok) {
  builder.theme.all().map((theme) => theme.id); // includes BLUEPRINT_THEME_ID
  NDJSON_FORMAT;                                 // "ndjson" — the format the exporter answers for
}
```

## What the example shows

- **data versus behaviour in one plugin**: the theme and the layout are
  declarative values the host applies, while the layout strategy and the exporter
  are code the host calls through a port;
- a theme that declares every token group, because a theme is either fully
  applicable or not a theme at all, and never touches the DOM;
- a guarded exporter: a value JSON cannot represent becomes a structured
  `serialization-failed` diagnostic instead of an exception;
- a layout naming panels by id, so the plugin depends on no other plugin.

The authoring guide is [`docs/PLUGINS.md`](../../docs/PLUGINS.md).

## Scripts

`pnpm --filter @nodera/example-plugin test`, `typecheck`, `build` (`build` and
`typecheck` are both `tsc --noEmit`).
