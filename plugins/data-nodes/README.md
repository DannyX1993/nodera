# @nodera/data-nodes

An example Nodera plugin for the declarative-data side of the surface: two
property definitions, one graph validator and one importer for a new document
format. It imports `@nodera/sdk` and `@nodera/plugin-api` only.

- **Plugin id:** `example.data-nodes`
- **Version:** `1.0.0`

## What it contributes

| Kind | Id | Export |
| --- | --- | --- |
| `property` | `example.data.source` | `DATA_PROPERTIES[0]` |
| `property` | `example.data.target` | `DATA_PROPERTIES[1]` |
| `validator` | `example.data.validator` | `dataValidator` |
| `importer` | `example.data.importer` (format `json-lines`) | `jsonLinesImporter` |

The two properties are registered on the builder rather than inside a node
definition, so any node may declare them; they carry no renderer, so every host
keeps its own property renderers.

## Install

```ts
import { createPluginManager } from "@nodera/plugin-manager";
import { assertValid, createBuilder } from "@nodera/sdk";
import { dataNodesPlugin, JSON_LINES_FORMAT } from "@nodera/data-nodes";

const builder = assertValid(createBuilder());
const manager = createPluginManager(builder, { sdkVersion: "1.0.0" });

const installed = manager.install([dataNodesPlugin]);
if (!installed.ok) {
  console.error(installed.error.map((issue) => issue.code).join(", "));
}

JSON_LINES_FORMAT; // "json-lines" — the format id the importer answers for
builder.validators.all().map((validator) => validator.id);
```

## What the example shows

- a plugin contributing **code** through a port: `dataValidator` runs over the
  graph the editing session validates (`level: "domain"`) and answers structured
  issues, with no UI and no framework involved;
- untrusted input handled where it enters: the importer parses line by line and a
  malformed line becomes a `parse-failed` diagnostic instead of an exception;
- a graph rule joining the validator registry with no re-composition.

The authoring guide is [`docs/PLUGINS.md`](../../docs/PLUGINS.md).

## Scripts

`pnpm --filter @nodera/data-nodes test`, `typecheck`, `build` (`build` and
`typecheck` are both `tsc --noEmit`).
