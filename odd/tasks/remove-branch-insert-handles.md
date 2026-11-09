# Remove branch insert handles; runtime-editable edge "+"

Two-to-three-line header: remove the `insertHandles` placement option, the
branching "+" affordance and `insertNodeBeforeBranching` from the SDK; keep only
the per-edge "+" and make it runtime-toggleable so the demo can edit it.

## Specs

- S1: "La opción de insert handle para el tema del simbolo '+' no tiene sentido porque es mejor tener un nodo especifico que bifurque."
- S2: "Puedes quitarlo del SDK y todas sus referencias?"
- S3: "Debe salir solo en cada rama." — the "+" affordance remains only per edge; the branching "+" disappears entirely.
- S4: "en el ejemplo veo que la opcion de que aparezcan esta on pero no es editable, cambialo." — the edge "+" becomes runtime-editable from the demo.
- S5 (user decision via question): "Eliminarla también" — remove `builder.graph.insertNodeBeforeBranching` together with the option; a host that wants to branch defines its own fork node and inserts it with the normal use cases.

## Tasks

- T1 (S1,S2,S3,S5): sdk+ui-core+application — remove `graph.layout.insertHandles` configuration, validation, `resolveInsertHandlesPolicy`, `insertHandlesPolicy`/`setInsertHandlesPolicy`, `InsertHandlesPolicy` type and `insertHandles` store state; remove `insertNodeBeforeBranching` from `graph-api`, the application use case and its export. Route: delegated worker. Commit: feat/tech — see Log.
- T2 (S1,S2,S3): react-flow — remove the branching "+" affordance (`wantsBranchHandle`, `edgeOffersInsertHandle` policy logic, `insertHandles` prop) and the editor passthrough. Route: delegated worker (same unit as T1). Commit: with T1.
- T3 (S4): sdk+ui-core+react-flow — make the edge "+" runtime-toggleable: `edgeInsertion` presentation state in the ui-core store seeded from `features.edgeInsertion`, runtime setter on `builder.features`, editor reads the store. Route: inline (design-sensitive), test-first. Commit: own unit.
- T4 (S2,S4): example layout-switch-demo — remove the `Insert handles` select, add an editable edge "+" toggle wired to the new runtime setter, update the note text, `builder.ts` and the demo README. Route: inline. Commit: own unit.
- T5 (S2): docs — SDK README, docs/SDK-GUIDE.md, docs/GRAPH-LAYOUT.md, packages/react-flow/README.md, demo README table: drop insert-handle/branching sections and document the runtime toggle. Route: inline. Commit: own unit.
- T6 (S2,S3,S4): verification — typecheck+tests for affected packages, `check:architecture`, `git diff` review; record commits here. Route: inline.

## Log

- L1 (user request, verbatim): "La opción de insert handle para el tema del simbolo '+' no tiene sentido porque es mejor tener un nodo especifico que bifurque. Puedes quitarlo del SDK y todas sus referencias? Debe salir solo en cada rama. Además. en el ejemplo veo que la opcion de que aparezcan esta on pero no es editable, cambialo."
- L2 (user decision): asked what to do with `builder.graph.insertNodeBeforeBranching`; user selected "Eliminarla también".

- L3: T1+T2 delivered in commit abbc95d (refactor(layout): remove insert-handle placement option and insertNodeBeforeBranching). Slice is intentionally one cohesive removal unit (~2270 lines, mostly deletions); per delivery strategy the remaining tasks are separate small commits.
- L4: T5 (documentation) completed. Dropped insertHandles, InsertHandlesPolicy, setInsertHandlesPolicy, before-branching, insertNodeBeforeBranching and the branching "+" from docs/SDK-GUIDE.md, docs/GRAPH-LAYOUT.md, packages/sdk/README.md, packages/react-flow/README.md and examples/layout-switch-demo/README.md. Documented the per-edge "+" runtime toggle (builder.features.edgeInsertion / builder.features.setEdgeInsertion). Struck through S23 and J in odd/tasks/layout-interaction-and-edge-insert.md.
