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
| `Arrange` (explicit) | The selected strategy, for every node of the graph, when the host calls `builder.graph.arrange()`. One history unit. |
| Edge insertion (`builder.graph.insertNode`) | The builder, in `mode: "auto"`, anchored on the edge's **source**: one step past it along the axis, exactly like an `after` anchor. In `mode: "free"` nothing. One history unit together with the node and the two edges that replace the original. |

Three invariants hold in every mode:

- **No framework default moves a node.** There is no automatic re-layout on an
  add, on an edge change or on a read.
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
| `spacing` | positive finite number, document units: distance between adjacent automatic slots, and the in-rank distance of an `Arrange` | `240` |
| `rankSpacing` | positive finite number, document units: distance between consecutive `Arrange` ranks | the declared `spacing` |
| `strategy` | globally qualified strategy id | `nodera.graph-layout.layered` |
| `drag` | `"locked"` or `"snap-back"`: what a manual drag does when the layout owns the positions (inert under `mode: "free"`) | `"locked"` |

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
        spacing: 160,                            // default 240
        rankSpacing: 320,                        // default: spacing
        strategy: "nodera.graph-layout.layered", // the built-in default
        drag: "locked",                          // default; or "snap-back"
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
created. Nothing is guessed.

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

Two honest no-ops: the `free` strategy returns no position, and so does an empty
graph — neither pushes a history entry. A strategy that answers a diagnostic makes
`arrange()` fail with `sdk.invalid-input`, keeping the geometry's own code in
`metadata.strategyCode`, and nothing is applied.

The placement rule behind the answer (longest-path ranks, the relaxation cap, the
cycle-locked rank, in-rank order by node id, the two axes, `all` vs
`unpositioned`) is documented once, in `packages/graph-layout/README.md`.

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

`features.edgeInsertion` is the host-side switch for the affordance, and it is
**off** by default: the framework adds no control to the canvas unless the host
asks (`createBuilder({ features: { edgeInsertion: true } })`, reported as
`builder.features.edgeInsertion`). When it is on, the React Flow canvas paints one
native, keyboard-reachable "+" (`aria-label="Insert node"`) at the midpoint of
every edge — registered custom edge renderers included — and one click runs the
whole flow:

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
`direction: "horizontal"`, `spacing: 240` and `rankSpacing: 280`, and then puts
every layout action in its own toolbar **above** the canvas:

- a strategy select calling `builder.graphLayout.setDefault(id)`;
- a drag-policy select calling `builder.graphLayout.setDragPolicy(policy)`, seeded
  from `builder.graphLayout.dragPolicy()`;
- direction, spacing and rank-spacing fields passed per call to
  `builder.graph.arrange({ direction, spacing, rankSpacing })`;
- one explicit Arrange button running that call;
- the `CreateNodeButton` from `@nodera/ui-react`, which opens the framework's
  node-creation dialog; the host adds the chosen definition with
  `builder.graph.addNode`, passing the anchor it chose (`after`) or none, and
  `mode: "auto"` gives it the slot that follows. The demo passes none, so a new
  node lands at the end of the graph;
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

- No crossing minimization, no edge bend points, no edge routing. The layered
  strategy produces a ranked, evenly spaced grid.
- No node-size awareness: positions are computed from ids, edges and the declared
  spacings, so the result does not adapt to wide or tall node renderers.
- `Arrange` always covers the whole graph (`scope: "all"` from the SDK). A partial
  re-arrangement is not a supported request; the port itself can express
  `unpositioned` for a host that calls a strategy directly.
- No framework toggle and no auto-arrange. Every re-placement is an explicit host
  action.
