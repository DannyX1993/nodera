# Known issues

Defects found while working on the repository that are **not** product bugs and
cannot be fixed from inside it. Each entry names what broke, the exact evidence,
and what to do instead until it is fixed.

---

## KI-1 — The native review lifecycle cannot complete in this environment

**Status:** open, blocking receipt-driven development (RDD) only.
**Discovered:** 2026-11-08, Phase 6 (`feature/fase6-sdk`), review slice 1.
**Affects:** `gentle-pi` review facade + `gentle-ai` binary schema agreement.

### Symptom

A review transaction can be started, its reviewers and refuter run, and a
correction plan is accepted — but the correction can never be validated, so the
transaction stays in `correction_required` forever.

### Evidence

1. The provider-issued correction-validation slot cannot be submitted through the
   facade. Three attempts (serialized and object binding, each after a fresh
   `STATUS`) were refused with:

   ```
   outcome: capture-binding-rejected
   reason:  collectBinding is missing or stale for current STATUS
   ```

   The slot carries the *correction* target (`sha256:b3279b3b…`), not the
   authority target, and no facade tool accepts a non-ordinary slot.

2. There is no second route. The native binary exposes no capture operation:

   ```
   $ gentle-ai review capabilities   # operations[]
   review.bind_sdd, review.capabilities, review.finalize,
   review.start, review.status, review.validate
   ```

3. The authority store is unreadable by the binary that owns it:

   ```
   $ gentle-ai review status
   status: "invalid", complete: false, authoritative: false
   entries[0].problems: ["json: unknown field \"generated_path_interpretation\""]
   locks[0].status:    "ambiguous"
   locks[0].problem:   "parse lock owner: EOF"
   ```

   The facade writes a transaction field the binary does not know, and left a
   truncated lock file. Versions in play:

   | component | version |
   | --- | --- |
   | `gentle-ai` package | `2.1.11` (stable) |
   | `gentle-ai` module | `v1.49.1-0.20260720214945-51a5d9e20706` |
   | review contract | `gentle-ai.review-integration/v2` |
   | CLI-reported contract | `gentle-ai.review-integration/v1` |

   That last row is the defect in one line: the facade drives a **v2** contract
   while the binary advertises and parses **v1**.

### What to do instead

- **Review by pull request.** The PR surface works; the RDD transaction surface
  does not. Split delivery so each PR is a reviewable unit.
- **Do not** repeatedly start transactions: `reviewDue` from `assess` and the
  native `start` already disagreed once on this branch (`reviewDue: false`
  while the harness held an unreviewed candidate).
- **Do not** RESET, ABANDON or RECOVER to "clear" it. They are audited
  destructive mutations, they require an explicit human decision, and the schema
  skew will recreate the corruption on the next transaction.
- A stuck lineage does not corrupt the working tree, the index or any commit:
  the code, tests and history are unaffected.

### Reproduction

```bash
gentle-ai review status            # → status: invalid, unknown field, truncated LOCK
# any facade-driven transaction that reaches a correction cannot proceed past
# the targeted-validation step
```

### Resolution criteria

The facade and the binary must agree on one review-integration contract version,
the binary must parse every field the facade writes (`generated_path_interpretation`),
and a lock left mid-write must be recoverable. Until then this entry stays open.

---

## KI-1 — consequence for delivery

Delivery for `feature/fase6-sdk` therefore goes through pull requests, not the
RDD transaction surface. The chain is `feature-branch-chain` with
`feature/fase6-sdk` as draft tracker and six child branches; see
`odd/tasks/fase6-sdk-pr-chain.md` for the boundaries, the dependency diagram and
the per-PR verification plan. That document is also the record of the review
evidence gathered before the authority broke: two independent verification
rounds and one native review slice with a real CRITICAL finding (`R3-001`).

### KI-1 — delivery correction

The six `fase6/*` slice branches were cut as **cumulative tips of one linear
history**, so every slice is already contained in `feature/fase6-sdk` and a
merge into it is a no-op. They exist for review only. The deliverable is the
single branch, mergeable into `master` as a fast-forward after manual testing.
If the PR chain is ever opened, the tracker must be re-based on `master` first;
that ref move is destructive and needs an explicit human decision.

---

## KI-2 — Definition/instance version mismatch is not validated

**Status:** open, deferred (D6 of `odd/tasks/fase8-production-readiness.md`).

A node or edge instance carrying `version: "1.0.0"` under a registered
definition whose `version` is `2.0.0` is accepted silently: nothing compares the
instance version with the definition version, so no `document.*` or `domain.*`
diagnostic is emitted. Structural validation
(`@nodera/validation`) and `@nodera/document` normalization check ids, shapes and
references, not version compatibility.

The check needs both the definition registries and the document, i.e. an
application-layer step. It was deliberately left out of Phase 8 to avoid
coupling `@nodera/document` / `@nodera/domain` to the SDK registries.

**Until fixed:** keep instance and definition versions in sync in the host, or
run the comparison in a host-side validator registered through
`ValidatorRegistry`.

---

## KI-3 — No shipped document migrations

**Status:** open, deferred (D7).

The migration port exists and is tested — `documentVersionMigrator(target,
migrations)` in `@nodera/document`, plus `DocumentMigration` and the
`migrateDocument` use case — but migrations are **host-supplied** and the
package ships none. GGD is at `1.0.0` and is the first format version, so there
is no earlier version to migrate from; shipping a migration would mean inventing
a version that never existed.

**Until fixed:** a host that evolves its own document payload registers its
migrations and calls `migrateDocument`; unknown or newer `version` values keep
producing explicit `document.*` diagnostics rather than a silent rewrite.

---

## KI-4 — 54 pre-existing lint warnings

**Status:** open, accepted.

`pnpm lint` exits 0 with 54 warnings: 36 `@typescript-eslint/no-unused-vars` and
18 `@typescript-eslint/no-explicit-any`, all pre-existing. They are kept as
warnings (not errors) in `eslint.config.mjs` so lint is real and CI is green
without a large unrelated cleanup. New errors do fail the build; new warnings
of these two rules do not.

---

## KI-5 — Coverage provider is not installed

**Status:** open, environmental.

`@vitest/coverage-v8` is not a dependency of the workspace, so `vitest run
--coverage` (and the `coverage` block in each package's `vitest.config.ts`) fails
until it is installed. Coverage is therefore opt-in and no threshold is enforced
in CI.

**Until fixed:** `pnpm add -Dw @vitest/coverage-v8` in the environment where
coverage is wanted; the thresholds already declared in the vitest configs then
apply.

---

## KI-6 — `react-hooks` lint rules are inert

**Status:** open, accepted.

`eslint-plugin-react-hooks` is not installed, so the `react-hooks` rules listed
in `eslint.config.mjs` are stubs that never report. They exist only so the
existing `eslint-disable` comments in the React packages resolve instead of
erroring on an unknown rule.

**Until fixed:** the rules are effectively unenforced; React hook dependency
mistakes are caught by review and tests, not by lint.

---

## KI-7 — `apps/*` and three `examples/*` are empty placeholders

**Status:** open, by design.

`apps/playground`, `apps/documentation`, `apps/dev-tools` and
`examples/workflow-builder`, `examples/data-pipeline-builder`,
`examples/agent-builder` are empty placeholder directories — no source, no
scripts, nothing runnable. They are documentation of intended consumers, not
working applications.

The runnable examples are `examples/phase1-demo` … `examples/phase7-demo` and
`examples/layout-switch-demo`.

---

## KI-8 — No browser E2E or visual tests

**Status:** open, deliberate (S6).

There are no Playwright/Cypress suites and no screenshot/visual regression
tests. Testing is Vitest-only: domain, use-case, contract, serialization,
plugin, adapter and jsdom-based UI tests, with no browser automation and no
visual diffing.

**Consequence:** interaction regressions that only appear in a real browser, and
visual/pixel changes, are covered by manual testing and review. Adding a browser
or visual harness needs a new explicit decision; it is not an oversight.

---

## KI-9 — Regional formatters (Intl) and full RTL layout not implemented

**Status:** open, by design (D9 deferred).

The locale contract (`@nodera/ui-core` `translate`/`Locale`) covers translated
strings and host override, but there is no `Intl`-based number/date formatting
surface and no complete RTL layout engine. No current UI component renders a
date or a regionally-formatted number (only counts and labels), so a formatter
would have no consumer yet. RTL remains composition-only: a host wraps the shell
with `dir="rtl"` and token-driven styles use logical `start`/`end` where present.

**Consequence:** hosts that need localized number/date formatting or a first-class
RTL theme must supply their own layer; the framework does not block it but does
not ship it.

---

## KI-10 — No code formatter (Prettier) wired in

**Status:** open, by design (D11 deferred).

`pnpm lint` runs ESLint only. No Prettier (or equivalent) is installed or wired,
so there is no automated code-formatting gate. Adding a formatter would require
reformatting the whole tree; it was deferred rather than landing a noisy
whitespace diff.

**Consequence:** formatting is enforced by review and by the existing style, not
by a tool. A formatting tool can be added later as its own change.

---

## KI-11 — No palette/navigator virtualization

**Status:** open, by design (D10 deferred).

`onlyRenderVisibleElements` virtualizes the canvas nodes/edges, but the node
palette and navigator/search lists render their full item set without
virtualization. There is no evidence of palettes large enough to need it yet.

**Consequence:** a host with hundreds of palette/search entries may see slower
list rendering; this becomes real work only when a measured case appears.
