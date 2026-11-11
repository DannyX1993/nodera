# Graph layout

How a Nodera graph gets its node positions, what the host declares, and how an
explicit re-arrangement is requested. The geometry itself is documented in
`packages/graph-layout/README.md`; the SDK surface in `packages/sdk/README.md`;
the runnable proof in `examples/layout-switch-demo`.

Two things are called "layout" in this repository and they are not the same one:
`@nodera/layout-engine` computes the **editor shell** (panel and shell
geometry), and `@nodera/graph-layout` computes **node positions inside the graph
document**. This page is about the second one.

## What the feature is

`position` is document data and stays optional (`packages/graph-model`). The
framework owns no placement policy: the host declares one in configuration, and
nothing moves unless the host asks.

| | Who places a node |
| --- | --- |
| `mode: "free"` (the default) | The host. A node added without a position keeps no position; the canvas adapter decides how to render it until the host places it. |
| `mode: "auto"` | The builder, and only for the nodes the host left unpositioned: the first free slot **forward** of the anchor the host names (`AddNodeRequest.after`), or the slot one step past the graph's extent when there is no anchor, at add time. A node that already carries a position is never moved. |
| `Arrange` (explicit) | The selected strategy, for the whole graph when the host calls `builder.graph.arrange()`, or only for `from` and its descendants with `arrange({ from })`. One history unit either way. |
| Downstream auto (`insertNode`, `connect`) | The selected strategy, for the node the change touched and its descendants, when the host declares `graph.layout.arrangeOnChange: "downstream"`. **A second** history unit, applied after the mutation (see [Automatic downstream arrangement](#automatic-downstream-arrangement)). |
| Edge insertion (`builder.graph.insertNode`) | The builder, in `mode: "auto"`, anchored on the edge's **source**: one step past it along the axis, exactly like an `after` anchor. In `mode: "free"` nothing. One history unit together with the node and the two edges that replace the original — plus, with `arrangeOnChange: "downstream"`, a second one for the downstream arrangement. |
| Removal splice (`graph.layout.onRemove: "splice"`) | The selected strategy, for the spliced predecessors and their descendants, when `arrangeOnChange: "downstream"` and the layout owns the positions. The removal writes no position at all: it and its spliced edges are one unit of their own, the arrangement is a **second** one. |
| Placeholder "+" (`addNode({ after })` + `connect`) | The builder, in `mode: "auto"`, anchored on the node the placeholder followed — exactly the `after` rule. The empty state covers a graph with at most one node (S7); from two nodes on, every leaf gets its own successor placeholder (S21). **Two** history units: the node, then the edge, because both are separate SDK calls (see [The phantom empty state](#the-phantom-empty-state)). |

A host that declares a ranked layout applies it once at boot — compose, seed, then
`builder.graph.arrange()` — otherwise the first paint shows the add-time grid
rather than the layout the host declared. `examples/layout-switch-demo` does
exactly that in `createDemoBuilder`, and every later recalculation is its own
explicit call.

Three invariants hold in every mode:

- **No framework default moves a node.** There is no automatic re-layout on an
  add, on an edge change or on a read. The one write a structural change may make
  on its own is the node it touched and its descendants, and only when the host
  declares `arrangeOnChange: "downstream"`.
- **A position that exists is never overwritten implicitly.** `auto` places only
  the absent ones; replacing existing positions is the explicit `Arrange`.
- **There is no runtime toggle.** Mode, direction and spacings are configuration
  the host writes, never a control the framework puts in front of a user. The one
  runtime setter, `builder.graphLayout.setDragPolicy`, writes what a manual drag
  does (see [Manual drags](#manual-drags-and-the-positions-the-layout-owns)) and
  never a position. A host that wants controls writes them itself, as the example
  does.

### Where an added node lands

`mode: "auto"` answers one slot, from three inputs and no others: the positions
the document already carries, the configured `direction` and `spacing`, and the
anchor the host names in `AddNodeRequest.after` (a node instance id).

| The request | The slot |
| --- | --- |
| `after` names a node **with** a position | The first free slot **forward** of that node along the axis, stepping by `spacing`. A taken slot pushes the candidate forward, never backward. |
| `after` names a node **without** a position | After the graph's extent: the farthest occupied slot along the axis keeps its own row, the candidate starts one step past it, the first free slot from there wins. |
| No `after` at all | The same extent rule: the new node lands at the end of the graph. |
| Empty graph | The origin. |
| An explicit `position` | Whatever the request says: it wins over any anchor. |
| `mode: "free"` | Nothing. `after` places nothing and no position is invented. |

An anchor id the graph does not contain is refused with `sdk.invalid-input` at
path `after`, and nothing is created — placement never guesses where a node it
cannot find sits. Ties on the axis are broken by the smaller perpendicular
coordinate, so the slot depends only on the set of positions: node ids and
storage order never change it.

```ts
const anchor = assertValid(builder.graph.addNode({ type: "acme.http.request" }));
const next = assertValid(
  builder.graph.addNode({ type: "acme.http.request", after: anchor.id }),
);
// next.position: one `spacing` step past the anchor along `direction`
```

**The anchor is the host's decision, never the framework's.** The palette passes
the node when exactly one is selected and nothing when the selection is empty;
the edge "+" passes the edge source. The SDK reads the anchor's position and the
graph's positions and nothing else: it never looks at a selection, a canvas or an
editor state, which is why the same document always yields the same slot.

## The layer split

Placement is not a single-layer feature. Each part lives where the architecture
puts it (AGENTS.md §4, §12; odd task S5):

| Concern | Where | What it does |
| --- | --- | --- |
| Geometry | `@nodera/graph-layout` | The strategy port, the `free` no-op, the in-house layered strategy and the registry. Plain data in, positions or a diagnostic out. No React, no React Flow, no graph instance. |
| Position writes | `@nodera/application` | `arrangeGraph(editor, { moves })` validates every id and position first, then writes the whole answer as one reversible history unit (`arrange-graph`). All-or-nothing: a rejected move writes nothing, pushes nothing and emits nothing. |
| Add-time placement | `@nodera/sdk` | `resolveGraphLayout`, `placeUnpositionedNode` and `nextFreeSlot` decide a position **before** the `add-node` use case runs, so it belongs to the same history unit as the creation. The anchor (`AddNodeRequest.after`) is a node id the host chose; the rule reads its position and the graph's, nothing else. |
| Edge insertion | `@nodera/application`, `@nodera/sdk` | `insertNodeOnEdge(editor, input)` validates the edge, the definition, the instance id and both middle ports first, then writes the node and the two halves as one reversible unit (`insert-node-on-edge`); a refusal writes nothing, pushes nothing and emits nothing. The SDK decides the position with the same placement rule, anchored on the edge source, **before** the use case runs. |
| Configuration and command | `@nodera/sdk` | `graph.layout`, `builder.graphLayout` and `builder.graph.arrange(request?)`. The SDK reads the graph as plain data, asks the selected strategy and applies the answer through the use case above. |
| Rendering and affordances | `@nodera/react-flow`, `@nodera/ui-*` | The canvas renders positions **from the document**; the node-creation dialog and its "+" affordance (which is how a node enters the graph in the first place) live in `ui-react`/`ui-core`. Neither calls `arrange`, and neither ships a placement control. |
| Drag policy | `@nodera/sdk` → `@nodera/ui-core` → `@nodera/react-flow` | `graph.layout.drag` and `builder.graphLayout.setDragPolicy` write `UiState.dragPolicy`; the canvas maps it onto `nodesDraggable` plus the drag-commit path. Reading and writing the policy moves nothing: only a `"free"` drag commits a position. |
| Node transition | `@nodera/sdk` → `@nodera/ui-core` → `@nodera/react-flow` | `graph.layout.nodeTransition` and `builder.graphLayout.setNodeTransition` write `UiState.nodeTransition`; the canvas turns it into one scoped CSS rule on its frame, so a node reaching a derived position glides there. It never animates an active drag, and it moves nothing. |
| Connections and ports policies | `@nodera/sdk` → `@nodera/ui-core` → `@nodera/react-flow` | `graph.layout.connections` / `graph.layout.ports` and `builder.graphLayout.setConnectionsPolicy` / `setPortsPolicy` write `UiState.connections` and `UiState.ports`; the canvas maps them onto `nodesConnectable` plus the connect/validation path and onto the port renderers. Neither writes an edge, a port or a history entry. |

Two consequences worth stating, because they are easy to break:

- A ui-react effect or the React Flow node state is never a source of positions.
  The mapper reads `node.position` from the document, renders the origin when the
  document carries none, and writes nothing back.
- A strategy never sees a canvas, a `Node` class or a `ReactFlowInstance`, which
  is what makes it replaceable and testable without a DOM.

## The SDK surface

`graph.layout` is optional and additive. Every field and its default:

| Field | Values | Default |
| --- | --- | --- |
| `mode` | `"free"` or `"auto"` | `"free"` |
| `direction` | `"horizontal"` or `"vertical"` | `"horizontal"` |
| `spacing` | positive finite number, document units: **gap between two neighbouring node boxes** of an `Arrange` rank, and the step between adjacent automatic slots | `240` |
| `rankSpacing` | positive finite number, document units: distance between consecutive `Arrange` ranks | the declared `spacing` |
| `nodeSize` | `{ width, height }`, positive finite numbers in document units: the fallback box of a node that carries no size of its own, so `Arrange` can reserve the room it takes | the strategy's `{ width: 140, height: 40 }` |
| `strategy` | globally qualified strategy id | `nodera.graph-layout.layered` |
| `drag` | `"locked"` or `"snap-back"`: what a manual drag does when the layout owns the positions (inert under `mode: "free"`) | `"locked"` |
| `nodeTransition` | `"animated"` or `"instant"`: whether a node moves to its new position or appears there (independent of `mode`) | `"instant"` |
| `connections` | `"editable"` or `"fixed"`: whether a person may draw a new connection (independent of `mode`) | `"editable"` |
| `ports` | `"visible"` or `"hidden"`: whether the node surface paints a port handle at all (independent of `mode`) | `"visible"` |
| `arrangeOnChange` | `"never"` or `"downstream"`: what a structural change arranges when the layout owns the positions | `"never"` |
| `onRemove` | `"detach"` or `"splice"`: what removing a node does with the relations it carried (independent of `mode`) | `"detach"` |

```ts
import { assertOk, assertValid, createBuilder } from "@nodera/sdk";
import { createReactFlowAdapter } from "@nodera/react-flow";

const builder = assertValid(
  createBuilder({
    adapter: createReactFlowAdapter(),
    registry: { nodes: [ACME_NODE] },
    graph: {
      layout: {
        mode: "auto",                            // default "free"
        direction: "vertical",                   // default "horizontal"
        spacing: 160,                            // default 240; a GAP between boxes
        rankSpacing: 320,                        // default: spacing
        nodeSize: { width: 158, height: 34 },     // default: 140 x 40, the token defaults
        strategy: "nodera.graph-layout.layered", // the built-in default
        drag: "locked",                          // default; or "snap-back"
        nodeTransition: "instant",               // default; or "animated"
        connections: "editable",                 // default; or "fixed"
        ports: "visible",                        // default; or "hidden"
        arrangeOnChange: "never",                // default; or "downstream"
        onRemove: "detach",                      // default; or "splice"
      },
    },
  }),
);

// Add time: only the nodes without a position, in the slot the anchor or the
// graph's extent points at.
const placed = assertValid(builder.graph.addNode({ type: "acme.http.request" }));
// placed.position === { x: 0, y: 0 }; with direction "vertical" the next one is
// { x: 0, y: 160 }; with `after: placed.id` it is the slot right after `placed`.
```

An invalid value is a configuration problem and fails closed: `createBuilder`
returns `err` with `sdk.invalid-input` at `graph.layout.<field>` and no builder is
created — including `graph.layout.nodeSize.width` / `.height` when the box is not
a positive finite number. Nothing is guessed.

### What `spacing` measures, and the box `nodeSize` declares

`spacing` is the **gap between two neighbouring boxes** of a rank, not the
distance between two positions. A rank therefore steps by its widest box plus
`spacing`, and the emitted position stays the box's top-left corner:

```text
pitch(rank)   = max(width of the boxes of the rank) + spacing      # `vertical`
              = max(height of the boxes of the rank) + spacing     # `horizontal`
base(i)       = i * pitch                                          # i = in-rank index
```

The cross coordinate of a node is **not** derived from the length of its rank.
The base above is only the starting point: the placement aligns each node with
its neighbours — the mean of its parents (downward pass), then the mean of its
children (upward pass) — restores the order and the `pitch` separation after
every move, and repeats that pair **once more**. Two pairs are the budget, not a
convergence loop: the first puts every node on its neighbours, the second lets a
parent the upward pass moved pull its children along. The grid then comes out
like this:

- a node with **several children** sits over the mean of those children, so a
  branch that forks has its parent in the middle of the fork;
- a node with **one parent** lands in that parent's column, so the last node of a
  branch stays in the column of the branch and its edge does not jog sideways;
- a **chain** stays one straight column, and a diamond is symmetric around its
  fork and its join;
- the answer is normalised at the end, so the graph starts at cross coordinate
  `0` in both directions.

This is a **change of meaning** worth calling out when upgrading: a `spacing` of
`240` used to put two rank neighbours `240` apart from origin to origin, and now
puts their boxes `240` apart. For a node that paints `158` wide the old grid was
`158 + 82` apart, so the same number now yields a slightly airier grid. The
earlier rule — every rank centred over the largest rank — is gone: it pushed the
last node of a short branch to the midpoint between the branches.

The box the arithmetic reads comes from, in order: the node's own `width` /
`height` (a hint a strategy may receive), then `nodeSize`, then the strategy's
`{ width: 140, height: 40 }` default — the `--ndr-node-min-width` /
`--ndr-node-min-height` token defaults of the default node renderer. `nodeSize` is
a **fallback**, never a measurement: it is configuration, never document data, and
nothing about it reaches the portable document, the history or an event. The SDK
itself passes no per-node size, because a node in `@nodera/graph-model` carries no
box; measuring one is the canvas adapter's business. `rankSpacing` is unaffected:
it still measures rank line to rank line.

### Manual drags and the positions the layout owns

A position the layout assigned is not a suggestion: a manual drag that silently
moved it would contradict the arrangement the host just applied. `graph.layout.drag`
says what the canvas does instead, and `builder.graphLayout.setDragPolicy` changes
it at runtime.

| Policy | What a drag does | Document and history |
| --- | --- | --- |
| `"locked"` (default under `mode: "auto"`) | The canvas refuses it: `nodesDraggable={false}` and no commit path. | Nothing changes; no history entry. |
| `"snap-back"` | The node follows the pointer while dragging; the release re-derives the nodes from the document. | Nothing changes; the assigned position is painted again; no history entry. |
| `"free"` (what `mode: "free"` resolves to) | Today's behaviour, unchanged: one drag commits the dropped position through `moveNode`. | One position, one history unit per dragged node. |

The policy is host configuration reflected in the UI state
(`builder.store.getState().dragPolicy`), so the canvas re-renders when the host
changes it — no rebuild, no module-level variable and no React-only context. It
never rewrites a position by itself: only a `"free"` drag writes the document.
At construction an unknown `drag` is `sdk.invalid-input` at `graph.layout.drag`
and no builder is created; at runtime `setDragPolicy` refuses the same way and the
previous policy stays, with the store and its subscribers untouched. `"free"` is
accepted at runtime (a host can hand placement back to its own drag handling) but
not in configuration, where it is what `mode: "free"` already means.

### Animated node moves

`nodeTransition` decides how a node reaches a position the canvas derives from
the document: a committed drag, an `arrange`, or the assigned position a
`"snap-back"` drag returns to.

| Transition | What the canvas does |
| --- | --- |
| `"instant"` (default, today's behaviour) | The position change is painted at once, so a `"snap-back"` release puts the node back with a jump. |
| `"animated"` | The node glides to its position with a CSS `transform` transition, so the return is visible. |

It is presentation policy: no document write, no history entry and no event, and
it applies whatever owns the positions. The value is reflected in the UI state
(`builder.store.getState().nodeTransition`), so a canvas follows a change the host
makes with `builder.graphLayout.setNodeTransition` without a rebuild; an unknown
value is `sdk.invalid-input` at `graph.layout.nodeTransition`, and the previous
transition stays.

An **active** drag is never animated — React Flow marks the dragged node, and the
canvas leaves that node out of the transition — so the node keeps following the
pointer with no lag. The motion is token-driven, like the rest of the canvas: a
host themes it with `--ndr-node-transition-duration` (default `200ms`) and
`--ndr-node-transition-easing` (default `ease`), and `prefers-reduced-motion:
reduce` turns it off whatever the configuration says, because the position is the
content and the motion is decoration.

A drag works through the same mechanism from the other side: the node follows the
pointer because the canvas paints the live positions React Flow reports (canvas
state, keyed by node id and kept only while the change is flagged `dragging:
true`), since a controlled canvas applies no position change itself. The return
the transition animates is that state dropped at the drag stop, the node
therefore re-derived from the document.

### Fixed connections and hidden ports

A graph whose positions the layout owns has a second invitation to break the
arrangement: a hand-drawn edge, or an unused port handle waiting to be dragged.
Both are the same class of problem as the drag — a person editing geometry the
arrangement does not describe — and both are answered the same way: a host
declared policy reflected in the UI state, never a framework toggle.

| Policy | What the surface does | Document and history |
| --- | --- | --- |
| `connections: "editable"` (default) | Today's behaviour: a validated connection becomes one `create-edge` history unit. | One edge, one history unit. |
| `connections: "fixed"` | No handle accepts a connection (React Flow's `isConnectable: false`, plus `nodesConnectable={false}`), `isValidConnection` answers `false` for every probe and the connect path refuses before the use case runs. | Nothing: no edge, no event, no history entry. The edges already in the document stay untouched and are still removable and selectable. |
| `ports: "visible"` (default) | Today's behaviour: every port is painted as a React Flow handle. | Nothing. |
| `ports: "hidden"` | No handle element is rendered at all — not an invisible one — so there is nothing to drag from. Node renderers keep receiving `data.ports`, so a host can still list port names in its own markup. | Nothing: hiding a handle removes a control, not a port; the document keeps its declarations. |

The two policies are **independent of `mode`**: a host that positions nodes by
hand may fix its connections (an imported graph, an inspection surface), and a
layout-owned graph may keep both defaults. They are orthogonal to each other too:
hidden ports with editable connections is a surface that shows no handle, and
visible ports with fixed connections is one that shows inert handles.

Both are host configuration with a runtime setter, and both land in the UI state
so the canvas re-renders without a rebuild:

```ts
builder.store.getState().connections; // "editable" | "fixed"
builder.store.getState().ports;       // "visible" | "hidden"
assertOk(builder.graphLayout.setConnectionsPolicy("fixed"));
assertOk(builder.graphLayout.setPortsPolicy("hidden"));
```

At construction an unknown value is `sdk.invalid-input` at
`graph.layout.connections` / `graph.layout.ports` and no builder is created; at
runtime the same code and path is returned and the previous policy stays, with
the store and its subscribers untouched. Nothing about the document is written by
either — this is presentation policy, so no history entry and no event exists for
it.

### `builder.graph.arrange(request?)`

The only command that re-places an existing graph. It reads the graph, asks the
selected strategy for `scope: "all"`, and applies the answer as **one** history
unit — so one `undo()` restores every previous position, including returning a
formerly unpositioned node to having no position.

```ts
const moved = assertOk(builder.graph.arrange()); // returns the moved instances
builder.graph.undo(); // one step: every previous position is back
```

A request overrides `direction`, `spacing` and `rankSpacing` for that one call and
persists nothing: the next call without a request reads `graph.layout` again, so a
host can switch without rebuilding the builder. A bad override is
`sdk.invalid-input` at that field and nothing moves.

#### What "scoped" means — `arrange({ from })`

The framework has no incremental ranker and does not need one. The expensive part
of an arrangement is not the computation — the strategy ranks the whole graph in
memory in one pass — it is what gets **written**: every position applied is
document state and history. So `from` scopes the **writes**, never the
computation:

- The selected strategy is still asked about the whole graph (`scope: "all"`),
  because a rank is a property of all of it and a partial answer would be a
  different geometry.
- The SDK writes the answer for `from` and for the nodes reachable from it by
  following edges **outward**, transitively — an edge that points into `from`
  never pulls its source in, and a cycle is harmless.
- Everything else keeps the position the document already held. That is asserted,
  not assumed: the tests check the untouched branch coordinate by coordinate.
- The subset is still applied through one `arrangeGraph` call, so it is one
  history unit and one `undo()` restores exactly what it wrote.
- An unknown `from` is `sdk.invalid-input` at path `from` and moves nothing;
  without `from` the call is byte-for-byte the whole-graph arrangement.

```ts
assertOk(builder.graph.arrange({ from: "acme.fetch" })); // its branch only
```

### Automatic downstream arrangement

`graph.layout.arrangeOnChange` declares what a **structural change** does with the
positions the layout owns:

| Policy | What a structural change does | History |
| --- | --- | --- |
| `"never"` (default) | Nothing: only an explicit `Arrange` moves a node, exactly as before. | — |
| `"downstream"` | After a successful `insertNode`, the inserted node and its descendants are placed; after a successful `connect`, the new edge's target and its descendants are. Nothing else moves. | A **second** unit, applied after the mutation: one `undo()` steps the arrangement back, a second one steps the mutation back. |

It is host configuration, never a user toggle, and it only takes effect in
`mode: "auto"`: in `"free"` mode the host owns every position, so nothing is
arranged automatically whatever the field says. `builder.graphLayout` reports and
changes it (`arrangeOnChange()` / `setArrangeOnChange(policy)`), and unlike the
drag, connections and ports policies it is not presentation state — it decides
document writes, so it lives in the builder and never touches `UiState`.

Two consequences worth naming:

- **The mutation always stands.** A strategy that refuses, or a position the use
  case rejects, leaves the insertion or the edge exactly where it is; the refusal
  is reported by `builder.graph.lastAutoArrangement()`, with the strategy's own
  code in `metadata.strategyCode`. Folding the geometry into the mutation would
  make an add fail for a reason the add did not cause.
- **An add arranges nothing by itself.** An unconnected node has no descendants
  and no edge to hang them from, so `addNode` only takes its anchored slot.

At construction an unknown value is `sdk.invalid-input` at
`graph.layout.arrangeOnChange` and no builder is created; at runtime it is the same
code and path and the stored policy stays.

Two honest no-ops: the `free` strategy returns no position, and so does an empty
graph — neither pushes a history entry. A strategy that answers a diagnostic makes
`arrange()` fail with `sdk.invalid-input`, keeping the geometry's own code in
`metadata.strategyCode`, and nothing is applied.

### Removal under a layout-owned graph

Removing a node from a graph the layout owns can leave the hierarchy above and
below apart. `graph.layout.onRemove` declares what happens instead:

| Policy | What a removal does | History |
| --- | --- | --- |
| `"detach"` (default) | The node and every edge it carried leave the graph; the hierarchy is left apart. Today's behaviour, byte for byte. | One unit: one `undo()` restores the node and its edges. |
| `"splice"` | The node leaves **and** each predecessor is joined to each successor, so the graph stays connected through one hop. | The same single unit: one `undo()` restores the node and its original edges, ids included, and drops every spliced edge. |

The policy is host configuration and independent of `mode` — whether a removed
node leaves a hole or is spliced over is graph semantics, not geometry.
`builder.graphLayout` reports and changes it (`removalPolicy()` /
`setRemovalPolicy(policy)`); an unknown value is refused and the stored one stays.

The splice rule, in full:

- **Ports from the edges that went away.** The predecessor's port comes from its
  incoming edge, the successor's port from its outgoing one.
- **Type from the incoming edge.** The new edge takes the removed node's
  **incoming** edge definition type; with no incoming edge there is no pair to
  write, so there is no type either. The old labels and metadata are not copied.
- **Cartesian, duplicates skipped.** Every predecessor joins every successor,
  because dropping a pair would silently sever a branch; a pair whose endpoints
  **and** ports already carry an edge is skipped instead of written twice.
- **Degrades honestly.** A node with no predecessor or no successor has no pair
  and is simply removed with its edges, in the same one unit.

With `arrangeOnChange: "downstream"` and `mode: "auto"` the spliced
**predecessors** and their descendants are arranged afterwards as a **second**
history unit, so the branch settles into the new ranks: one `undo()` steps the
arrangement back, a second one restores the removal. A refused arrangement never
fails the removal — `builder.graph.lastAutoArrangement()` reports it. With
`"detach"` nothing is arranged, exactly as before.

The placement rule behind the answer (longest-path ranks, the relaxation cap, the
rank of the isolated and cycle-locked nodes, the barycenter ordering of each rank
with node id as its tie-break, the two axes, `all` vs `unpositioned`) is
documented once, in `packages/graph-layout/README.md`.

### `builder.graph.insertNode(request)`

Splitting an edge is one mutation. `source --edge--> target` becomes
`source --> node --> target` through the `insert-node-on-edge` application use
case: the node and both halves are created and the original edge is removed as
**one** history unit, so one `undo()` restores the original edge — same id, same
ports — and leaves no trace of the node or the two edges. The original source and
target ports stay on their own endpoints; the inserted node contributes its own
first input and first output port.

```ts
const { node, edges } = assertValid(
  builder.graph.insertNode({ edgeId, type: "acme.http.retry" }),
);
builder.graph.undo(); // one step: the original edge is back
```

The position is the placement rule of
[Where an added node lands](#where-an-added-node-lands), with the **edge source as
the anchor**: in `mode: "auto"` the node lands one step past the source along the
axis, and a slot the graph already occupies pushes it forward, never backward. In
`mode: "free"` no position is invented and the node stays unpositioned. The slot
is decided **before** the use case runs, so it belongs to the same history unit as
the insertion instead of being a second undo step.

Nothing is guessed when the request is refused: an unknown `edgeId` is
`sdk.invalid-input` at path `edgeId`, an unknown `type`, a taken `nodeId` or a
definition without a usable input / output port carry the use case's own code in
`metadata.useCaseCode`, and no graph write, history entry or event happens.

### The "+" on an edge

`features.edgeInsertion` is the host-side boot default for the affordance, and it
is **off** by default: the framework adds no control to the canvas unless the
host asks (`createBuilder({ features: { edgeInsertion: true } })`, reported as
`builder.features.edgeInsertion`). The affordance is runtime state as well:
`builder.features.setEdgeInsertion(enabled)` flips it without a rebuild (a
non-boolean is refused with `sdk.invalid-input` at `features.edgeInsertion`, a
disposed builder with `sdk.disposed`). When it is on, the React Flow canvas
paints one native, keyboard-reachable "+" (`aria-label="Insert node"`) at the
midpoint of every edge — registered custom edge renderers included — and one
click runs the whole flow:

1. the canvas records the edge as `UiState.pendingEdgeInsertId` and opens
   `nodera.dialog.create-node` through `useDialogActions`;
2. the user picks a definition in the usual node-creation dialog (a
   `DialogDefinition`, customisable like any other);
3. the selection dispatches `{ kind: "insert-node", edgeId, definitionId }`,
   which the host runs as `builder.graph.insertNode({ edgeId, type })` — one node
   plus two edges replacing the original, as **one** history unit, so one `undo()`
   restores the original edge.

The pending edge is presentation state only: it never enters the portable
document, `builder.graph.nodes()`/`edges()` never see it, and it is cleared when
the insertion completes and whenever the dialog closes. A refused insertion
writes nothing, pushes no history and leaves the dialog open with its diagnostic,
exactly like a refused add.

The default button is replaceable without duplicating the composition:
`<NoderaEditor builder={builder} renderEdgeInsert={(edgeId) => <MyButton … />} />`
keeps the position and the activation path and changes only the control (the
`GraphCanvas` prop has the same name for a host that composes the canvas itself).
What the button looks like is the host's; when it lands and what it writes is the
framework's.

### Replacing the affordances (S6)

All three controls the affordance paints are host-replaceable through a
component prop, and none of them needs a new SDK member, renderer kind or
dependency. The canvas keeps what makes the control work; the host decides what
it looks like:

All controls the affordance paints are host-replaceable through a
component prop, and none of them needs a new SDK member, renderer kind or
dependency. The canvas keeps what makes the control work; the host decides what
it looks like:

| Prop (`GraphCanvas`, forwarded by `NoderaEditor`) | Replaces | Host receives |
| --- | --- | --- |
| `renderEdgeInsert` | the "+" at the midpoint of one edge | `edgeId` |
| `renderPlaceholder` | the dashed placeholder box **and** its "+", for the empty state *and* every successor placeholder | `PhantomPlaceholder`: `kind`, `anchorId`, `box`, `connectors` |

**What the host may replace.** The control: its element, its icon, its label, its
styling, and — because it is the host's component — what activating it does. One
component covers both placeholder kinds, so a host that wants `box` or `connectors`
to move with the layout reads them from the placeholder it receives instead of
recomputing geometry.

**What it may not replace.** The geometry and the overlay discipline, which is
what keeps the affordance honest:

- the per-edge "+" stays at the rendered edge's midpoint; the placeholder stays in
the first free slot the derivation chose and keeps its dashed connector (the
connector is the placeholder's *shape*, not its control);
- whatever the host renders is painted **inside** `ViewportPortal`, so it is still
not a React Flow node or edge and still never reaches the document,
`builder.graph.nodes()` / `edges()`, the events or the history. The regression
that emptied the edge layer cannot come back through a host component;
- absent means today's rendering, byte for byte: all props are optional and
fall back to the framework's own component.

**The behaviour moves with the component.** Recording the pending session
(`UiState.pendingEdgeInsertId`, `pendingAppendAnchorId`) and opening the
node-creation dialog are what the framework buttons do. A replaced placeholder
whose component does neither records nothing and opens nothing — that is the point
of replacing it, and the responsibility that comes with it. A host that wants the
default flow wraps the exported default instead of re-implementing it:

```tsx
// The defaults live in the canvas module, beside `GraphCanvas` — the same module
// `DefaultEdgeInsertButton` already is in, and not re-exported from the root.
import {
  DefaultEdgeInsertButton,
  DefaultPlaceholderBox,
} from "@nodera/react-flow/src/canvas/graph-canvas.js";

<NoderaEditor
  builder={builder}
  renderPlaceholder={(placeholder) => (
    <aside style={{ position: "absolute", pointerEvents: "all" }}>
      <DefaultPlaceholderBox placeholder={placeholder} />
      <hint kind={placeholder.kind}>{placeholder.kind === "successor" ? "continue" : "start"}</hint>
    </aside>
  )}
/>;
```

A host button wired to `useEdgeInsertActions()` records an *edge*, so it cannot
stand in for a placeholder that appends *after a node*. A host that replaces the
placeholder either wraps the exported default or drives the UI store itself
(`useNoderaUi()`):

```ts
const { store } = useNoderaUi();

store.openDialog(NODERA_CREATE_NODE_DIALOG_ID);   // then, for the placeholder:
store.setPendingEdgeInsertId(undefined);
store.setPendingAppendAnchorId(placeholder.anchorId);
```

What each pending session means once the dialog closes is the framework's either
way: `insertNode({ edgeId, type })` and `addNode({ type, after })` plus `connect`.

### The phantom empty state

An empty canvas has no edge to put a "+" on, so the same affordance also covers
the two cases a graph starts from (`GraphCanvas.edgeInsertion`, off by default
like every other control the framework paints):

| The graph | What the canvas draws |
| --- | --- |
| No node at all | A dashed, muted **phantom node** — `data-nodera-phantom-node="inactive"` — carrying the same "`+`" (`aria-label="Insert node"`). |
| Exactly one node | The same phantom node one visual step past it, plus a dashed **phantom edge** from the real node to the placeholder; the "`+`" sits **inside the dashed box**, centred, in both cases. |
| Two nodes or more | No empty-state phantom. Every leaf gets its own [successor placeholder](#successor-placeholders-s21) instead — never both for the same node. |

A placeholder **occupies a free slot next to its node and never overlaps a real
node or another placeholder** (user report: the ghost nodes of the layered mode
must not cover other nodes, they behave like nodes as far as arrangement goes).
Because a placeholder is **not part of the document**, nothing reserves space for
it: the arrangement does not know it exists and cannot leave a hole. The
placeholder avoids the collision itself, on every render:

- the canvas starts from the occupied set — every real node's box, using the
  measured `width`/`height` React Flow reports and the token-sized default
  before the first measurement;
- for each node that qualifies (leaf successors in **node id order**, so the
  result never depends on the order the document reported them in) it takes the
  first free slot and adds the accepted placeholder to the occupied set before
  deriving the next one. A slot is free only when no occupied box in its band is
  closer than `PHANTOM_CONNECTOR_MIN_LENGTH`: the placeholder takes **the same
  space as a node**, so touching the corner of a real box is not "free";
- the search has three placements, in order: the node's own column one **rank
  pitch** past it (`layoutRankSpacing`, 240 flow units by default, never shorter
  than the node plus `PHANTOM_CONNECTOR_MIN_LENGTH` so the connector cannot
  collapse); one **cross pitch** to either side **on the same rank line** — the
  box's own cross extent plus `layoutNodeSpacing`, which is where the layout puts
  the next column of that rank — with the lower cross coordinate first, so it is
  deterministic; and only when the whole line is blocked, the forward walk down
  its own column, bounded by the farthest occupied edge, so it always terminates
  on a free slot;
- the connector spans the **actual distance** to the chosen box, as one run when
  the slot is aligned and as two (flow run + cross run to the box's near edge)
  when the slot is beside its node — a collision never detaches the dashed line
  or leaves it pointing at the slot the placeholder did not take.

The phantoms are **presentation only**, and that is enforced, not promised:

- they are drawn as an **overlay**: plain boxes rendered through
  `ViewportPortal`, so they live in the viewport's transform layer — the same
  coordinate system as the nodes — and pan and zoom with the graph;
- they are not graph elements *and* not React Flow elements: neither the engine's
  collections nor the `nodes` / `edges` arrays the canvas hands to React Flow ever
  receive one. `builder.graph.nodes()` / `edges()`, `nodeCount()` / `edgeCount()`,
  `graph.getNodes()` in the canvas, the events and the history never see them;
- that second rule is a defect that already happened, not a style preference. A
  placeholder appended to React Flow's `nodes` array is an element whose port
  handles React Flow cannot resolve, and React Flow then silently empties the
  whole edge layer: every real edge disappears from the canvas. An overlay cannot
  do that, and the regression is pinned by a test that counts the real edges
  while the placeholders are drawn;
- nothing there is selectable, draggable, deletable, connectable or focusable,
  because nothing there is an element React Flow manages: the boxes are
  `pointer-events: none` and only the "`+`" takes the pointer, so a placeholder
  never hit-tests a real node or edge underneath it and its click never reaches
  the pane (the selection is not cleared);
- the minimap can only draw nodes React Flow knows, so presentation geometry
  cannot look like a placed node — there is nothing extra to filter;
- inactivity is expressed with the **dashed border and the muted palette**, never
  by colour alone, and both are theme tokens with literal fallbacks
  (`--ndr-phantom-node-*`, `--ndr-phantom-edge-*`). The connector's thickness is
  its own **length** token, `--ndr-phantom-edge-width` (default `1.5px`), and
  deliberately *not* `--ndr-edge-stroke-width`: that one is the theme's SVG
  `stroke-width` (`"1.5"`, unitless), and a unitless number in a CSS `border`
  width makes the whole declaration invalid — which is exactly why the dashed
  connector was invisible in the themed demo while its box still positioned the
  "`+`" on the line it should have drawn.

Activating the "`+`" records the anchor in the UI state
(`UiState.pendingAppendAnchorId`: the single node's id, or absent on an empty
graph), clears any pending edge insertion, and opens the same
`nodera.dialog.create-node`. On a pick the host runs, in this order:

```ts
const added = builder.graph.addNode({ type, after: anchor });   // no `after` on an empty graph
if (!added.ok) return report(added.error);
if (anchor !== undefined) {
  const connected = builder.graph.connect({ source: anchor, target: added.value.id });
  if (!connected.ok) report(connected.error);                    // the node stays
}
```

Both refusals are reported, and **this path is two history units**: create, then
connect. Unlike the edge "+", where `insertNode` writes the node and both halves
as one reversible unit, one `undo()` here removes the connecting edge and a
second one removes the node. A single-unit append-and-connect needs its own
application use case; it does not exist yet, so no part of this flow claims
atomicity.

The dashed box and its "+" are replaceable by the host
(`renderPlaceholder`, [see above](#replacing-the-affordances-s6)). What is
*inside* the default button — recording the anchor and opening the dialog — is
the default's behaviour, so a host component that replaces the box and wants the
append flow has to perform those two steps itself, or wrap
`DefaultPlaceholderBox`.

### Successor placeholders (S21)

From two nodes on, the same affordance answers "where can I continue the
hierarchy?". Every node with **no outgoing edge** — a leaf, the step where the
hierarchy ends — gets one dashed phantom successor one step past it along the
axis the host declares, joined by a dashed phantom edge, with the "`+`" inside the
dashed box, centred — one control in one place, whether or not a connector joins
it. It is the image the feature was asked for: a node, a dashed edge down, a
dashed placeholder below carrying the "`+`". The step is the **first free slot**
next to the node: a real node or another placeholder already sitting there pushes
it forward along the axis instead of being covered (see
[the collision rule](#the-phantom-empty-state)).

| The graph | What the canvas draws |
| --- | --- |
| Two nodes, `n1 → n2` | One placeholder, after `n2` (the only leaf). `n1` has a successor, so it gets none. |
| Two nodes, no edge | **Two** placeholders: both nodes are leaves, and each one gets its own. |
| One node, or none | The [empty state](#the-phantom-empty-state) above, and only that: a graph with a single node never carries two placeholders for it. |

The set is **derived from the edges on every render**, so nothing has to be
cleaned up: a placeholder disappears in the same commit that gives its node a
successor. Everything the empty state guarantees holds here too — presentation only, out of
`builder.graph.nodes()`/`edges()`, no event, no history, nothing to select, drag
or delete — and, because the placeholders are an overlay rather than React Flow
nodes, the minimap cannot draw them and the edge layer keeps every real edge.

Activating one records that leaf in `UiState.pendingAppendAnchorId` — the same
field, the same dialog and the same host path as the empty state, so the host
needs no second branch:

```ts
const anchorId = ui.pendingAppendAnchorId;              // the leaf the placeholder followed
const added = builder.graph.addNode({ type, after: anchorId });
if (added.ok) builder.graph.connect({ source: anchorId, target: added.value.id });
```

The shared caveat is the one below and it is not hidden: **two history units**,
create then connect. The new node is a leaf itself, so it immediately gets a
placeholder of its own — that is the affordance the flow is built on, not a
leftover.

The axis comes from the host, because the canvas cannot read
`graph.layout.direction`: it passes `GraphCanvas.layoutDirection` (or
`NoderaEditor.layoutDirection`), which defaults to `"horizontal"`. The step does
too: `GraphCanvas.layoutRankSpacing` / `NoderaEditor.layoutRankSpacing` is the
rank pitch of the arrangement and `layoutNodeSpacing` is the gap between
neighbouring boxes of one rank, so the phantom of a leaf lands on the **rank line
the real nodes of its sibling branch occupy** instead of a fixed default step
above it, and a sideways lane lands where the next column would. Both default to
the adapter's documented `PHANTOM_NODE_OFFSET` (240 flow units); the lane pitch
always carries the box's own cross extent, so the default lane is the box plus a
240-unit gap. Both are presentation geometry only: they write no document state.

### `builder.graphLayout`

The composition point of the port:
```ts
assertValid(builder.graphLayout.register(myStrategy)); // id: "acme.dagre"
assertValid(builder.graphLayout.setDefault("acme.dagre"));
builder.graphLayout.active();                            // "acme.dagre"
builder.graphLayout.all().map((strategy) => strategy.id); // built-ins + "acme.dagre"
```

The built-ins are `nodera.graph-layout.free` and
`nodera.graph-layout.layered`. Selecting a strategy never rewrites configuration:
`active()` is what the next `arrange()` runs, and `graph.layout.strategy` is the
same selection declared once at composition time. A used id is `sdk.duplicate-id`,
an unqualified one is `sdk.invalid-id`, and an unknown one is `sdk.invalid-input`
while the selection stays where it was.

## The example

`examples/layout-switch-demo` is the reference host. It composes one builder over
`@nodera/sdk` + `@nodera/react-flow` + `@nodera/ui-react`, seeds a five-node
pipeline **without positions** with `graph.layout` declaring `mode: "auto"`,
`direction: "horizontal"`, `spacing: 240`, `rankSpacing: 280` and its real node
box as `nodeSize: { width: 158, height: 34 }`, and then puts every layout action
in its own toolbar **above** the canvas:

- a strategy select calling `builder.graphLayout.setDefault(id)`, which also
  applies the surface that strategy implies: with `nodera.graph-layout.layered`
  the host fixes the connections and hides the port handles
  (`setConnectionsPolicy("fixed")`, `setPortsPolicy("hidden")`), and with
  `nodera.graph-layout.free` it restores `"editable"` and `"visible"`. The
  toolbar reports both values, and the canvas re-renders from the UI state;
- a drag-policy select calling `builder.graphLayout.setDragPolicy(policy)`, seeded
  from `builder.graphLayout.dragPolicy()`;
- a node-transition select calling
  `builder.graphLayout.setNodeTransition(policy)`, seeded from
  `builder.graphLayout.nodeTransition()`. The demo boots on `"animated"`, which is
  what makes its `"snap-back"` drags visible: the node glides back to the slot the
  arrangement assigned instead of jumping there between two frames;
- direction, spacing and rank-spacing fields passed per call to
  `builder.graph.arrange({ direction, spacing, rankSpacing })`;
- one explicit Arrange button running that call;
- the `CreateNodeButton` from `@nodera/ui-react`, which opens the framework's
  node-creation dialog; the host adds the chosen definition with
  `builder.graph.addNode`, passing the anchor it chose (`after`) or none, and
  `mode: "auto"` gives it the slot that follows. The demo passes none, so a new
  node lands at the end of the graph;
- the placeholders the canvas draws for the empty state (at most one node) and,
  from two nodes on, one per leaf (S21): their "+" records the anchor in
  `pendingAppendAnchorId` and the same host handler appends with
  `builder.graph.addNode({ type, after })` and then connects, which is **two**
  history units — documented, not hidden. The demo passes its own `direction` as
  `NoderaEditor.layoutDirection` and its own `rankSpacing` / `spacing` as
  `layoutRankSpacing` / `layoutNodeSpacing`, so switching to a vertical
  arrangement steps the placeholders downwards and a phantom sits on the rank
  line of the real node of the sibling branch that shares its rank;
- the "+" the canvas paints on every edge, because the demo declares
  `features: { edgeInsertion: true }`: the dialog opens on that edge and the same
  host handler inserts with `builder.graph.insertNode`, so the node lands between
  the two endpoints as one history unit — one undo restores the edge;
- a status line printing what moved, or the `sdk.invalid-input` diagnostic that
  refused the call (an emptied spacing field is refused, not hidden).

The toolbar is host code, not framework code. That is the point: the SDK ships
configuration and one command, and a host that wants controls writes exactly this
page. `examples/layout-switch-demo/README.md` lists the commands and the files.

## Plugging in a strategy

A third-party layouter is an adapter over the port, registered by the host and
selected by id:

```ts
import { createLayeredStrategy, type GraphLayoutStrategy } from "@nodera/graph-layout";

const myStrategy: GraphLayoutStrategy = {
  id: "acme.dagre",
  place: (input) => (input.nodes.length > 500 ? createLayeredStrategy().place(input) : dagrePlace(input)),
};

assertValid(builder.graphLayout.register(myStrategy));
assertValid(builder.graphLayout.setDefault("acme.dagre"));
```

The framework ships no external layout dependency, so the adapter's own dependency
belongs to the host's build. What the adapter must guarantee — determinism, id
ordering as tie-break, its own size threshold, the declared `direction`, spacings
and `scope` — and a full host-side sketch are in
`packages/graph-layout/README.md` ("Adding your own strategy"). Diagnostic codes
(`graph-layout.invalid-options`, `graph-layout.duplicate-node`,
`graph-layout.unknown-edge-node`) and the registry rules are documented there
too.

## Limits

Stated, not hidden:

- **Crossing reduction, not elimination.** The barycenter sweep orders each rank
  by the mean position of a node's parents in the previous rank (ties by node id),
  which removes the sibling crossings a plain id order produced. It **reduces**
  crossings; it does not guarantee a crossing-free drawing, because minimising
  crossings is NP-hard. There are no edge bend points and no edge routing either:
  the layered strategy produces a ranked, evenly spaced grid. On the cross axis
  that grid is **aligned with the neighbours** rather than centred on the widest
  rank — a node with several children sits over the mean of those children, and a
  node with one parent sits in that parent's column — so a branch's last node
  stays under the branch instead of drifting toward the other one.
- **Boxes, not measured boxes.** The cross axis reserves the room a node's box
  takes — the size a strategy is handed, `graph.layout.nodeSize`, or the
  strategy's `140 × 40` default — so two neighbouring boxes of a rank never
  overlap and the nodes of one rank are separated by exactly `spacing`. What it
  does **not** do is
  measure the rendered node: a renderer that paints taller or wider than the box
  it declared can still paint over its neighbours, and closing that gap needs the
  canvas adapter to hand the strategy real measurements. The flow axis is still
  `rank * rankSpacing` from box origin to box origin, so a declared box taller
  than the rank distance overlaps the next rank; the host picks both numbers.
- `Arrange` always **computes** the whole graph (`scope: "all"` from the SDK);
  `arrange({ from })` only narrows which positions are written. There is no
  incremental ranker and none is planned — the port itself can express
  `unpositioned` for a host that calls a strategy directly.
- No framework toggle. Every re-placement is a host action: an explicit `Arrange`,
  or the `arrangeOnChange: "downstream"` policy the host declares in configuration.
- `onRemove: "splice"` joins the removed node's predecessors to its successors and
  nothing more: it does not re-route ports beyond the ones the removed edges
  carried, nor pick a different successor when a pair would duplicate an existing
  edge — that pair is skipped.
- The downstream policy arranges the touched node and its descendants, not their
  neighbours in the same rank: a sibling of the inserted node moves only if its own
  subtree is arranged.
- Every placeholder "+" — the empty state and the leaf successors — appends in
  **two** history units (create, then connect) instead of one. Only the edge "+",
  which has an application use case, guarantees all-or-nothing; a single-unit
  append-and-connect is a pending use case, not implemented here.
- Placeholders step by the rank pitch the host declares
  (`layoutRankSpacing`, `PHANTOM_NODE_OFFSET` = 240 flow units when it declares
  nothing), along the axis it declares (`layoutDirection`, `"horizontal"` by
  default), because the canvas adapter can see neither `graph.layout.spacing`,
  `graph.layout.rankSpacing` nor `graph.layout.direction`. A collision with a real
  node or another placeholder pushes the placeholder forward by whole steps
  along that axis — the distance is no longer always one step, the **slot** is
  always the first free one. The sideways lane a blocked column falls back to is
  the box's own cross extent plus `layoutNodeSpacing`, i.e. the next column of
  that rank.
- A successor placeholder marks a leaf, not a possible position: it stays one
  placeholder per leaf, never one per branch.
