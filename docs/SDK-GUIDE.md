# SDK integration guide

Audience: a developer building an application on Nodera who has not read the
packages. This document covers how to go from nothing to a rendered editor, which
public name means what, and what the framework deliberately does not do yet.

The package-level detail lives in `packages/sdk/README.md` and
`packages/react/README.md`; the executable proof lives in
`examples/phase6-demo`.

## What the SDK is

`@nodera/sdk` is the public entry point of the framework. It composes the
framework-free core — domain, definitions, document, application use cases,
history, validation, UI contracts, theme and layout engines — into one object,
and it translates between the public vocabulary and the internal contracts in
both directions: a host writes `type`/`label` and reads `type`/`label` back.

Three properties define it:

- **Framework-free.** No React, no React DOM, no canvas library. Nothing in the
  SDK renders. `pnpm check:architecture` enforces it.
- **Engine-free.** The canvas engine is chosen at composition time by declaring
  what it can present (`BuilderAdapter`), not by importing it. The SDK validates
  authored definitions against that declaration and never mounts anything.
- **Execution-free.** Nodera models and edits graphs; it never runs nodes, tools
  or workflows. A graph is data.

`@nodera/react` is the first binding: one published package that bundles the
framework-free SDK, the React components that read a builder, the React Flow
engine adapter and the React presentation layer. The canvas layer
(`GraphCanvas`, the renderer registries, the default renderers) ships with the
binding because the binding is written against its types. A host that renders a UI
installs `@nodera/react` (plus React and `@xyflow/react`); a host that only
builds graphs, documents or definitions installs `@nodera/sdk` alone and stays
framework-free. A different framework means a different binding package over the
same SDK — never a change in the core.

### The three integration levels

The levels come from `docs/PRODUCT-DESCRIPTION.md` §10 and apply unchanged to the
SDK:

| Level | What the host does | SDK surface |
| --- | --- | --- |
| 1. Theme | Registers token data and applies it | `builder.theme.register` / `setDefault` |
| 2. Component replacement | Replaces a node, edge, port, property, panel, toolbar or menu renderer | `renderer` / `component` on a definition, `builder.bindRenderer` |
| 3. UI composition | Builds its own interface instead of the default editor | `NoderaBuilderProvider` + the presentation and canvas layers of `@nodera/react` |

Two hosts can use the same core and present radically different editors; the graph
semantics do not change.

## Worked example: from `createBuilder` to a rendered editor

The example is the Phase 6 demo, trimmed to one node, one edge, one layout, one
theme and one plugin. Each block names the API it exercises.

```ts
// --- Builder Factory: the two Nodera imports of the whole host -----------
import {
  assertValid,
  createBuilder,
  type Builder,
  type BuilderPlugin,
  type EdgeDefinitionInput,
  type LayoutDefinition,
  type NodeDefinitionInput,
} from "@nodera/sdk";
import { createReactFlowAdapter } from "@nodera/react";

// --- Node API: `type` is the identity, `label` the display name ----------
const HTTP_REQUEST: NodeDefinitionInput = {
  type: "acme.http.request",
  version: "1.0.0",
  label: "HTTP request",
  description: "Calls an endpoint and emits its response.",
  category: "Sources",
  ports: {
    outputs: [{ id: "response", name: "Records", dataType: "records" }],
  },
  properties: [
    { id: "url", type: "string", label: "URL", required: true, order: 0 },
    {
      id: "method",
      type: "select",
      label: "Method",
      order: 1,
      defaultValue: "GET",
      options: ["GET", "POST", "PUT", "DELETE"],
    },
  ],
  renderer: HttpRequestNode, // opaque value: the SDK never inspects it
};

// --- Edge API: declared style keys stay visual, the rest are hints -------
const DATA_FLOW: EdgeDefinitionInput = {
  type: "acme.data-flow",
  label: "Data flow",
  style: { lineStyle: "dashed", strokeWidth: 3 },
};

const SINK: NodeDefinitionInput = {
  type: "acme.sink",
  label: "Sink",
  category: "Destinations",
  ports: { inputs: [{ id: "in", name: "In" }] },
};

// --- Layout API: a declarative panel arrangement -------------------------
const PIPELINE_LAYOUT: LayoutDefinition = {
  id: "acme.layout.pipeline",
  name: "Pipeline",
  regionSizes: { left: 230, right: 320, bottom: 170 },
  panels: [
    { panelId: "palette", region: "left", size: 230 },
    { panelId: "properties", region: "right", size: 320 },
    { panelId: "acme.panel.insights", region: "right", size: 220 },
  ],
};

// --- Plugin API: contributions through one narrow api --------------------
const plugin: BuilderPlugin = {
  id: "acme.insights",
  version: "1.0.0",
  install(api) {
    api.panels.register({
      id: "acme.panel.insights",
      title: "Insights",
      region: "right",
      renderer: "acme.panel.insights",
    });
  },
};

// --- Builder Factory: one call, validated as a whole ---------------------
export function createAppBuilder(): Builder {
  const builder = assertValid(
    createBuilder({
      id: "acme.builder",
      adapter: createReactFlowAdapter(), // engine chosen as data
      registry: {
        nodes: [HTTP_REQUEST, SINK],
        edges: [DATA_FLOW],
        layouts: [PIPELINE_LAYOUT],
      },
      features: { minimap: true, history: true, validation: true, edgeInsertion: false, edgeWaypointEditing: false },
      document: { format: "ggd", version: "1.0.0" },
      ui: { layout: "acme.layout.pipeline" },
      plugins: [plugin],
    }),
  );

  // --- Theme API: a theme is a complete token set (11 groups) -----------
  assertValid(builder.theme.register(ACME_THEME));
  assertValid(builder.theme.setDefault(ACME_THEME.id));

  // --- Graph API: the supported mutation surface -------------------------
  const request = assertValid(
    builder.graph.addNode({
      type: "acme.http.request",
      nodeId: "node-request",
      position: { x: 60, y: 120 },
      properties: { url: "https://api.example.com/orders", method: "GET" },
    }),
  );
  const sink = assertValid(
    builder.graph.addNode({
      type: "acme.sink",
      nodeId: "node-sink",
      position: { x: 360, y: 120 },
    }),
  );
  assertValid(
    builder.graph.connect({
      source: request.id,
      target: sink.id,
      sourcePort: "response",
      targetPort: "in",
      type: "acme.data-flow",
    }),
  );

  return builder;
}
```

```tsx
// --- React binding: mount one component ----------------------------------
import { createRoot } from "react-dom/client";
import { NoderaEditor } from "@nodera/react";

const builder = createAppBuilder();
const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(<NoderaEditor builder={builder} />);
}
```

(`examples/phase6-demo/src/builder.ts`, `nodes.tsx`, `theme.ts`, `main.tsx` and
`demo-app.tsx`; reduced to one example per API and renamed to `acme.*`.)

One ordering rule the snippet shows implicitly: a plugin can contribute a panel
definition but never its geometry, so `acme.panel.insights` only appears because
`PIPELINE_LAYOUT` places it. That is also why the layout is declared as data in
the configuration and not by the plugin.

Two details of that flow are worth knowing before writing your own:

- `adapter: createReactFlowAdapter()` is the only line that involves React Flow,
  and it does not import React Flow: the binding declares the engine's
  capabilities. A host that renders with something else omits this line and
  declares its own `BuilderAdapterInput`.
- `assertValid` throws `SdkAssertionError` on the first failing configuration.
  Inside a host that wants to display diagnostics instead, use `.ok` and render
  the issues (next section).

Two values in that snippet are host data rather than SDK types, so the block
stays readable: `HttpRequestNode` is a React component the host writes (any
value is accepted, the SDK never inspects it), and `ACME_THEME` is a
`CreateThemeInput` whose `tokens` must cover **all eleven token groups** — the
complete example is `examples/phase6-demo/src/theme.ts`.

## Vocabulary: public name, what it is, where it comes from

The vocabulary is symmetric: PRODUCT-DESCRIPTION §9 names the public contracts
`type`/`label`, and the SDK speaks those names in both directions. What you write
and what you read back are the same fields, so a host never has to learn the
core `id`/`name` naming. The core shapes (`Node`, `Edge`, `NodeDefinition`,
`EdgeDefinition`) stay reachable through `builder.editor`, the documented
escape hatch.

| Public name | What it is | Where it comes from | Read back as |
| --- | --- | --- | --- |
| `type` (node) | globally qualified node definition identity, e.g. `acme.http.request` | `NodeDefinitionInput`; becomes `NodeDefinition.id` | `NodeDefinitionView.type` |
| `type` (node instance) | the definition type an instance was created from | `builder.graph.addNode` request | `NodeInstanceView.type` (the domain's `definitionId`) |
| `id` (node instance) | identity of one node in a graph | `builder.graph.addNode` returns the instance | `NodeInstanceView.id`; generated from the definition when omitted |
| `version` (instance) | definition version the instance was created against | the document when it pins one | `NodeInstanceView.version`, absent when the domain does not know it |
| `position` | where the host placed the node | `AddNodeRequest.position` / `graph.moveNode` | `NodeInstanceView.position`, absent until the node is placed |
| `waypoints` | points the edge is routed through | `graph.setEdgeWaypoints` | `EdgeInstanceView.waypoints`, absent when the edge is straight |
| `after` | the node an unpositioned add follows | `AddNodeRequest.after` (a node instance id) | not read back: it decides the slot `NodeInstanceView.position` carries |
| `edgeId` (insertion) | the edge a node is inserted on | `InsertNodeRequest.edgeId` | not read back: it is replaced by the two halves, `InsertNodeResult.edges` |
| `label` | human-readable name of a definition | becomes `NodeDefinition.name` / `EdgeDefinition.name` | `NodeDefinitionView.label` / `EdgeDefinitionView.label` |
| `defaultLabel` (edge definition) | label an instance may inherit | `EdgeDefinition.label` | `EdgeDefinitionView.defaultLabel` |
| `category` | grouping of definitions in palettes and registries | required on `NodeDefinitionInput` | `NodeDefinitionView.category`; `registries.nodes.byCategory()` |
| `ports.inputs` / `ports.outputs` / `ports.bidirectional` | ports grouped by the direction a person thinks in | flattened by the SDK into `PortDeclaration[]` with `direction: "input" \| "output" \| "bidirectional"` | `NodeDefinitionView.ports` as `PortView[]` |
| `port.id` | stable port identity inside its definition, e.g. `response` | `PortInput.id`; an unqualified identifier, not a dot-qualified type | `PortView.id` |
| `port.required` | shorthand for `minConnections: 1` | `PortInput.required` | `PortView.required`, derived from `minConnections >= 1` |
| `properties[].options` | option list of a `select` / `multi-select` | `string[]` or `PropertyOption[]`; both normalize to `PropertyOption[]` (`{ value, label }`, `label === value` for a bare string) | `PropertyDefinition.options` |
| `properties[].component` | opaque renderer of a `custom` property, or a registered component id | `PropertyInput.component` | not part of a view: it is a renderer binding (`builder.renderers.properties`) |
| `renderer` | opaque presentation contribution of a node or edge | `NodeDefinitionInput.renderer` / `EdgeDefinitionInput.renderer` | `NodeDefinitionView.renderer` / `EdgeDefinitionView.renderer` (the derived id) |
| renderer id | the key a binding resolves the renderer by | derived: the definition `type` for nodes and edges, `<ownerType>.<propertyId>` for a property declared inside a node, `<propertyId>` for a standalone property | the same string, on the view |
| `source` / `sourcePort` / `target` / `targetPort` (edge instance) | the two endpoints of a connection, flat | `ConnectRequest` | `EdgeInstanceView`, flat — the serialized document keeps nested `{ nodeId, portId, direction? }` |
| `style` (edge) | declared visual keys plus renderer-only hints | `lineStyle`/`geometry`/`arrowStart`/`arrowEnd`/`color`/`animation`/`width`/`stateIndicatorIds` become the edge `visual`; every other key is stored under `visual.metadata.style` | `EdgeDefinitionView.visual` |
| `builder.id` | globally qualified id of the composition | defaults to `nodera.builder` | `builder.id` |
| `adapter.id` | globally qualified id of the presentation engine | e.g. `nodera.react-flow` | `builder.adapter?.id` |

Three naming rules follow from the table, and each of them is a deliberate
deviation from the illustrative contract in `docs/FASE6-DEFINITION.md`:

1. **Every `type`, plugin id, adapter id and builder id is globally qualified**
   (`vendor.feature-name`, at least one dot). Phase 1 rejects an unqualified
   definition id, and an unqualified one would collide silently across plugins.
   An unqualified value is `sdk.invalid-id`.
2. **`label` is not `id`.** `label` maps to the definition `name`; the public
   `type` is the definition `id`. The domain keeps using `id`/`name` internally;
   the SDK translates once, in `src/authoring/`.
3. **Renderer ids are derived, not authored.** You declare `renderer: MyNode` on
   the definition and the SDK binds it under the definition `type`. There is no
   second id to keep in sync.

### Who owns node placement

`position` is document data and stays optional. `graph.layout.mode` defaults to
`"free"`: the framework places nothing and `NodeInstanceView.position` stays
absent until the host sets it. `mode: "auto"` assigns a position only to the
nodes the host left unpositioned, honouring `direction` (`"horizontal" |
"vertical"`) and `spacing` (default 240, the **gap between two neighbouring node
boxes**). The step between two consecutive slots is therefore the box extent of
the axis the layout advances along plus `spacing` — the box `width` for
`horizontal`, the `height` for `vertical` — exactly the geometry `Arrange`
reserves: the box comes from `nodeSize` (default `{ width: 140, height: 40 }`,
the same default the strategy uses). The slot follows the anchor the host names
in `AddNodeRequest.after` — the first free slot **forward** of it along the axis,
stepping by that box-plus-`spacing` step — and, with no anchor or an anchor that
carries no position, the end of the graph: the farthest occupied slot keeps its
own row and the candidate starts one step past it. An empty graph starts at the
origin. An anchor id the graph does not contain is `sdk.invalid-input` at path
`after` and nothing is created. No mode moves a node that already carries a
position, an explicit `position` always wins over an anchor, and no mode re-lays
out an existing graph on add or on read: that is an explicit `Arrange` action.

```ts
const builder = assertValid(
  createBuilder({
    registry: { nodes: [ACME_NODE] },
    graph: { layout: { mode: "auto", direction: "vertical" } },
  }),
);

const placed = assertValid(builder.graph.addNode({ type: "acme.http.request" }));
// placed.position === { x: 0, y: 0 }; the next unpositioned node lands at
// { x: 0, y: 280 } — the default 40-tall box plus the default 240 gap — because
// `direction` is "vertical"

const anchored = assertValid(
  builder.graph.addNode({ type: "acme.http.request", after: placed.id }),
);
// the first free slot forward of `placed` along the axis
```

**The host decides the anchor; the SDK never reads the UI selection.** A palette
passes `after` when exactly one node is selected and nothing when there is no
selection; the edge "+" passes the edge source. The SDK reads the anchor's
position and the graph's positions and nothing else, so the answer cannot depend
on node ids, on storage order or on how often the call is repeated.

`builder.graph.insertNode({ edgeId, type })` uses that same rule with the
**edge's source as the anchor**, so in `mode: "auto"` the inserted node lands one
step past the source (an occupied slot pushes it forward) and in `mode: "free"`
it stays unpositioned. The slot is decided before the use case runs, so it
belongs to the same history unit as the insertion: one `undo()` removes the node
and both halves and restores the original edge with its id and ports.

The whole feature — the two placement modes, the layer split, the defaults, the
`Arrange` command and the example — is on one page: `docs/GRAPH-LAYOUT.md`.

### Where a port is drawn

A port carries two independent facts. Its **direction** (`inputs` / `outputs` /
`bidirectional` in the authoring API) says what the port is for and becomes the
React Flow handle type. Its **placement** (`placement` on a port declaration)
says which side of the node it is drawn on: `"left"`, `"right"`, `"top"` or
`"bottom"`.

`placement` is presentation metadata (`PortVisual.placement`) and stays out of
the portable document, exactly like `renderer`. Omitted, the canvas derives it
from the direction and the axis `graph.layout.direction` declares:

| layout axis | input | output / bidirectional |
| --- | --- | --- |
| `horizontal` | left | right |
| `vertical` | top | bottom |

A declared side always wins, so a node can pin one port regardless of the
layout:

```ts
const ACME_NODE: NodeDefinitionInput = {
  // ...
  ports: {
    inputs: [{ id: "in", name: "In" }],
    outputs: [
      { id: "response", placement: "left" }, // pinned: leaf the node sideways
      { id: "log" }, // derived: right on a horizontal graph, bottom on a vertical one
    ],
  },
};
```

The same effective value reaches a host port renderer as
`NoderaPortRendererProps.placement`, so a registered component draws the port
where the built-in `PortHandle` would without repeating the rule. An unknown
value is `sdk.invalid-input` at path `ports.<group>.<id>` and the definition is
not registered.

### Arranging an existing graph

`Arrange` is a command, never a side effect. Nothing arranges on an add, on an
edge change or on a read unless the host opts in with
`graph.layout.arrangeOnChange: "downstream"` (below); otherwise the host asks for
it.

```ts
const moved = assertOk(builder.graph.arrange()); // one history unit, all-or-nothing
builder.graph.undo(); // one undo: every previous position is back

const scoped = assertOk(builder.graph.arrange({ from: "node-fetch" }));
// only `node-fetch` and its descendants were written; every other node kept its
// position, and one undo restores exactly the subset this call changed
```

`arrange()` reads the graph, asks the strategy selected by `graph.layout.strategy`
with the host's `direction`, `spacing` (**gap between two neighbouring node
boxes** of a rank), `rankSpacing` (between ranks, default `spacing`) and, when the
host declared one, `nodeSize` (the fallback box of a node that carries no size of
its own, default `{ width: 140, height: 40 }`), and applies the answer through the
application layer. The cross axis is therefore reserved in boxes: a rank steps by
its widest box plus `spacing`, so two neighbours are exactly `spacing` apart
whatever their renderer paints. On that cross axis the placement **aligns each
node with its neighbours** — a node with several children sits over the mean of
them, and a node with one parent sits in that parent's column — so a branch's
last node stays under its branch instead of drifting between branches. `nodeSize` is configuration, never document
data, and the SDK passes no per-node size because a node in `@nodera/graph-model`
carries no box — measuring a rendered node is the canvas adapter's business. A
strategy that answers a diagnostic makes it fail with `sdk.invalid-input` and moves
nothing; `nodera.graph-layout.free` and an empty graph both return an empty list
and push no history entry.

`from` scopes the **writes**, never the computation: the strategy still answers for
the whole graph, because a rank is a property of all of it, and the SDK applies
only the positions of `from` and of the nodes reachable from it by following edges
outward, transitively. An edge pointing into `from` does not pull its source in,
and an unknown or malformed id is `sdk.invalid-input` at path `from` with nothing
moved.

When the host declares `graph.layout.arrangeOnChange: "downstream"` (and the
layout owns the positions, `mode: "auto"`), a structural change arranges what it
touched by itself: after `insertNode`, the inserted node and its descendants; after
`connect`, the new edge's target and its descendants. It is applied **after** the
mutation and as **its own history unit**, so one `undo()` steps the geometry back
and a second one steps the mutation back — the insertion is never lost because of
a write nobody asked for at that moment. It never fails the mutation: a refused
arrangement is reported by `graph.lastAutoArrangement()` (`"skipped"`,
`"arranged"`, `"refused"`). A bare `addNode` arranges nothing, and `"never"` — the
default — keeps the previous rule that only an explicit `Arrange` moves nodes.

### Reshaping an edge

`setEdgeWaypoints` lets a host set the bend points of an edge instance. A
waypoint is a `{ x, y }` position in the same flow coordinate space as node
positions; an edge without waypoints is routed straight from source to target.

```ts
const result = builder.graph.setEdgeWaypoints("edge-id",
  [{ x: 100, y: 50 }, { x: 200, y: 100 }]);
if (!result.ok) {
  // sdk.invalid-input: unknown edge, or a non-finite coordinate
}

// An empty array clears the waypoints: the edge goes straight again.
builder.graph.setEdgeWaypoints("edge-id", []);

// `undefined` (or omitting the second argument) leaves them untouched.
builder.graph.setEdgeWaypoints("edge-id");
```

An unknown edge is `sdk.invalid-input` at path `edgeId`; a non-finite coordinate
or a malformed point is `sdk.invalid-input` at the offending array index. On
failure nothing is mutated. On success the change is one history unit (undo/
redo), emits `edge.updated` and `graph.changed`, and the result carries the
updated `EdgeInstanceView`, which includes the new `waypoints` value.

**`updateEdgeWaypoints`** is the application use case the SDK delegates to
(`@nodera/application`); the SDK surface is `builder.graph.setEdgeWaypoints`.

### Removing a node under a layout-owned graph

`graph.layout.onRemove` declares what `builder.graph.removeNode()` does with the
relations the node carried. It is host configuration — never a control the
framework puts in front of a user — and it is about graph semantics, not
geometry, so it applies in both placement modes:

| Policy | Declared as | What a removal does |
| --- | --- | --- |
| `"detach"` (default) | nothing, or `graph.layout.onRemove: "detach"` | Today's behaviour, byte for byte: node and edges leave, the hierarchy above and below is left apart. |
| `"splice"` | `graph.layout.onRemove: "splice"` | The node leaves and each predecessor is joined to each successor, so the graph stays connected through one hop. |

```ts
createBuilder({ graph: { layout: { onRemove: "splice" } } });

// p --in--> n --out--> s   becomes   p --> s
assertOk(builder.graph.removeNode("node-middle"));
builder.graph.undo(); // one undo: node, both original edges and their ids
```

**One unit, one undo.** The removal of the node, the removal of the edges it
carried and the spliced edges are a single `remove-node-splicing` history unit,
so `undo()` restores the graph exactly as it was — same ids, same ports — and
`redo()` splices again. There is no state in which the node is gone and the splice
is missing.

**Ports come from the edges that went away, the type from the incoming one.** A
spliced edge keeps the predecessor's port (from its incoming edge) and the
successor's port (from its outgoing edge), and takes the removed node's
**incoming** edge definition type. The old labels and metadata are not copied:
they described relations that no longer exist.

**Every predecessor joins every successor, duplicates skipped.** Several of each
produce the cartesian product, because dropping a pair would silently sever a
branch. A pair whose endpoints **and** ports already carry an edge is skipped
instead of written twice. A node with no predecessor or no successor has no pair
to write and is simply removed with its edges, in the same one unit.

With `arrangeOnChange: "downstream"` and `mode: "auto"` a splice is followed by a
**second** history unit that arranges the spliced predecessors and their
descendants, so the branch settles into the new ranks; one `undo()` steps the
arrangement back and a second one restores the removal. A refused arrangement
never fails the removal — `graph.lastAutoArrangement()` reports it.

```ts
builder.graphLayout.removalPolicy();            // "detach" | "splice"
assertOk(builder.graphLayout.setRemovalPolicy("splice"));
```

A value outside the union is refused and the stored one stays: at construction it
is `sdk.invalid-input` at `graph.layout.onRemove` and no builder is created; at
runtime it is the same code and path, and the next removal behaves as before.

**The strategy is host configuration, and it is replaceable.** `builder.graphLayout`
registers implementations, selects one by id and reports what is installed:

```ts
assertValid(builder.graphLayout.register(myDagreAdapter)); // id: "acme.dagre"
assertValid(builder.graphLayout.setDefault("acme.dagre"));
builder.graphLayout.active(); // "acme.dagre"
builder.graphLayout.all().map((strategy) => strategy.id); // built-ins + "acme.dagre"
```

The in-house `nodera.graph-layout.layered` is the default: ranks by longest path
from the source nodes, in-rank order by the mean position of the parents, crossings
reduced but not guaranteed. A
host that wants something else writes an adapter over the same port — plain
input, plain output — and selects it by id, in configuration
(`graph.layout.strategy`) or with `setDefault`. The framework ships no external
layout dependency; the adapter's own dependency belongs to the host's build.
There is no runtime toggle in any of this: a user never chooses the strategy, the
host does. The placement rule the layered strategy applies is documented in
`packages/graph-layout/README.md`, and the feature as a whole in
`docs/GRAPH-LAYOUT.md`.

### What the camera frames

`viewport` is the one configuration group that decides what the **camera** does:
what it frames when the canvas mounts, and whether it follows the selection. It
is presentation, not graph data (AGENTS.md §5.3) — nothing in it reaches the
portable document, the UI state, a node's `data` or the history, and moving the
camera emits no application event and pushes no history unit.

```ts
createBuilder({
  viewport: {
    // On mount: frame one node, at an exact level, instantly.
    start: { node: "node-http", zoom: 1.25, duration: 0 },
    // On selection: follow it, and return to `start` once the selection empties.
    selection: { maxZoom: 1.2, padding: 0.15, duration: 200, edges: false },
  },
});
```

| Group | Absent means | What it frames |
| --- | --- | --- |
| `start` | today's plain React Flow `fitView` | the whole graph, or the single node `start.node` names |
| `selection` | no camera movement on selection, ever | the selected nodes, plus the selected edges when `edges` is on |

**An absolute zoom wins; otherwise the framing fits.** `zoom` pins the level
exactly, through React Flow's own clamp rather than coordinate maths; without it
the camera fits with `padding` and stops at `maxZoom`.

| Field | Default | Meaning |
| --- | --- | --- |
| `zoom` | absent | Absolute level; when present it decides the zoom on its own |
| `maxZoom` | `1.5` | Ceiling used only while `zoom` is absent |
| `padding` | `0.1` | React Flow padding around what is framed |
| `duration` | `200` | Animation length in ms; `0` is instant |
| `selection.edges` | `false` | Whether a selected edge is framed too |

Three consequences a host should know before turning it on:

- **Edges are off by default.** Framing one edge zooms violently, so an
  edge-only selection leaves the camera alone. With `edges: true` a selected edge
  is framed with the graph-fit rule — never an absolute `zoom` — and so is a
  framed set that mixes nodes and edges.
- **Clearing the selection restores the `start` framing**, absolute zoom
  included. With no `start` group the camera restores the whole graph under the
  selection rule's own ceiling, padding and duration, so clearing never leaves
  the camera wherever it stopped.
- **The two groups have independent zoom rules.** Following a selection uses
  `selection`'s level, and returning uses `start`'s.

`builder.viewport()` reads the resolved configuration back — defaults applied,
frozen — and `undefined` means the host declared no camera configuration at all,
which is what keeps a canvas on today's plain `fitView`.

It is **runtime-changeable**, like the other presentation policies: a host calls
`builder.setViewport(configuration | undefined)` instead of composing again. A
successful call returns the resolved, frozen configuration and `builder.viewport()`
returns it immediately; `undefined` restores today's behaviour — React Flow's own
`fitView` on mount and no camera movement on selection; a refused value returns
every `sdk.invalid-input` issue and **keeps the previous configuration in force**,
so a host can report the diagnostics and leave the camera as it was. A disposed
builder refuses with `sdk.disposed`.

```ts
const applied = builder.setViewport({ selection: { maxZoom: 3, duration: 0 } });
if (!applied.ok) setStatus(issueSummary(applied.error)); // the old camera still applies
```

Nothing about the change is document data: no portable-document write, no UI
store state, no history unit and no application event.

Because the presentation binding reads the configuration live
(`GraphCanvas.viewportFit`), a `selection` change applies on the next selection
change with no remount. `start` is different: the canvas resolves it once, when
it mounts, so a host that changes the start framing applies it by remounting the
canvas — a new `key` on the editor component is enough, which is what the demo
does.

A value the declared shape cannot hold is refused where it sits and no builder is
created: a group that is not an object, a `start.node` that is not a non-empty
string, a `zoom` / `maxZoom` / `padding` that is not a positive finite number, a
`duration` that is negative or not finite, or a `selection.edges` that is not a
boolean is `sdk.invalid-input` at `["viewport", ...]`. `setViewport` runs the same
validation and returns the same issues, refusing the change while the previous
configuration stays in force.

### Reading a graph

A host that only displays state never has to touch `builder.editor`: the graph
reads speak the same vocabulary the mutations accept.

```ts
for (const node of builder.graph.nodes()) {
  // { id, type, version?, position?, properties, metadata? }
  table.set(node.id, { type: node.type, at: node.position, values: node.properties });
}

for (const edge of builder.graph.edges()) {
  // flat: source/sourcePort/target/targetPort, plus type?, label?, metadata?, waypoints?
  table.link(edge.source, edge.sourcePort, edge.target, edge.targetPort);
}

// definitions read the same way
const definition = builder.registries.nodes.get("acme.http.request");
if (definition !== undefined) {
  render(definition.label, definition.category, definition.ports);
}
```

Two things that surprise a host coming from the serialized format:

- **`EdgeInstanceView` is flat.** The document stores `source: { nodeId, portId }`
  because a round trip has to keep the direction each port was declared with, and
  the document is a separate published contract. A view keeps the port identity
  and hands you two strings.
- **`EdgeInstanceView.waypoints` is per-instance.** Waypoints live in flow
  coordinates like node positions; they are absent on a straight edge and
  present when the path has bends (dragged via canvas interaction or set
  programmatically).
- **Absent means absent.** `position` and `version` are omitted when the domain
  does not have them; nothing is defaulted to `{ x: 0, y: 0 }`.

### Who owns the open dialog

A dialog is a `DialogDefinition` — data, never a component — and the builder
composes the registry the UI state resolves ids from. It seeds the framework's
node-creation dialog, so the "+" affordances of the canvas work out of the box:

```ts
builder.store.openDialog("nodera.dialog.create-node"); // registered by the SDK
builder.store.getState().activeDialogId; // "nodera.dialog.create-node"
```

`registry.dialogs` declares a dialog set at construction and **replaces** the
built-in list (`DialogRegistry`'s seeding rule, the same one layouts follow);
`builder.dialogs.register(dialog)` adds one at runtime and `builder.dialogs.all()`
reads them back. A duplicate id is `sdk.duplicate-id`, a malformed definition is
`sdk.invalid-input` / `sdk.invalid-id`, both at their path, and the builder is not
created when the declaration is refused. The open id is presentation state: it
lives in `builder.store` (`openDialog` / `closeDialog`), never in the portable
document, and the store refuses an id no registered definition matches.

## Errors are data

Every operation that can fail returns a `Result`. The SDK never throws for input
problems, and it exposes exactly one error type:

```ts
export interface SdkError {
  readonly code: SdkIssueCode;
  readonly message: string;
  readonly path?: readonly string[];                        // e.g. ["registry", "nodes", "acme.http.request"]
  readonly metadata?: Readonly<Record<string, unknown>>;    // structured context
}

export interface SdkIssue extends SdkError {
  readonly severity: "error" | "warning";
}

export type SdkIssues = readonly SdkIssue[];
```

`SDK_ISSUE_CODES` is the closed list of the 13 codes such an issue can carry.

Consequences worth designing around:

- **One list per failed call.** `createBuilder` collects the issues of every
  configured input, so you fix one round of mistakes, not one mistake per run.
  Post-construction calls return the issues of that call.
- **`error` versus `warning`.** An `error` means the call failed and nothing was
  applied — registrations are transactional, a rejected definition leaves no
  trace. A `warning` means the composition works but something cannot be
  honoured: `builder.diagnostics` currently carries the capability gaps between
  the selected engine and the authored definitions.
- **Codes are the branching surface.** `code` is stable and closed
  (`SDK_ISSUE_CODES`); `message` is for humans and may be reworded. Match on
  `code`, and keep `metadata` for detail you may display (`domainCode` keeps the
  originating document or parse code, `elementId` names the graph element).
- **Malformed data is a `Result`.** A value the SDK requires to be an object,
  an array, a string or a boolean is shape-checked once, at the boundary that
  owns it, and reported with the `path` of the offending input (`["features"]`,
  `["document"]`, `["panels", "id"]`, `["request"]`, or — inside a definition —
  `["label"]`). A `null` where an object is required, a number where a string is
  required and an object where an array is required are `sdk.invalid-input` (or
  the more specific code), never a `TypeError`.
- **Two ways to consume.** `.ok` for hosts that render diagnostics, `assertOk` /
  `assertValid` for linear boot code that should stop.

Rendering them is host code and small:

```ts
const result = builder.document.import(rawDocument);
if (!result.ok) {
  setStatus(result.error.map((issue) => `${issue.code}: ${issue.message}`).join(" | "));
  return;
}
```

(`examples/phase6-demo/src/demo-app.tsx`, same pattern in every handler.)

## Lifecycle: creating and disposing a builder

`createBuilder` returns the builder or every problem of the configuration,
whichever applies, and never a partially wired object:

```ts
const result = createBuilder({ registry: { nodes: [ACME_NODE] } });
if (!result.ok) {
  // one diagnostic per problem, none of them thrown
  return result.error.map((issue) => `${issue.path?.join(".") ?? ""} ${issue.code}`);
}
const builder = result.value; // fully composed: registries, store, editor, facades
```

`builder.dispose()` releases it. The contract is one sentence, and the columns
below are the complete lists:

> **After `dispose()` every operation that mutates the graph or extends the
> builder fails with `sdk.disposed`; every read keeps working.**

| Refused with `sdk.disposed` | Still available |
| --- | --- |
| `registerNode`, `registerEdge`, `registerProperty`, `registerPanel`, `registerTool` | `builder.registries.*`, `builder.properties` |
| `registries.nodes.unregister`, `registries.edges.unregister` | every other `builder.registries.*` member |
| `bindRenderer`, `use`, `createEditor` | `builder.events.on` / `once` / `off` / `emitSdk` |
| `theme.register`, `theme.setDefault` | `theme.active`, `theme.all` |
| `layout.register`, `layout.setDefault` | `layout.active`, `layout.all` |
| `dialogs.register` | `dialogs.all`, `builder.store` reads |
| `graphLayout.register`, `graphLayout.setDefault`, `setDragPolicy`, `setNodeTransition`, `setConnectionsPolicy`, `setPortsPolicy`, `setArrangeOnChange`, `setRemovalPolicy` | `graphLayout.active`, `graphLayout.all`, `dragPolicy`, `nodeTransition`, `connectionsPolicy`, `portsPolicy`, `arrangeOnChange`, `removalPolicy`, `lastAutoArrangement` |
| `graph.addNode`, `removeNode`, `moveNode`, `updateProperties`, `insertNode`, `connect`, `disconnect`, `setEdgeWaypoints`, `arrange`, `select`, `clearSelection` | `graph.validate`, `nodeCount`, `edgeCount`, `selectedNodes`, `selectedEdges`, `canUndo`, `canRedo`, `lastAutoArrangement` |
| `graph.undo`, `graph.redo` — nothing is undone, both return `false` | `document.create`, `export`, `serialize`, `deserialize`, `validate` |
| `document.import` | `builder.store` reads, `builder.renderers`, `builder.features`, `builder.diagnostics` |

Disposal closes mutations because they would change state the host is no longer
composing; it leaves reads open because a host that unmounts an editor still
renders the state it already received. `undo()` and `redo()` keep the history
engine's boolean signature, so they have no code to report: they perform nothing
and return `false`. Disposing twice is safe.

```ts
builder.dispose();

const refused = builder.graph.addNode({ type: "acme.http.request" });
// refused.ok === false && refused.error[0].code === "sdk.disposed"

const exported = builder.document.serialize("json"); // still exports
```

## Choosing the engine

The engine is a value, not an import. `BuilderAdapter` declares what the selected
engine can present:

```ts
export interface BuilderAdapter {
  readonly id: string;      // "vendor.canvas-engine"
  readonly label: string;
  readonly capabilities: AdapterCapabilities;
}
```

`AdapterCapabilities` is a fixed record of eleven booleans: `canvas`, `minimap`,
`controls`, `zoomPan`, `dragAndDrop`, `nodeRenderers`, `edgeRenderers`,
`portRenderers`, `propertyRenderers`, `edgeStyles`, `customPanels`.

To select an engine you either pass a binding's factory
(`createReactFlowAdapter()` from `@nodera/react`) or declare it yourself:

```ts
const builder = assertValid(
  createBuilder({
    adapter: {
      id: "acme.canvas-engine",
      label: "ACME canvas",
      capabilities: { canvas: true, zoomPan: true, nodeRenderers: true },
    },
  }),
);
```

Omitted capabilities are `false` (only `canvas` defaults to `true`). The builder
derives what your definitions need with `requirementsFrom({ nodes, edges })`,
compares it with `capabilityGaps(adapter, requirements)` and stores the result in
`builder.diagnostics` as `sdk.renderer-unsupported` warnings. A gap is a warning,
not an error: the definition stays registered and you may still wire that
renderer yourself.

### What a binding owns

A new graph engine (or a Vue/Angular adapter) is a new package, never an SDK
change. A binding owns exactly five things:

1. the `create<Engine>Adapter()` factory: one `BuilderAdapter` with the
   capabilities the engine really presents;
2. the framework provider that hands the builder's own store and registries to
   the framework layer (`NoderaBuilderProvider` does this for React);
3. the opaque-value boundary: converting `builder.renderers` (opaque `unknown`
   values keyed by id) into the framework's own renderer registries
   (`createRendererSet` does this for React, and is the only place allowed to
   assert that a value is a component);
4. mounting: the component or function that actually draws the canvas and the
   panels (`<NoderaEditor>`);
5. the engine's stylesheet, which the host imports (see Known limits).

The SDK itself stays untouched, and a host that only uses `@nodera/sdk` keeps
working.

## What a plugin can do

A plugin is `{ id, version, install(api) }`. `install` runs synchronously and can
contribute nodes, edges, properties, panels, tools, themes and layouts, plus bind
an opaque renderer value to a slot. Each contribution goes through the builder
method of the same name, so a plugin is subject to exactly the validation,
duplicate detection and renderer binding a host is.

Guarantees the SDK gives a plugin author:

- the id and version are validated **before** `install` runs, and a plugin id
  installs once per builder (`sdk.plugin-conflict`), so a rejected plugin leaves
  no half-registration;
- a throw inside `install` becomes `sdk.plugin-invalid` instead of escaping;
- a failing contribution does not undo the successful ones; every failure is
  returned in the `use()` result and announced once through `plugin.error`;
- a fully successful install announces exactly one `plugin.registered` with the
  contribution ids in registration order.

**Phase 7 adds the ecosystem around this contract.** A plugin manifest with an
SDK version and declared dependencies, validation of untrusted manifests,
dependency resolution, the load/activate/deactivate/unregister lifecycle,
cross-plugin conflict detection and five example plugins all exist today: see
[`docs/PLUGINS.md`](PLUGINS.md) for the manifest reference, the lifecycle, the
security model, distribution and the known limitations. The Phase 6 authoring
surface above is unchanged and remains the way a plugin registers its
contributions; `BuilderPluginApi` gained the contribution slots the ecosystem
needed (`validators`, `importers`, `exporters`, `dialogs`, `layoutStrategies`)
and the SDK event api gained `plugin.activated`, `plugin.deactivated` and
`plugin.unregistered`.

## Known limits

These are honest boundaries of Phase 6, not roadmap guesses.

- **Renderer values are opaque by design.** The SDK stores what you pass and
  never inspects it, so a wrong value cannot be diagnosed by the SDK: the
  framework binding is what rejects a non-renderable value
  (`InvalidRendererBindingError` in `@nodera/react`). A host that uses the
  SDK alone owns that check.
- **The SDK ships no stylesheet.** The React binding mounts the engine, so the
  host imports the engine's CSS itself (`import "@xyflow/react/dist/style.css";`)
  and declares that dependency. There is no Nodera stylesheet to include, and no
  CSS copy inside the binding.
- **A plugin's `install` cannot read the builder under construction.**
  `BuilderPluginApi` exposes the contribution slots, not the builder, and
  `install` runs before `createBuilder` returns. Read composition facts later
  (from the object `createBuilder` returned) or contribute them as data.
- **The default edge renderer honours some style hints only.** `strokeWidth`
  and `dashArray` from the definition's `style` are applied over the theme
  token fallbacks; the declared `width` key of the visual vocabulary is the
  same stroke width and wins over the legacy `strokeWidth` hint.
  `color` and `lineStyle` are carried on the mapped edge but the default
  renderer keeps the stroke token-driven, so a host that needs those writes a
  custom edge renderer. Nothing is dropped: the values stay on the edge. The
  declared `geometry` (`straight`, `bezier`, `step`, `smooth`) *is* drawn by
  this renderer: an edge of a definition resolves to it instead of to React
  Flow's built-in geometry types, which is what gives every declared geometry
  the waypoint affordances.
- **Packaging is bundled, publication is still Phase 8.** `@nodera/sdk` and
  `@nodera/react` each build one ESM entry with `tsup`, with every `@nodera/*`
  package inlined into `dist/index.js` and its declarations inlined into a
  self-contained `dist/index.d.ts` (`exports` exposes `"."` only). They are not
  on any registry yet; `npm pack --dry-run` is the smoke test. Inside the
  monorepo, `tsconfig.base.json` maps those two specifiers to the unbundled
  declaration tree (`dist/types`) so every workspace package keeps one type
  identity (`docs/PROJECT-STRUCTURE.md` §7.6).
- **`builder.editor` is an escape hatch.** It is the editing session behind the
  facades. `builder.graph` and `builder.document` are the supported surface for
  mutation; reaching into the editor bypasses no rule but does skip the SDK's
  translation, so prefer the facades.
- **No grouping, no runtime, no execution.** `features: { grouping: true }` is
  rejected with `sdk.feature-unsupported` because the capability does not exist;
  only `minimap`, `history`, `validation`, `edgeInsertion` and
  `edgeWaypointEditing` are implemented.
- **`edgeInsertion`** seeds the per-edge "+" affordance from configuration
  (`features.edgeInsertion`), and `builder.features.setEdgeInsertion(enabled)`
  flips it at runtime. The canvas re-renders without a rebuild; the value
  written by the host is the boot value for the session.
- **`edgeWaypointEditing`** gates the per-edge waypoint editing affordance.
  `builder.features.setEdgeWaypointEditing(enabled)` refuses to enable unless
  the active strategy is the free strategy (`nodera.graph-layout.free`) **and**
  connections are editable — the setter returns `sdk.feature-unavailable` with
  a diagnostic naming the missing condition. Even when the SDK flag is `true`,
  the canvas additionally gates gesture handling and waypoint handle rendering
  on the live value of `connections` and the active strategy id, so the
  gesture layer never fires when any condition changes at runtime. Disabling
  (`false`) is always allowed.

## Where to go next

- `packages/sdk/README.md` — the package, its APIs and its error model.
- `docs/GRAPH-LAYOUT.md` — node placement: `graph.layout`, `Arrange`, the
  strategy port and `examples/layout-switch-demo`.
- `packages/react/README.md` — the React binding: what it bundles and what it
  asks of the host (React, React DOM, `@xyflow/react`).
- `docs/PROJECT-STRUCTURE.md` §7.3 and §7.6 — the package boundaries, the
  executable rules that enforce them and the two-package distribution.
- `examples/phase6-demo` — the complete integration, importing only
  `@nodera/sdk` and `@nodera/react`. Its `pnpm test` runs
  `src/imports.test.ts`, which parses every source file and fails on any other
  internal `@nodera/*` package or on an `@xyflow/react` import other than its
  stylesheet.
- `odd/tasks/fase6-sdk.md` — the Phase 6 decisions (D1–D21) with their rationale.
