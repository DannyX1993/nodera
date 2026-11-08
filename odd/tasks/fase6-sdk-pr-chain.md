# feature: fase6-sdk — PR chain (delivery plan)

> **Deliverable vs review aid.** The deliverable is the single branch
> `feature/fase6-sdk` (22 commits, 130 files, +18,025/−471). It already contains
> every slice below, so it can be merged into `master` as one unit after manual
> testing — a fast-forward, exactly like phases 1–5. The six `fase6/*` branches
> exist **only** to make review slices possible; they are contained in the
> deliverable and merging them into it is a no-op by construction.

`chain_strategy=feature-branch-chain`. Integration base verified: `master`
(`refs/remotes/origin/master`). Tracker branch: `feature/fase6-sdk` (draft,
no-merge until every child is reviewed and integrated).

Why a chain: the phase is 21 commits and ~18,200 changed lines. A single PR
would put that in front of one reviewer at once; the native review authority
cannot be used in this environment either (see `docs/KNOWN-ISSUES.md` KI-1), so
the PR surface is the review mechanism.

## Honest sizing statement

One slicing pass was made, by cohesive work unit. **No slice fits the ~400-line
review budget**, and no further split is honest: each unit below is one
behaviour (SDK foundation, SDK APIs, React binding, architecture rules + demo,
vocabulary + docs, hardening + package merge) and splitting inside them would
separate tests from the behaviour they pin, or land a package that does not
compile on its own. Reported final counts:

| # | branch | PR diff (vs previous) | commits |
| --- | --- | --- | --- |
| 1 | `fase6/01-sdk-core` | 23 files, +2,379 / −3 | 6 |
| 2 | `fase6/02-sdk-apis` | 31 files, +4,685 / −19 | 5 |
| 3 | `fase6/03-react-binding` | 14 files, +1,669 | 1 |
| 4 | `fase6/04-arch-and-demo` | 12 files, +2,275 | 2 |
| 5 | `fase6/05-vocabulary-and-docs` | 32 files, +4,385 / −204 | 2 |
| 6 | `fase6/06-hardening-and-merge` | 91 files, +3592 / −1205 | 6 |

Slices 1, 3 and 4 are the cheapest to review first. Slice 6 is the only one that
cannot shrink: it contains the single package merge, whose deletions are the
whole point.

## Dependency diagram

Copy this block into every PR body and mark the current one with `📍`:

```text
master
  └─ feature/fase6-sdk                     tracker (draft, no-merge)
       ├─ fase6/01-sdk-core                → tracker
       ├─ fase6/02-sdk-apis                → 01
       ├─ fase6/03-react-binding           → 02
       ├─ fase6/04-arch-and-demo           → 03
       ├─ fase6/05-vocabulary-and-docs     → 04
       └─ fase6/06-hardening-and-merge     → 05   ← closes the feature
```

Marker per PR: `01`…`06` in order, exactly one `📍` in each body.

## PR 1 — SDK foundation

- **Branch:** `fase6/01-sdk-core` → **base:** `feature/fase6-sdk`
- **Commits:** `7cce731` … `2300b91` (6)
- **Scope:** the searchable part of the public contract. `@nodera/sdk` package
  bootstrap, closed `sdk.*` diagnostic codes, `Result`-based failures with
  `assertOk`/`assertValid`, the authoring translation (ports by direction,
  property shorthand, node/edge definitions with `type`/`label` → `id`/`name`),
  and the engine-agnostic adapter port with capability diagnostics. Plus the
  additive `EditorEngineOptions.domain` the composition root needs.
- **Starts at:** nothing — base `master`.
- **Ends at:** a package that translates authored definitions and validates them
  with the core's own validators; no builder, no React.
- **Verification:** `pnpm --filter @nodera/sdk test` (64 tests at this commit),
  `pnpm --filter @nodera/application test`, both typechecks.
- **Out of scope:** the builder, any API facade, docs, demos.

## PR 2 — SDK builder and APIs

- **Branch:** `fase6/02-sdk-apis` → **base:** `fase6/01-sdk-core`
- **Commits:** `e194784` … `bc0d51f` (5)
- **Scope:** `createBuilder` and its validated configuration, feature resolution,
  transactional definition registration, the Graph, Document, Event, Plugin,
  Theme and Layout facades, the public barrel and the single-`Result`-level
  policy. Moves the Phase 5 panel/tool presets into `ui-core` so the agnostic
  builder can compose them.
- **Starts at:** PR 1 merged into the tracker.
- **Ends at:** a headless SDK a host can drive end to end, proven by
  `src/public-api.test.ts` importing only the barrel.
- **Verification:** `pnpm --filter @nodera/sdk test` (169 tests at this commit),
  `pnpm --filter @nodera/ui-core test`, `pnpm --filter @nodera/ui-react test`
  (the preset move must not change any Phase 5 behaviour).
- **Out of scope:** React, demos, architecture rules.

## PR 3 — React binding

- **Branch:** `fase6/03-react-binding` → **base:** `fase6/02-sdk-apis`
- **Commits:** `7e9dec1` (1)
- **Scope:** the binding package: opaque renderer → React registry conversion
  with type validation, `NoderaBuilderProvider` consuming the builder's own
  store and registries, `useBuilder`, `createReactFlowAdapter`, `<NoderaEditor>`
  with `slots`/`layout` overrides and feature-flag gating.
- **Starts at:** PR 2 merged.
- **Ends at:** a host renders a builder with two imports.
- **Verification:** `pnpm --filter @nodera/sdk-react test` (33 tests at this
  commit), typecheck, `node scripts/check-architecture.mjs`.
- **Out of scope:** the package merge (PR 6), the demo (PR 4).

## PR 4 — Architecture rules and the host demo

- **Branch:** `fase6/04-arch-and-demo` → **base:** `fase6/03-react-binding`
- **Commits:** `05a7056`, `ec2fc9a` (2)
- **Scope:** the executable boundary rules for the SDK, and
  `examples/phase6-demo`, which imports only the two public packages and
  exercises every API through its UI.
- **Starts at:** PR 3 merged.
- **Ends at:** the phase's stated result becomes testable — a third party
  integrates without touching an internal module, and the demo's import guard
  fails if that stops being true.
- **Verification:** `node scripts/check-architecture.mjs`,
  `pnpm --filter @nodera/phase6-demo build`,
  `node examples/phase6-demo/src/imports.test.ts`.
- **Out of scope:** documentation, the package merge.

## PR 5 — Public vocabulary and documentation

- **Branch:** `fase6/05-vocabulary-and-docs` → **base:** `fase6/04-arch-and-demo`
- **Commits:** `9de4362`, `a87970c` (2)
- **Scope:** the published type vocabulary (so a host stops deriving types with
  `Parameters<Builder[…]>`), the renderer-only edge hints wired end to end
  (`strokeWidth`/`dashArray` actually drawn), one error shape across the public
  surface, and the documentation set: package READMEs, the third-party SDK
  guide, the project-structure section and the roadmap entry.
- **Starts at:** PR 4 merged.
- **Ends at:** what a third party reads matches what the code does.
- **Verification:** `pnpm --filter @nodera/canvas-react-flow test`,
  `pnpm --filter @nodera/sdk test`, `pnpm --filter @nodera/sdk-react test`,
  demo build.
- **Out of scope:** behaviour changes beyond the edge hints.

## PR 6 — Hardening and the package merge

- **Branch:** `fase6/06-hardening-and-merge` → **base:** `fase6/05-vocabulary-and-docs`
- **Commits:** `224b9d4`, `89eca9c`, `f7d01be`, `1de9753`, `d305c42`, `26678db` (6)
- **Scope:** the never-throw and `dispose()` contract remediation with its
  permanent guard (`public-contract.test.ts`), the merge of
  `@nodera/canvas-react-flow` + `@nodera/sdk-react` into `@nodera/react-flow`,
  the plugin-event and serializer-contract fixes from review round 2, and the
  review finding `R3-001` (silent loss of declared edge style keys) with its
  test.
- **Starts at:** PR 5 merged.
- **Ends at:** the feature closes.
- **Verification:** full `pnpm turbo run test --force`, `typecheck`, `build`,
  `node scripts/check-architecture.mjs`, all three demo builds.
- **Out of scope:** anything new — this PR only hardens and consolidates.

## Out of scope for the whole chain

Phases 7 and 8: plugin manifests, dependency resolution, lifecycle, conflict
detection, example plugins, bundling/`exports` maps, publishing, accessibility
and internationalization work. Nothing in this chain changes the GGD contract or
the application `EventBus`.

## Review record

Two independent verification rounds ran on the accumulated branch before this
plan: round 1 returned FAIL (six throw paths, a false `dispose()` contract),
round 2 returned PASS WITH FIXES (a throwing plugin install emitted no event, an
untested serializer contract) — both closed. The native RDD review ran slice 1
and produced one real CRITICAL finding (`R3-001`, fixed here) before the review
authority became unusable; see `docs/KNOWN-ISSUES.md` KI-1.
