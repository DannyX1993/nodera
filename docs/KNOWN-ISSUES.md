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
