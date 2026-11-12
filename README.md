# Nodera

A generic, extensible **graph editing framework** — domain-agnostic, execution-agnostic, and framework-agnostic at the core.

Nodera lets any application integrate a configurable, visual graph builder without rebuilding the editing, representation, document and persistence logic from scratch. It models and validates graphs; the host application coordinates use cases; adapters render and persist; plugins extend; an external system (never Nodera) executes.

> Nodera is a *Graph Editing Framework*, not a workflow builder. It never executes nodes, tools or graphs.

## Principles

- **Domain agnostic** — no workflow / AI / ETL concepts in the core.
- **Execution agnostic** — describe and edit only; execution is out of scope.
- **Framework-agnostic core** — no React, React Flow, Vue or DOM in the domain/application layers.
- **Portable documents** — JSON is the canonical structured representation (GGD); YAML is an alternative serialization of the same contract.
- **Extensible by design** — nodes, edges, properties, renderers, panels, tools, validators, themes, layouts, importers and exporters register through public contracts.
- **Composable UI** — the host owns layout and composition.
- **Versioned contracts** — documents, definitions, plugins and public APIs evolve explicitly.

## Architecture

Hexagonal (Ports & Adapters) + Domain-Driven Design + SOLID. Dependency direction is strict:

```text
Presentation / Framework Adapters
        |
        v
Application Layer
        |
        v
Domain Layer

Infrastructure ---> Ports defined inward
Plugins -----------> Public SDK contracts
Host Application --> Public SDK
```

The domain never imports React, React Flow, the DOM, storage or execution code. `@xyflow/react` (React Flow) is the initial canvas engine, isolated inside the React binding (`packages/react-flow`, published as part of `@nodera/react`).

## Public distribution: two packages

Nodera publishes **two** packages. Everything else in `packages/*` is internal:

| Package | Contents | Peer dependencies |
| --- | --- | --- |
| `@nodera/sdk` | The framework-free core, bundled into one `dist/`: builder factory, authoring vocabulary, registries, document/event/plugin APIs, the plugin contracts and manager, the theme/layout/UI contracts and the engine-adapter port. | none |
| `@nodera/react` | The React binding, bundled into one `dist/`: everything from `@nodera/sdk` plus the React Flow canvas adapter and the React presentation layer. | `react`, `react-dom`, `@xyflow/react` |

```ts
// A host that builds, validates or serializes graphs: framework-free.
import { assertValid, createBuilder } from "@nodera/sdk";

// A React host: one package, plus React and the canvas engine.
import { createBuilder, NoderaEditor } from "@nodera/react";
```

`@nodera/sdk` is bundled into `@nodera/react` in one direction only, so the core
never depends on a framework and a future binding (Vue, Svelte, plain DOM) is a
different package over the same SDK. `@nodera/plugin-api`,
`@nodera/plugin-manager`, `@nodera/react-flow`, `@nodera/ui-react` and the 19
core packages are `private` workspace packages: they carry the architecture and
the tests, are bundled into the two published tarballs and are never published
on their own (`docs/KNOWN-ISSUES.md` KI-12).

## Monorepo layout

| Path | Purpose |
| --- | --- |
| `packages/sdk` | **Public.** `@nodera/sdk` — the bundled framework-free core (the plugin contracts and the plugin manager live inside it, in `src/plugin-api/` and `src/plugin-manager/`). |
| `packages/react` | **Public.** `@nodera/react` — the bundled React binding, which composes `@nodera/sdk`, `@nodera/react-flow` and `@nodera/ui-react`. |
| `packages/*` (rest) | Internal, `private`: `contracts`, `domain`, `graph-model`, `application`, `document`, `serialization-json`, `serialization-yaml`, `validation`, `node-registry`, `edge-registry`, `property-system`, `history`, `graph-layout`, `ui-core`, `theme-engine`, `layout-engine`, `react-flow`, `ui-react`, the former `plugin-api`/`plugin-manager` shells, and the placeholders (`core`, `testing`, `adapter-storage-*`). They are bundled into the two public packages and are not published. |
| `plugins/*` | Example plugins (`basic-nodes`, `data-nodes`, `ai-nodes`, `developer-tools`, `example-plugin`), written against `@nodera/sdk` only. |
| `apps/*` | Placeholders (`playground`, `documentation`, `dev-tools`) — not implemented yet. |
| `examples/*` | Runnable examples, including `phase4-demo` … `phase7-demo`. |
| `docs/*` | Architecture, contract and phase documentation (Spanish). |
| `odd/tasks/*` | Per-phase ODD task documents. |

## Requirements

- Node.js >= 20
- pnpm 9.15.0 (`corepack enable` or install it directly)

## Quick start

```bash
pnpm install
pnpm typecheck   # tsc --noEmit across the workspace
pnpm build       # tsup for the two public packages, tsc for the internal ones
pnpm test        # vitest across the workspace
pnpm lint        # eslint across the workspace
pnpm check:architecture   # layer-dependency rules
```

The two public packages pack self-contained: `npm pack --dry-run` in
`packages/sdk` and `packages/react` lists only `dist/index.js`, `dist/index.d.ts`
(and their source maps), with every `@nodera/*` module inlined.

## Documentation

- [`docs/PRODUCT-DESCRIPTION.md`](docs/PRODUCT-DESCRIPTION.md) — product architecture and module definition.
- [`docs/GGD-CONTRACT.md`](docs/GGD-CONTRACT.md) — the portable document contract.
- [`docs/SDK-GUIDE.md`](docs/SDK-GUIDE.md) — SDK and builder authoring guide.
- [`docs/PLUGINS.md`](docs/PLUGINS.md) — plugin system.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — implementation phases and status.

## License

[MIT](LICENSE)
