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

The domain never imports React, React Flow, the DOM, storage or execution code. `@xyflow/react` (React Flow) is the initial canvas engine, isolated inside the `@nodera/react-flow` adapter.

## Monorepo layout

| Path | Purpose |
| --- | --- |
| `packages/*` | The framework: `contracts`, `domain`, `graph-model`, `application`, `document`, `serialization-json`, `serialization-yaml`, `validation`, `node-registry`, `edge-registry`, `property-system`, `history`, `graph-layout`, `sdk`, `plugin-api`, `plugin-manager`, `ui-core`, `ui-react`, `react-flow`, `theme-engine`, `layout-engine` and a few placeholders (`core`, `testing`, `adapter-storage-*`). |
| `plugins/*` | Example plugins (`basic-nodes`, `data-nodes`, `ai-nodes`, `developer-tools`, `example-plugin`). |
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
pnpm build       # per-package tsc build
pnpm test        # vitest across the workspace
pnpm lint        # eslint across the workspace
pnpm check:architecture   # layer-dependency rules
```

## Documentation

- [`docs/PRODUCT-DESCRIPTION.md`](docs/PRODUCT-DESCRIPTION.md) — product architecture and module definition.
- [`docs/GGD-CONTRACT.md`](docs/GGD-CONTRACT.md) — the portable document contract.
- [`docs/SDK-GUIDE.md`](docs/SDK-GUIDE.md) — SDK and builder authoring guide.
- [`docs/PLUGINS.md`](docs/PLUGINS.md) — plugin system.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — implementation phases and status.

## License

[MIT](LICENSE)
