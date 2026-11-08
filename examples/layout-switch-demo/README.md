# Layout-switch demo

A runnable host application that switches how a Nodera graph is laid out, and
adds nodes through the built-in node-creation dialog — all from **its own** UI.

```sh
pnpm --filter @nodera/layout-switch-demo dev      # http://127.0.0.1:5177
pnpm --filter @nodera/layout-switch-demo build    # production bundle
pnpm --filter @nodera/layout-switch-demo typecheck
```

The demo imports `@nodera/sdk`, `@nodera/react-flow` and `@nodera/ui-react` and
nothing else from the workspace. Its dependency set is the same one
`examples/phase6-demo` declares (plus `@nodera/ui-react` for the dialog and the
"+" affordance); it adds no external package and no styling framework.

## What it demonstrates

The graph is a five-node pipeline (`ingest → parse, enrich → score → publish`)
seeded through `builder.graph.addNode` **without positions**. The builder
declares `graph.layout: { mode: "auto", direction: "horizontal", spacing: 240,
rankSpacing: 280 }`, so the seed nodes are first placed on a deterministic grid.

| Control      | What it calls                                                        |
| ------------ | -------------------------------------------------------------------- |
| Strategy     | `builder.graphLayout.setDefault(id)` — `…layered` or `…free`          |
| Direction    | passed to `builder.graph.arrange({ direction })`                      |
| Spacing      | passed to `builder.graph.arrange({ spacing })`                        |
| Rank spacing | passed to `builder.graph.arrange({ rankSpacing })`                    |
| Arrange      | `builder.graph.arrange({ direction, spacing, rankSpacing })`          |
| Drag         | `builder.graphLayout.setDragPolicy(policy)` — `locked`, `snap-back`, `free` |
| "+"          | `CreateNodeButton` → the built-in node-creation dialog               |
| "+" on an edge | `features.edgeInsertion` → the canvas affordance → `builder.graph.insertNode` |
| "+" on the phantom | `features.edgeInsertion` with 0 or 1 node → `addNode({ after })` + `connect` |

Pressing **Arrange** is the only thing that re-places nodes. It is one explicit
action and one history unit: `builder.graph.undo()` puts every previous position
back (including the absence of a position). Selecting
`nodera.graph-layout.free` makes the next Arrange an honest no-op that moves
nothing and pushes no history entry.

The **overrides are per call**: they win for that one Arrange and are never
stored. Clear a spacing field (or type `0`) and press Arrange to see the SDK
refuse the switch with an `sdk.invalid-input` diagnostic at `spacing` or
`rankSpacing` — the status line prints it and nothing moves.

The **"+"** button opens the framework's node-creation dialog, which lists the
definitions the host registered. The host handles the selection itself and adds
the node with `builder.graph.addNode`, so `mode: "auto"` gives it a free slot;
the status line reports where it landed. Press Arrange to rank it with the rest.

The builder declares `features: { edgeInsertion: true }`, so the canvas paints a
**"+" on every edge** as well. Clicking it opens the same dialog on that edge;
the host sees `pendingEdgeInsertId` in the UI state and inserts with
`builder.graph.insertNode`, so the chosen node lands between the two endpoints
(`ingest → parse` becomes `ingest → new → parse`) as a single history unit: one
undo restores the original edge. A refused insertion prints the SDK diagnostic in
the status line and leaves the graph untouched. The button is the framework's
default; `NoderaEditor.renderEdgeInsert` replaces it when a host wants its own
icon or control.

An empty graph has no edge to paint a "+" on, so the same flag also paints the
**phantom empty state**: with no node the canvas draws a dashed placeholder node
carrying the "`+`", and with exactly one node it adds the dashed placeholder
beside it plus a phantom edge between the two. Clicking that "`+`" opens the same
dialog and the host sees `pendingAppendAnchorId` in the UI state: it appends with
`builder.graph.addNode({ type, after: anchor })` and then connects the pair with
`builder.graph.connect`. That is **two history units** — create, then connect —
which the status line says out loud, because one undo removes the edge and a
second removes the node; a single-unit append needs an application use case the
framework does not have yet. The phantoms themselves are presentation only: they
never reach `builder.graph.nodes()`, the history or the minimap, and they vanish
once the graph holds two nodes.

The **Drag** select calls `builder.graphLayout.setDragPolicy` and starts from
`builder.graphLayout.dragPolicy()`, so it always shows the policy the canvas is
applying. The demo configures `mode: "auto"` without a `drag` value, which means
`locked`: try to move a node and the canvas refuses. `snap-back` lets it follow
the pointer and returns it to its placed position on release, and `free` restores
the drag-and-commit behaviour. None of them changes a position by itself, so an
`Arrange` after switching behaves exactly as before.

## The switching belongs to the host

There is no framework toggle for placement. The Nodera SDK ships configuration
(`graph.layout`) and one explicit command (`graph.arrange(options?)`), and the
React Flow binding renders the canvas from the document. The strategy select,
the direction select, the drag select, the two number fields, the Arrange button
and the "+" affordance in `src/app.tsx` are plain host HTML/CSS **above** the
canvas — never inside it — and every one of them calls the public SDK. A host
that wants its own placement UI writes exactly this page; the framework still
adds none.

## Files

| File              | Role                                                          |
| ----------------- | ------------------------------------------------------------- |
| `src/main.tsx`    | Mounts the app inside `NoderaBuilderProvider`; loads the canvas engine stylesheet |
| `src/builder.ts`  | The whole composition: one `createBuilder`, seeded graph       |
| `src/nodes.ts`    | Three node definitions (the vocabulary the dialog offers)      |
| `src/app.tsx`     | The host controls, the status line and `<NoderaEditor>`        |
| `index.html`      | Host chrome only (this demo's own page layout)                 |

## Limitations, stated rather than hidden

- No node renderers are registered: the binding's default node renderer draws
  the three definitions. This demo is about placement, not drawing.
- The layered strategy ranks by longest path and orders each rank by node id. It
  does no crossing minimization and produces no edge bend points.
- The status line is the only observability: the host reports its own
  diagnostics instead of relying on a console.
