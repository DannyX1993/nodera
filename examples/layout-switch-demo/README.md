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

## The options panel

The page is a compact header plus the canvas. The header carries the title, a
one-line summary of every option's current value, and an **Options** disclosure —
a native button with `aria-expanded` and `aria-controls` — that opens one panel
above the canvas. The panel is the host's own HTML: nothing about it reaches the
framework, which still ships no runtime toggle for placement (S20).

The panel holds three labelled groups (`fieldset` / `legend`), and every control
is a native element named by its own visible label. Each policy control reads its
value from the builder — `graphLayout.active()`, `dragPolicy()`,
`connectionsPolicy()`, `portsPolicy()`, `arrangeOnChange()`, `removalPolicy()` —
and writes it back through the documented SDK call, so no control can drift from
the policy the canvas is really applying. A refused value leaves both the control
and the canvas on the previous one, and the diagnostic is printed in the status
line. Direction and the two spacings are per-call overrides: they start from the
`graph.layout` the demo declares, win for one `Arrange`, and are never stored.

### Layout

| Control           | Values                                   | SDK surface |
| ----------------- | ---------------------------------------- | ----------- |
| Strategy          | `nodera.graph-layout.layered` / `…free`  | `builder.graphLayout.setDefault(id)` — and then one `arrange`, plus the surface that strategy implies |
| Direction         | `horizontal` / `vertical`                | `builder.graph.arrange({ direction, … })` |
| Spacing           | number, document units                   | `builder.graph.arrange({ spacing, … })` |
| Rank spacing      | number, document units                   | `builder.graph.arrange({ rankSpacing, … })` |
| Arrange on change | `never` / `downstream`                   | `builder.graphLayout.setArrangeOnChange(policy)` |
| On remove         | `detach` / `splice`                      | `builder.graphLayout.setRemovalPolicy(policy)` |

### Surface

| Control     | Values                          | SDK surface |
| ----------- | ------------------------------- | ----------- |
| Manual drag | `free` / `locked` / `snap-back` | `builder.graphLayout.setDragPolicy(policy)` |
| Node transition | `instant` / `animated` | `builder.graphLayout.setNodeTransition(policy)` |
| Connections | `editable` / `fixed`            | `builder.graphLayout.setConnectionsPolicy(policy)` |
| Ports       | `visible` / `hidden`            | `builder.graphLayout.setPortsPolicy(policy)` |
| Edge "+"    | `on` / `off`                    | `builder.features.setEdgeInsertion(value)` — a runtime toggle, seeded from `builder.features.edgeInsertion` |

### Actions

| Action                       | Enabled when              | SDK surface |
| ---------------------------- | ------------------------- | ----------- |
| `Arrange`                    | always                    | `builder.graph.arrange({ … })` — one explicit history unit |
| `Arrange from "<node>"`      | exactly one node selected | `builder.graph.arrange({ from, … })` — only that node and its descendants are written |
| `Add node…`                  | always                    | `CreateNodeButton` → the node-creation dialog → `builder.graph.addNode({ after })` |
| `Remove "<node>"`            | exactly one node selected | `builder.graph.removeNode(id)` — follows `onRemove` |
| `Reset graph`                | always                    | `resetDemoGraph` — `disconnect`, `removeNode`, then the boot seed |

## What it demonstrates

The graph is a five-node pipeline (`ingest → parse, enrich → score → publish`)
seeded through `builder.graph.addNode` **without positions**. The builder
declares `graph.layout: { mode: "auto", direction: "horizontal", spacing: 240,
rankSpacing: 280 }`, so the seed nodes are first placed on a deterministic grid.

Pressing **Arrange** is the only thing that re-places the whole graph. It is one
explicit action and one history unit: `builder.graph.undo()` puts every previous
position back (including the absence of a position). Selecting
`nodera.graph-layout.free` makes the next Arrange an honest no-op that moves
nothing and pushes no history entry.

**`Arrange from "<node>"` is the scoped call.** The strategy still ranks the
whole graph, but only the selected node and the nodes reachable from it by
following edges outward receive their position; everything else keeps the place
it had. It is still one history unit.

The **overrides are per call**: direction, spacing and rank spacing win for that
one Arrange and are never stored. Clear a spacing field (or type `0`) and press
Arrange to see the SDK refuse the switch with an `sdk.invalid-input` diagnostic
at `spacing` or `rankSpacing` — the status line prints it and nothing moves.

**`Arrange on change: downstream`** makes a structural change arrange by itself:
after an insertion or a connection, the builder ranks the changed node and its
descendants in a **second** history unit. One `undo()` steps the arrangement
back, a second undoes the mutation. `never` keeps the rule that only an explicit
Arrange moves a node.

**`On remove: splice`** makes `builder.graph.removeNode` join each predecessor to
each successor inside the removal's own history unit, so the hierarchy above and
below stays connected through one hop. `Remove "<node>"` is the control that
calls that path; one `undo()` restores the node with its original edges.

The **`Add node…`** button opens the framework's node-creation dialog, which
lists the definitions the host registered. The host handles the selection itself
and adds the node with `builder.graph.addNode` — anchored on the single selected
node, so `mode: "auto"` gives it the next free slot after it, or at the end of
the graph with no selection. The status line reports where it landed and which
history units the add-and-connect produced.

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
**placeholders**. With no node the canvas draws a dashed placeholder node carrying
the "`+`"; with exactly one node it adds the dashed placeholder past it plus a
dashed connector between the two; from two nodes on, every **leaf** (a node with
no outgoing edge and a source-capable port) gets one dashed successor placeholder
of its own, one step past it along the arranged axis, joined by a dashed connector
with the "`+`" at its midpoint. A leaf with no output port gets nothing, so the
canvas never offers an insertion the graph cannot perform.
Clicking any of those "`+`" opens the same dialog and the host sees
`pendingAppendAnchorId` in the UI state: it appends with
`builder.graph.addNode({ type, after: anchor })` and then connects the pair with
`builder.graph.connect`. That is **two history units** — create, then connect —
which the status line says out loud, because one undo removes the edge and a
second removes the node; a single-unit append needs an application use case the
framework does not have yet. The demo passes its own `direction` as
`NoderaEditor.layoutDirection`, so switching to a vertical arrangement steps the
placeholders downwards. The placeholders themselves are presentation only: they
are drawn as an overlay in flow coordinates, they never reach
`builder.graph.nodes()` or `builder.graph.edges()`, the history, the minimap or
the `nodes`/`edges` arrays the canvas hands to React Flow, and each one disappears
as soon as its node gains a successor.

**`Reset graph`** empties the graph through the public API — every edge, then
every node, so the result does not depend on `onRemove` — and re-seeds it with
the boot seed from `src/builder.ts`, then arranges it with the values the
controls currently hold. Each step is its own history unit; a reset is not a
single undoable action, and the demo does not pretend otherwise.

The **Manual drag**, **Node transition**, **Connections** and **Ports** selects are
the surface the arrangement implies. They start from the builders' getters, and
choosing a strategy still applies what it implies: `nodera.graph-layout.layered`
calls `setConnectionsPolicy("fixed")` and `setPortsPolicy("hidden")`, so the canvas
offers no handle to drag a connection from and refuses one that arrives anyway;
`nodera.graph-layout.free` restores `"editable"` and `"visible"`. None of the
three writes a document position, an edge or a history entry, so an `Arrange`
after switching behaves exactly as before. The demo boots on
`Node transition: animated`, which is what makes the snap-back visible at all.

## What to try

- **The layout owns everything**: `layered` + `Manual drag: locked` +
  `Connections: fixed` + `Ports: hidden`. Try to move a node — the canvas
  refuses — and look for a port handle: there is none. Then switch to `free` +
  `snap-back` + `editable` + `visible` and drag, connect and drop freely.
- **Snap-back, visible**: `layered` + `Manual drag: snap-back` +
  `Node transition: animated`. Drag `parse` somewhere and release: the node
  glides back to its assigned slot instead of jumping there. Switch the
  transition to `instant` and repeat: same policy, same documents, but the return
  is now a jump between two frames — which is exactly what the control toggles.
- **Downstream arrangement**: `layered` + `Arrange on change: downstream`.
  Select `parse`, press `Add node…`: the node takes its anchored slot as one
  history unit, then `connect` re-ranks it as a second one. Undo twice and watch
  the two units come apart.
- **Splice on removal**: `layered` + `On remove: splice`. Select `score`, press
  `Remove "score"`, and `parse`/`enrich` end up connected to `publish`; one undo
  restores the node and its three original edges. Repeat with `detach` to see the
  hierarchy fall apart instead.
- **Scoped versus whole arrangement**: set `Manual drag: free` and drag `ingest`
  far away, then select `parse` and press `Arrange from "parse"` — only the
  selected node and its descendants move. Press `Arrange` to pull `ingest` back
  into the ranks.

## The switching belongs to the host

There is no framework toggle for placement. The Nodera SDK ships configuration
(`graph.layout`) and one explicit command (`graph.arrange(options?)`), and the
React Flow binding renders the canvas from the document. The panel in
`src/app.tsx` — the disclosure, the three groups, the seven selects, the two
number fields and the five actions — is plain host HTML/CSS **above** the canvas,
never inside it, and every control calls the public SDK. A host that wants its
own placement UI writes exactly this page; the framework still adds none.

## Files

| File              | Role                                                          |
| ----------------- | ------------------------------------------------------------- |
| `src/main.tsx`    | Mounts the app inside `NoderaBuilderProvider`; loads the canvas engine stylesheet |
| `src/builder.ts`  | The whole composition: one `createBuilder`, the seed and its reset |
| `src/nodes.ts`    | Three node definitions (the vocabulary the dialog offers)      |
| `src/app.tsx`     | The options panel, the status line and `<NoderaEditor>`        |
| `index.html`      | Host chrome only (this demo's own page layout and controls)    |

## Limitations, stated rather than hidden

- **There is no automated test for this example.** The repository has no test
  runner wired for `examples/`; the demo is verified by `typecheck` and `build`,
  and by reading the status line while clicking. The SDK behavior behind every
  control is covered by the SDK's own tests.
- **The canvas' Delete key is not policy-aware.** `onRemove` is honoured by
  `builder.graph.removeNode`, which the panel's `Remove "<node>"` action calls.
  The canvas deletes through the application use case directly, so pressing
  `Backspace` removes a node with its edges whatever the policy says — a
  framework gap this demo reports instead of hiding.
- **Edge insertion is toggleable.** `builder.features.setEdgeInsertion(value)` flips it
  at runtime; the canvas re-renders from the UI store without a rebuild, so the host
  writes the toggle without touching the builder.
- **The per-edge "+" is wired by the host.** The framework's dialog records the
  edge and the demo's `onAddNode` handler runs
  `builder.graph.insertNode`; the built-in dialog command covers it.
- No node renderers are registered: the binding's default node renderer draws
  the three definitions. This demo is about placement, not drawing.
- The layered strategy ranks by longest path and orders each rank by node id. It
  reduces crossing edges by ordering each rank around its parents, but does not guarantee a
  crossing-free drawing, and produces no edge bend points.
- The status line is the only observability: the host reports its own
  diagnostics instead of relying on a console.
