# @nodera/ai-nodes

An example Nodera plugin for presentation contributions: two node definitions
plus one renderer binding per node — the opaque value a presentation adapter
resolves when it paints that node. It imports `@nodera/sdk` and
`@nodera/plugin-api` only; no React, no React Flow.

- **Plugin id:** `example.ai-nodes`
- **Version:** `1.0.0`

## What it contributes

| Kind | Id | Export |
| --- | --- | --- |
| `node` | `example.ai.classify` | `CLASSIFY_NODE` |
| `node` | `example.ai.embed` | `EMBED_NODE` |
| `renderer` | `example.ai.classify` | `CLASSIFY_RENDERER` (bound through `api.renderers.bind`) |
| `renderer` | `example.ai.embed` | `EMBED_RENDERER` (bound through `api.renderers.bind`) |

The renderer values are plain data (`AiNodeRenderer`: a `kind`, an `accent` token
and a `badge`). The SDK never inspects them; a host adapter decides what they
mean, which is what keeps the plugin usable from a non-React host.

## Install

```ts
import { createPluginManager } from "@nodera/plugin-manager";
import { assertValid, createBuilder } from "@nodera/sdk";
import { aiNodesPlugin } from "@nodera/ai-nodes";

const builder = assertValid(createBuilder());
const manager = createPluginManager(builder, { sdkVersion: "0.0.0" });

const installed = manager.install([aiNodesPlugin]);
if (installed.ok) {
  builder.renderers.nodes.get("example.ai.classify"); // the bound descriptor
}
```

## What the example shows

- a binding is **not** a contribution: `api.renderers.bind` attaches an opaque
  value to an existing slot, so it never appears in `contributionIds` and
  uninstall never withdraws it (the manifest still declares the two renderer ids,
  because a declaration is what a host reads before running the code);
- presentation crosses the plugin boundary as data, so the same plugin works with
  any host that can turn the descriptor into a component.

The authoring guide is [`docs/PLUGINS.md`](../../docs/PLUGINS.md).

## Scripts

`pnpm --filter @nodera/ai-nodes test`, `typecheck`, `build` (`build` and
`typecheck` are both `tsc --noEmit`).
