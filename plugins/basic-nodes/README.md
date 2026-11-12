# @nodera/basic-nodes

An example Nodera plugin, and the smallest complete one: two node definitions and
the edge definition that connects them, contributed through the public plugin
surface.

Everything it contributes is declarative data — no component and no function is
stored in a definition — so the same plugin serves any presentation adapter. It
imports `@nodera/sdk` only.

- **Plugin id:** `example.basic-nodes`
- **Version:** `1.0.0`

## What it contributes

| Kind | Id | Export |
| --- | --- | --- |
| `node` | `example.basic.start` | `START_NODE` |
| `node` | `example.basic.transform` | `TRANSFORM_NODE` |
| `edge` | `example.basic.flow` | `FLOW_EDGE` |

`BASIC_NODES_MANIFEST` declares exactly those three contributions, with the same
kinds and versions its `activate` hook registers, and `basicNodesPlugin` is the
`PluginDefinition` a host installs.

## Install

```ts
import { assertValid, createBuilder, createPluginManager } from "@nodera/sdk";
import { basicNodesPlugin } from "@nodera/basic-nodes";

const builder = assertValid(createBuilder());
const manager = createPluginManager(builder, { sdkVersion: "1.0.0" });

const installed = manager.install([basicNodesPlugin]);
// installed.value[0].contributionIds === the three ids above, in registration order

builder.registries.nodes.get("example.basic.start"); // NodeDefinitionView | undefined
```

Uninstalling the plugin withdraws those three contributions again, because each
one is declared in the manifest.

## What the example shows

- a manifest that matches its activation one-to-one, which is what makes
  pre-flight conflict detection and uninstall precise;
- a failing contribution reported by throwing from `activate`, the only channel
  the hook has (`assertRegistered` in `src/index.ts`).

The authoring guide is [`docs/PLUGINS.md`](../../docs/PLUGINS.md).

## Scripts

`pnpm --filter @nodera/basic-nodes test`, `typecheck`, `build` (`build` and
`typecheck` are both `tsc --noEmit`).
