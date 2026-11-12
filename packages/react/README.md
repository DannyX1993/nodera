# @nodera/react

The React binding of the [Nodera](../sdk/README.md) graph editing framework: one
package, one import path, everything a React host needs.

```bash
pnpm add @nodera/react react react-dom @xyflow/react
```

```ts
import { createBuilder, NoderaEditor, EditorShell } from "@nodera/react";
```

## What it contains

It re-exports three surfaces, in this order:

| Surface | What it is |
| --- | --- |
| `@nodera/sdk` | The framework-free core: `createBuilder`, the authoring vocabulary, the registries, the document/event/plugin APIs and the canvas adapter port. |
| `@nodera/react-flow` | The React Flow integration: the canvas adapter (`GraphCanvas`, the renderer registries, the React Flow mappers) and its SDK binding (`NoderaEditor`, `NoderaBuilderProvider`, `createReactFlowAdapter`, `createRendererSet`). |
| `@nodera/ui-react` | The React presentation layer: providers, hooks, panels, the inspector, the toolbar and the replaceable renderers. |

Nothing is defined here: `src/index.ts` is a re-export barrel, so a name has one
owner and one declaration. The two names the React Flow package also re-exports
from the SDK (`PortPlacement`, `ViewportConfiguration`) are named explicitly from
`@nodera/sdk` so the binding answers with the SDK's declaration.

`@nodera/sdk` is bundled into this package, so a React host installs it and does
not need the core packages. A host that only needs to *build* graphs — documents,
definitions, validation, layout — installs `@nodera/sdk` alone and stays
framework-free.

## Peer dependencies

| Peer | Range | Why |
| --- | --- | --- |
| `react` | `>=18` | One React runtime per application. |
| `react-dom` | `>=18` | Same. |
| `@xyflow/react` | `^12` | The canvas engine; the host owns the instance and its stylesheet. |

They are never bundled. `@nodera/react` is the only public package that may
import React, React DOM or `@xyflow/react` (AGENTS.md §4.1,
`scripts/check-architecture.mjs`).

## Boundaries

- **One direction.** `@nodera/react` depends on `@nodera/sdk`; the SDK never
  depends on this package, which is what keeps the core framework-agnostic.
- **A framework swap is a new package.** A Vue or Svelte binding would be
  `@nodera/vue` or `@nodera/svelte`, written against the same `@nodera/sdk`
  surface. Nothing in the core changes.
- **The engine stays replaceable.** The canvas adapter translates the portable
  graph into React Flow; the document, the domain and the SDK never mention it.

## Build

`pnpm build` runs `tsup` (one ESM entry, `dist/index.js` + self-contained
`dist/index.d.ts`, with the `@nodera/*` packages inlined and React/React Flow
external) and then emits the *unbundled* declaration tree used by the workspace
to `dist/types` (mapped by `tsconfig.base.json` so every package sees a single
type identity). `dist/types` is not published.

## Scripts

`pnpm --filter @nodera/react build`, `typecheck`, `test`.

## Documentation

- [`docs/SDK-GUIDE.md`](../../docs/SDK-GUIDE.md) — from `createBuilder` to a
  rendered editor.
- [`docs/PROJECT-STRUCTURE.md`](../../docs/PROJECT-STRUCTURE.md) §7.6 — the
  two-package distribution.
- [`examples/phase6-demo`](../../examples/phase6-demo) and
  [`examples/phase7-demo`](../../examples/phase7-demo) — complete React hosts.
