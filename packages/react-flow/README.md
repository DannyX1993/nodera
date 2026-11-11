# @nodera/react-flow

The React Flow integration for Nodera.

The package has two layers, and they ship together because the second is written
against the types of the first:

- **The canvas adapter (engine)** — `src/canvas`, `src/map`, `src/registries`,
  `src/renderers`. It translates the portable graph model into React Flow and
  turns visual interactions back into application use cases. It is the only
  package in the monorepo allowed to import `@xyflow/react`. A Phase 4/5 host
  uses this layer directly, with no builder at all: `GraphCanvas`, the renderer
  registries and the default renderers need an `EditorEngine` and nothing else.
- **The SDK binding (composition)** — `src/adapter`, `src/providers`,
  `src/editor`, `src/vocabulary.ts`, `src/renderers/renderer-set.ts`. It turns
  one assembled `Builder` into a renderable editor. Composition goes through
  `@nodera/sdk`; the binding never reaches the domain or the application use
  cases on its own.

React Flow is the *engine*. A different engine — or a non-React framework — is a
**different package**; this one stays React Flow's integration and keeps its
name. `@nodera/ui-react` is also separate and engine-agnostic: it composes
panels, providers and property renderers, and it never imports this package or
React Flow.

---

## Layer 1 — the canvas adapter

React Flow canvas adapter for Nodera (Phase 4). Translates the Nodera domain
model to React Flow and translates visual interactions back into application
commands. React Flow never crosses into the domain or application layers.

### Public API

- `GraphCanvas` — renders the graph from an `EditorEngine`; subscribes to the engine event bus; translates drag, connect, select and delete interactions back into use cases (`moveNode`, `createEdge`, `removeNode`, `removeEdge`, `selectNode`, `selectEdge`, `selectMultiple`, `clearSelection`). Props: `editor`, optional `nodeRenderers` / `edgeRenderers` / `portRenderers` registries, `interactionMode`, the presentation policies (`dragPolicy`, `nodeTransition`, `connectionsPolicy`, `portsPolicy`), the camera framing reader (`viewportFit`), `showMinimap`, `showControls`, `colorMode` ("light" | "dark" | "system"), the insert affordance props (`edgeInsertion`, `layoutDirection`, `layoutRankSpacing`, `layoutNodeSpacing`, `renderEdgeInsert`, `renderPlaceholder`), and passthrough callbacks (`onNodeClick`, `onEdgeClick`, `onConnect`, `onNodesChange`, `onEdgesChange`, `onLinkValidate`, `onDropNodeDefinition`).
- `startViewportPlan` / `selectionViewportPlan` / `viewportFitOptions` — the pure camera rules behind `viewportFit`: what to frame on mount, what to frame after a selection change (and when to leave the camera alone), and the `fitView` options an absolute zoom becomes. No React, no DOM, and nothing that writes state, so they are tested on their own (`canvas/viewport-fit.test.ts`).
- `NoderaCanvasProvider` / `useNoderaCanvas` — React Flow provider wrapper.
- `useEditorGraph` — derives `{ nodes, edges, selectedNodeIds, selectedEdgeIds }` from the engine, event-driven.
- `NodeRendererRegistry` / `EdgeRendererRegistry` — register custom renderers by definition renderer id; duplicates fail loudly; resolution falls back to `nodera-default-node` / `nodera-default-edge`. The mapper carries the definition's `renderer` id in node `data.rendererId`, so a registered renderer is used automatically (see the demo's `transform-card`).
- `DefaultNodeRenderer`, `DefaultEdgeRenderer`, `PortHandle` — default renderers reading `visual` hints; `PortHandle` maps the port's placement to the Handle position and its direction to the Handle type (input → target; output/bidirectional → source under `ConnectionMode: "loose"`; Handle id is exactly the port id). The side comes from `visual.placement` when declared, otherwise from `defaultPortPlacement(direction, axis)`: left/right on a horizontal graph, top/bottom on a vertical one. `NoderaPortAxisProvider` carries that axis and `GraphCanvas.layoutDirection` feeds it. The node-type wrapper renders ports for every renderer, custom ones included.
- `defaultEdgeOptionsFromVisual` — `EdgeVisual` → React Flow edge options (lineStyle, color, animation, arrows).
- Mappers: `toReactFlowNodes`, `toReactFlowEdges`, `nodePositionFromReactFlow`, `connectionFromReactFlow`, `removedIdsFromReactFlowChanges`.
- Selection: click selects, Shift-click adds, click on the pane clears, RF box/multi selection syncs into the engine through `selectMultiple`; drag positions commit through `commitDraggedNodes` (one undo unit per moved node) and RF selection changes through `commitSelectionFromReactFlow`.
- Keyboard: `Delete` and `Backspace` remove the selected elements (they flow through the `removeNode` / `removeEdge` use cases). Other shortcuts (copy/paste, undo/redo) belong to the host application layer.

### Camera framing — `viewportFit`

`GraphCanvas.viewportFit` is a **reader** (`() => ViewportConfiguration |
undefined`), the same shape as `removalPolicy`: the framing is host configuration
(the SDK's `viewport` group), not UI state, so the canvas reads it at the moment
it frames and never re-renders on it. `<NoderaEditor>` passes
`() => builder.viewport()`; a host composing the canvas layer directly passes its
own reader, and `undefined` — or a reader that returns nothing — is today's
behaviour byte for byte: React Flow's own boolean `fitView` on init and no camera
movement on selection.

What it frames is decided by three pure functions in `canvas/viewport-fit.ts`:

| Reader declares | On mount | After a selection change |
| --- | --- | --- |
| nothing | React Flow's plain `fitView` | nothing |
| `start` | the whole graph, or the node `start.node` names | — |
| `selection` | — | the selected nodes (and edges, with `edges: true`); the `start` framing once the selection empties |

The camera is moved through the captured `ReactFlowInstance`'s `fitView` and
never through component state: the viewport stays React Flow's (canvas state,
AGENTS.md §5.3). Applying a framing writes no document position, pushes no
history unit, emits no application event and stores nothing in a node's `data`.

Zoom has two modes, and the difference is what the plan carries: an absolute
`zoom` becomes React Flow's own clamp (`minZoom === maxZoom === zoom`), so the
camera lands exactly on that level with no coordinate maths; without `zoom` the
framing fits with `padding` (default `0.1`) and stops at `maxZoom` (default
`1.5`). `duration` (default `200` ms, `0` instant) is passed straight through.
Edges are **off** by default, because framing a single edge zooms violently:
with `edges: true` an edge is framed with the graph-fit rule, never an absolute
level.

The subscription lives on the engine's `selection.changed` event — the one event
that knows both "the selection changed" and "the selection is now empty" — and
not on `useEditorGraph`, which deliberately skips it to avoid re-entering React
Flow's own selection emission. A repeated identical framing (React Flow reports
the same selection back through `commitSelectionFromReactFlow`) is a no-op, and
the subscription is removed on unmount.

### Interaction mode and canvas background

`GraphCanvas.interactionMode` (`"select" | "pan"`, the `InteractionMode` of
`@nodera/ui-core`) is translated by `canvasInteractionSettings` into React Flow's
drag props:

- `"select"` (default) — the left button belongs to the selection surface: a
  left drag on the pane draws a selection box (`selectionOnDrag: true`) and
  panning moves to the middle and right buttons.
- `"pan"` — any drag pans the viewport (`panOnDrag: true`) and a drag never
  selects.

The mode is editor/UI state, not canvas state: the host reads it from its UI
store and passes it down, and the adapter applies it without owning it.

The background pattern is token-driven through `canvasBackgroundOptions()`: the
surface colour comes from `--ndr-canvas-background` (painted by `CanvasContainer`
in `@nodera/ui-react`) and the dot pattern from `--ndr-canvas-background-dot`. The
dot gap is the theme token's documented numeric default (`canvas.backgroundDotSize`
= `16`), because React Flow's `<Background gap>` is a number and a CSS custom
property can never feed a numeric prop. Switching the theme therefore restyles
the canvas without re-rendering it.

### Drag policy and node transition

Every node position the canvas paints comes from the document, so a release, an
`arrange` or a snap-back is a re-derivation, not a gesture the canvas animates.
Two presentation props decide what that looks like, and neither writes anything:

| Prop | Values | What the canvas does |
| --- | --- | --- |
| `dragPolicy` | `"free"` (default) / `"locked"` / `"snap-back"` | `"locked"` sets `nodesDraggable={false}`; `"free"` commits the dropped position through `moveNode`; `"snap-back"` lets the node follow the pointer and discards the drag, so the assigned position is painted again. |
| `nodeTransition` | `"instant"` (default) / `"animated"` | `"animated"` renders one scoped `<style>` rule on the canvas frame: a node reaching a new position glides there with a `transform` transition. `"instant"` renders no style element at all. |

The transition rule excludes the node React Flow is dragging (`.dragging`), so
the dragged node keeps following the pointer with no lag, and it is disabled under
`prefers-reduced-motion: reduce`. The motion is token-driven:
`--ndr-node-transition-duration` (default `200ms`) and
`--ndr-node-transition-easing` (default `ease`). The rule is scoped by the class
the canvas puts on its own frame, so an `"instant"` canvas on the same page is
never animated by a sibling's rule.

None of that motion comes from React Flow: `nodes` is a controlled prop, so a
controlled flow applies no position change itself and only reports the ones it
would have applied. The canvas therefore keeps the live positions a drag reports
in its own state — keyed by node id, and only while React Flow flags the change
`dragging: true` — merges them over the derived nodes, and drops them at the drag
stop, so nothing is written to the document while the drag runs. That is what
makes the node follow the pointer, and it is also what makes
`nodeTransition: "animated"` visible on a `"snap-back"` return: the release
discards the live positions and re-derives the node from the document, and the
transition is what carries it back to the assigned position.

A node that moves therefore gets a new React Flow node object on every pointer
move, and that has a second consequence worth knowing: React Flow resets a
node's internal handle bounds whenever the adopted user node carries no
`measured`. Losing them makes `getEdgePosition` answer `null` and unmounts the
node's edges for a frame — the flicker a fast drag multiplies. The canvas carries
the dimensions it already measured on every derived node as `measured` (canvas
state, like the live positions), so only the position changes and the edges are
repaired in the same frame as the node.

### Host-replaceable insert affordances (`edgeInsertion`)

With `edgeInsertion` on, the canvas paints three controls, and every one of them
is replaceable by a component prop — never by a new SDK member, renderer kind or
dependency. The canvas keeps what makes the control work (the position, the
overlay, the fact that nothing becomes a graph element); the host decides what it
looks like:

| Prop | Replaces | The host receives |
| --- | --- | --- |
| `renderEdgeInsert` | the "+" at the midpoint of one edge | `edgeId: string` |
| `renderPlaceholder` | the dashed phantom box **and** its "+", for both the empty state and the successor placeholders | the whole `PhantomPlaceholder`: `kind` (`"empty-state"` / `"successor"`), `anchorId`, `box` (`x`/`y`/`width`/`height` in flow units) and `connectors` (the straight run(s) the canvas draws to that box; one for a slot in the anchor's column, two when the slot slid to a neighbouring lane) |

```tsx
import { NoderaEditor } from "@nodera/react-flow";

<NoderaEditor
  builder={builder}
  renderEdgeInsert={(edgeId) => <MyEdgePlus edgeId={edgeId} />}
  renderPlaceholder={(placeholder) => (
    <MySlotMarker
      kind={placeholder.kind}      // "empty-state" | "successor"
      anchor={placeholder.anchorId} // the node the new one follows
      box={placeholder.box}
    />
  )}
/>;
```

Two rules make the replacement honest:

- **absent means today's rendering, byte for byte.** Each prop is optional and
  the default is the framework's own component, so a host that supplies none of
  them gets exactly the canvas it had before.
- **the geometry stays the framework's.** The "+" stays at the midpoint of the edge;
  the placeholder stays in the slot the derivation chose (and keeps its dashed
  connector, which is the placeholder's shape rather than its control). Only the
  control is the host's. A slot is the space a whole node takes, and the search
  tries three placements in this order: the anchor's own column one **rank pitch**
  further along the axis (`layoutRankSpacing`, 240 flow units by default); one
  lane either side of that slot on the **same flow line**, which keeps the ghost
  in its anchor's rank band; and only when the whole flow line is blocked, the
  forward walk down the column. A candidate keeps at least the shortest drawable
  connector's distance from any box sharing its lane, so two boxes never touch or
  overlap — not even when the rank of the layout and the placeholder's own step
  are different grids.

What the host replaces along with the look is the **behaviour**: recording
`UiState.pendingEdgeInsertId` / `pendingAppendAnchorId` and opening the
node-creation dialog are what the framework buttons do. A host component that
wants that flow either calls the UI store (`useNoderaUi()`, or
`useEdgeInsertActions()` for the edge case) or **wraps the exported default**
instead of re-implementing it:

- `DefaultEdgeInsertButton` (`{ edgeId }`) — the per-edge "+";
- `DefaultPlaceholderBox` (`{ placeholder }`) — the dashed box with its
  "+" inside it.

That is the difference the placeholder needs: a host button wired to
`useEdgeInsertActions` records an *edge*, so it cannot stand in for a placeholder
that appends *after a node* nor for a branching handle that inserts *before a
split*. All three are exported by the canvas module (`src/canvas/graph-canvas.ts`,
beside `GraphCanvas`, and not re-exported from the package root — the same place
`DefaultEdgeInsertButton` already was), and the overlay discipline is unchanged: no
placeholder and no branching handle ever enters React Flow's `nodes` / `edges`
arrays, the document, the history or the events, whichever component paints it.

#### Placeholder geometry: `layoutDirection`, `layoutRankSpacing`, `layoutNodeSpacing`

The placeholder walk needs three numbers the canvas adapter cannot read from the
document, because they are SDK configuration and presentation geometry rather
than document data: `graph.layout.direction`, `rankSpacing` and `spacing`. The
host declares them, and each one only shapes the overlay — no document state, no
history, no event:

| Prop | Meaning | Default |
| --- | --- | --- |
| `layoutDirection` | axis the walk steps along (`"horizontal"` / `"vertical"`) | `"horizontal"` |
| `layoutRankSpacing` | flow step between consecutive ranks, in flow units | `240` (`PHANTOM_NODE_OFFSET`) |
| `layoutNodeSpacing` | gap between neighbouring boxes of one rank, in flow units | `240` (`PHANTOM_NODE_OFFSET`) |

`layoutRankSpacing` is what makes a phantom land on the **rank line of its
sibling**: without it the step is a fixed 240 while a layered rank may sit 280
away, so the ghost of one branch floats 40 units above the real node that
occupies the same rank in the other branch. The flow step is
`max(layoutRankSpacing, boxExtentAlongTheAxis + PHANTOM_CONNECTOR_MIN_LENGTH)`, so
a box larger than the pitch grows the step instead of collapsing the connector,
and every whole step of the forward walk uses it.

`layoutNodeSpacing` is the sideways pitch: a lane sits `crossExtent +
layoutNodeSpacing` from the anchor's column — one box of that rank plus the gap
the layout leaves between neighbours — so it lands exactly where the next column
would. Both are axis-swapped from that one rule (the flow extent is the height on
a vertical graph and the width on a horizontal one; the cross extent the other
way round), so no literal belongs to an axis.

A host that declares no rank pitch keeps the flow step it had (240 flow units).
The lane pitch always carries the box's own cross extent, so declaring no node
gap means "a 240-unit gap past the box", not a bare 240-unit offset: a lane
lands where that rank's next column would instead of half a column short.

### Usage

Import the React Flow stylesheet once in your host app before rendering:

```ts
import "@xyflow/react/dist/style.css";
```

See `examples/phase4-demo` (`pnpm --filter @nodera/example-phase4-demo dev`) and
`examples/phase5-demo` (`pnpm --filter @nodera/phase5-demo dev`), which use this
layer with an `EditorEngine` and no builder.

### Architecture rules honored

- Viewport/zoom/pan stays React Flow internal state (never in the portable document or the engine).
- The engine remains the single source of truth; the canvas holds no parallel model state.
- The domain never receives React Flow objects; only plain ids and positions cross the boundary.

---

## Layer 2 — the SDK binding

The React binding of `@nodera/sdk` and the first presentation engine adapter.

It supplies the two things the framework-agnostic SDK cannot: React components
that read a builder, and a selected canvas engine. A host that wants React mounts
one component, or composes its own surface inside the provider:

```tsx
import { createRoot } from "react-dom/client";

import { NoderaEditor } from "@nodera/react-flow";

import { createDemoBuilder } from "./builder.js";

const builder = createDemoBuilder();

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root mount point");
}

createRoot(root).render(<NoderaEditor builder={builder} />);
```

(`examples/phase6-demo/src/main.tsx` and `demo-app.tsx`, trimmed. The host's
entry module also imports the engine stylesheet,
`import "@xyflow/react/dist/style.css";`, once before rendering — see
[Import restrictions](#import-restrictions).)

### Responsibility

- Turn one assembled `Builder` into a renderable editor: state, registries,
  renderers and feature flags all come from the builder, never from a second
  wiring step.
- Provide the React Flow engine adapter (`createReactFlowAdapter`) so a host can
  pass `adapter` to `createBuilder`.
- Convert the SDK's opaque renderer values into React registries
  (`createRendererSet`).

It never implements a canvas, a graph rule or an editing use case: the canvas is
the layer above (`src/canvas`, `src/map`, `src/registries`, `src/renderers`) and
the rules are the application use cases the SDK already delegates to. Mounting
is, by definition, framework code.

### `NoderaBuilderProvider` and `useBuilder`

```tsx
import type { ReactNode } from "react";

import { NoderaBuilderProvider, useBuilder } from "@nodera/react-flow";

function SaveButton(): ReactNode {
  const builder = useBuilder();
  return (
    <button
      type="button"
      onClick={() => {
        const text = builder.document.serialize("json");
        if (text.ok) {
          console.log(`exported ${text.value.length} characters`);
        }
      }}
    >
      Save
    </button>
  );
}

// `render` is your host's root: createRoot(element).render(...)
render(
  <NoderaBuilderProvider builder={builder}>
    <SaveButton />
  </NoderaBuilderProvider>,
);
```

The provider consumes the builder's **own** store and registries — `builder.store`,
`builder.editor`, `builder.registries.{themes,layouts,panels,tools}` — and passes
them into `NoderaUiProvider` instead of letting the UI layer build defaults. That
is what makes an SDK contribution visible in the UI with no extra step:

```ts
assertValid(builder.registerPanel({ id: "acme.panel.audit", title: "Audit", region: "right" }));
assertValid(builder.theme.setDefault("nodera.dark")); // the registry ships nodera.light and nodera.dark
```

Both calls reach the rendered surface (a panel without a bound renderer is shown
with the framework's labelled placeholder, not skipped). Building the defaults
again inside the provider would make them silently invisible.

`useBuilder()` returns the exact builder object and throws outside a provider
(`useBuilder must be used inside <NoderaBuilderProvider>`): a surface that asks
for the builder has no meaningful fallback. `useBuilderRenderers()` returns the
React `RendererSet` of the nearest provider and throws for the same reason.

### `<NoderaEditor>`

The default composition, and only a default: shell, panel hosts, canvas
container, canvas and context menu, in one component.

| Prop | Purpose |
| --- | --- |
| `builder` | the assembled builder the editor renders (required) |
| `base` | `ComponentRenderers` to start from; defaults to the framework presets |
| `layout` | layout id from `builder.registries.layouts`; applied on mount when the store has a different one |
| `slots` | `Partial<EditorShellSlots>`; only the regions named are replaced |
| `onResizeRegion` | host hook after a region splitter drag |
| `renderEdgeInsert` | replaces the per-edge "+" (S6) |
| `renderPlaceholder` | replaces the phantom placeholder box and its "+" (S6) |
| `layoutDirection` | axis the placeholders step along (`"horizontal"` by default) |
| `layoutRankSpacing` | rank pitch the placeholders step by (the layout's `rankSpacing`; `240` by default) |
| `layoutNodeSpacing` | gap between neighbouring boxes of one rank, which sets the sideways lane pitch (`240` by default) |
| `className` | wrapper class for host styling |

```tsx
<NoderaEditor
  builder={builder}
  layout="acme.pipeline"
  slots={{ header: <Header title="ACME pipeline" /> }}
  onResizeRegion={(region, size) => {
    console.log(region, size);
  }}
/>
```

The composition is honest about what it can show:

- panels come from `builder.registries.panels` **and** the applied layout state,
  so a panel the host unregistered or a layout that hides it is not composed;
- feature flags gate panels: `features.minimap === false` drops the minimap
  panel, `features.validation === false` drops the validation panel. A feature is
  a capability, not a naming convention, so the mapping is explicit in
  `featureAllowsPanel`;
- the canvas region passes `builder.features.minimap` and
  `builder.adapter?.capabilities.controls` to `GraphCanvas`, and a palette drop
  becomes `builder.graph.addNode({ type, position })` — one mutation route, not
  two.

`<NoderaEditor>` supplies its own `NoderaBuilderProvider`, so a host mounts one
component. A host that wants its own arrangement uses the provider directly and
composes `@nodera/ui-react` plus this package's canvas layer itself — the Phase 5
way, with no builder involved.

### `createReactFlowAdapter`

```ts
import { createBuilder } from "@nodera/sdk";
import { createReactFlowAdapter } from "@nodera/react-flow";

const builder = createBuilder({
  adapter: createReactFlowAdapter(),
});
```

The adapter declares `id: "nodera.react-flow"`, `label: "React Flow"` and every
capability in `AdapterCapabilities` as `true`. `createReactFlowAdapter({ capabilities })`
withdraws individual capabilities (an omitted key keeps its `true` default), which
is how a host that deliberately replaces a surface avoids a misleading
declaration. The capability record is written out explicitly, so adding a
capability to the SDK makes this package fail to type-check until the engine
decision is made.

The adapter only *declares*. It does not mount anything; mounting is
`<NoderaEditor>`.

### `createRendererSet`

The SDK records renderers as opaque `unknown` values keyed by stable ids. This is
the only place in the framework where they become React component types.

```ts
import { createRendererSet } from "@nodera/react-flow";

const renderers = createRendererSet(builder.renderers);
```

Mapping: `nodes` / `edges` / `ports` go to the canvas adapter registries
(`NodeRendererRegistry`, `EdgeRendererRegistry`, `PortRendererRegistry`);
`properties` / `panels` / `toolbars` / `menus` go to the matching
`ComponentRenderers` slot of `@nodera/ui-react`. The canvas registries start empty
and keep their duplicate detection; the component slots start from the framework
presets and bound ids **replace** them, which is how a host replaces a built-in
panel renderer without unregistering it.

A value that React cannot render is a host programming error at the framework
boundary, so it fails loudly instead of being skipped:

```ts
export function isRenderableComponent(value: unknown): boolean {
  if (typeof value === "function") {
    return true;                                   // function or class component
  }
  if (typeof value === "string") {
    return value.length > 0;                       // intrinsic element type
  }
  if (typeof value === "object" && value !== null) {
    return "$$typeof" in value;                    // memo / forwardRef / lazy
  }
  return false;
}
```

`createRendererSet` throws `InvalidRendererBindingError` naming every offending
binding as `<kind>:<id>`, **before** building any registry. Throwing is
intentional: skipping a broken binding would leave the host with a renderer that
never appears and no diagnostic explaining why, which is the same policy
`ComponentRegistry` in `@nodera/ui-react` already applies. Call it where a
programming error is still recoverable (render, a test, a boot check), not per
keystroke.

### Import restrictions

- React Flow is a dependency of **this package only**. No other package of the
  monorepo may import `@xyflow/react`; `pnpm check:architecture` (rule
  `react-flow-adapter-only`) fails if one does.
- This package declares `@nodera/sdk`, and its binding layer composes a builder
  through it. The binding never imports `@nodera/domain`,
  `@nodera/application` or `@nodera/document`: that is the canvas layer's job,
  and the SDK stays the single composition surface (`react-flow-consumes-the-sdk`).
- `@nodera/ui-react` never depends on this package and never mentions
  `@xyflow`, so it stays the engine-agnostic React layer
  (`ui-react-owns-no-adapter`, `ui-react-ignores-react-flow`).
- `@nodera/sdk` never depends on this package: the direction is
  `@nodera/react-flow → @nodera/sdk → core packages`.
- The engine's stylesheet is a host concern, the Phase 4 precedent: the host
  imports `@xyflow/react/dist/style.css` (and therefore declares `@xyflow/react`
  itself). This package ships no stylesheet and no CSS copy.

### Public vocabulary

`src/vocabulary.ts` publishes, type-only, the contracts a host renderer receives
on the UI side — `ComponentRenderers`, `EditorShellSlots`, `PanelRendererProps`,
`PropertyRendererProps`, `ToolbarRendererProps`, `MenuRendererProps` — re-exported
from their owner `@nodera/ui-react`. The canvas-side half
(`NoderaNodeRendererProps`, `NoderaNodeData`, `NoderaNodePort`,
`NoderaPortRendererProps`, `GraphCanvasProps`) is exported by the canvas layer of
this same package. One owner per name, one export per name, no re-declaration.

### Scripts

`pnpm --filter @nodera/react-flow test` (jsdom), `typecheck`, `build`.
