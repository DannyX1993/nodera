# Contributing to Nodera

Thanks for helping. Nodera is a pnpm + Turborepo monorepo (TypeScript, `strict`).
Before changing code, read [`AGENTS.md`](AGENTS.md) — it holds the architectural
rules this project enforces — and [`docs/GLOBAL-ARCHITECTURE.md`](docs/GLOBAL-ARCHITECTURE.md).

## Requirements

- Node.js >= 20
- pnpm 9.15.0 (`corepack enable`, or install it directly)

## Setup

```bash
pnpm install
```

## Checks

Run the same commands CI runs (`.github/workflows/ci.yml`):

```bash
pnpm typecheck          # tsc --noEmit across the workspace
pnpm build              # per-package tsc build into dist/
pnpm test               # vitest across the workspace
pnpm lint               # eslint (errors fail, pre-existing warnings do not)
pnpm check:architecture # layer-dependency rules (scripts/check-architecture.mjs)
```

`pnpm check:architecture` turns the package boundaries documented in
`docs/PROJECT-STRUCTURE.md` into an executable check, so a failing rule is a
design problem, not a formatting problem. Fix the dependency, not the script.

## Changesets

Every user-visible change to a published package needs a changeset:

```bash
pnpm changeset
```

The changeset records the affected packages and the bump (`patch`, `minor`,
`major`). Commit it with the change. Do not edit versions or per-package
`CHANGELOG.md` files by hand — `pnpm version` (`changeset version`) does that.

Publishing is not part of the contributor flow: the repository is only kept
*releasable* (`pnpm build`, `npm pack --dry-run`). `pnpm release` exists for the
maintainer who owns the registry credentials, and nobody else should run it.

## Conventions

- Keep `strict` on and prefer `unknown` over `any` at external boundaries.
- Keep the dependency direction: presentation → application → domain. The
  domain never imports React, React Flow, the DOM, storage or execution code.
- Document new public APIs, document-contract changes, plugin surface changes
  and package-dependency changes in the same change.
- Technical artifacts (root and package `README.md` files, code, comments) are
  written in English; the narrative phase documentation in `docs/*.md` is in
  Spanish.

## License

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE).
