# @nodera/ai-nodes

An example Nodera plugin made of node definitions only: it contributes two node
types and binds **no** renderer. Presentation stays with the host — a node type
*is* its renderer id, so the definition already says which renderer the UI must
resolve, and the host attaches the component itself. It imports `@nodera/sdk`
and `@nodera/plugin-api` only; no React, no React Flow.

- **Plugin id:** `example.ai-nodes`
- **Version:** `1.0.0`

## What it contributes

| Kind | Id | Export |
| --- | --- | --- |
| `node` | `example.ai.classify` | `CLASSIFY_NODE` |
| `node` | `example.ai.embed` | `EMBED_NODE` |

Nothing else: the manifest declares exactly these two `node` contributions.

## Install

```ts
import { createPluginManager } from "@nodera/plugin-manager";
import { assertValid, createBuilder } from "@nodera/sdk";
import { aiNodesPlugin } from "@nodera/ai-nodes";

const builder = assertValid(createBuilder());
const manager = createPluginManager(builder, { sdkVersion: "0.0.0" });

const installed = manager.install([aiNodesPlugin]);
if (installed.ok) {
  builder.registries.nodes.has("example.ai.classify"); // true: the definition
  // The host's half of the contract: a component for the node type's id.
  builder.bindRenderer("nodes", "example.ai.classify", ClassifyNode);
}
```

## What the example shows

- **A framework-agnostic plugin contributes declarations, not pixels.** The
  plugin never calls `api.renderers.bind`; the host calls `builder.bindRenderer`
  with the id the definition already carries (a node type is its renderer id).
  `bindRenderer` adds a new binding keyed by that id and only rejects an id that
  is already bound (`sdk.duplicate-id`).
- **`api.renderers.bind` is the host/framework-aware channel.** Its value must be
  something the presentation adapter can paint: in `@nodera/react-flow` a React
  component (function or `memo`/`forwardRef`). Binding plain data in `nodes`
  makes `createRendererSet` throw `InvalidRendererBindingError` for the whole
  builder, and the id cannot be rebound afterwards — the builder is simply not
  mountable.
- **A binding is not a contribution.** Whatever a host binds never appears in
  `contributionIds`, and `uninstall` never withdraws it; the two node
  definitions, which the manifest declares, are withdrawn.

`examples/phase7-demo` is the reference host: it installs all five example
plugins on one React Flow canvas and binds a component for each of these two node
types.

The authoring guide is [`docs/PLUGINS.md`](../../docs/PLUGINS.md).

## Scripts

`pnpm --filter @nodera/ai-nodes test`, `typecheck`, `build` (`build` and
`typecheck` are both `tsc --noEmit`).
