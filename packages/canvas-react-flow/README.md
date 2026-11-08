# @nodera/canvas-react-flow

React Flow canvas adapter for Nodera (Phase 4). Translates the Nodera domain model to React Flow and translates visual interactions back into application commands. React Flow never crosses into the domain or application layers.

## Public API

- `GraphCanvas` — renders the graph from an `EditorEngine`; subscribes to the engine event bus; translates drag, connect, select and delete interactions back into use cases (`moveNode`, `createEdge`, `removeNode`, `removeEdge`, `selectNode`, `selectEdge`, `selectMultiple`, `clearSelection`). Props: `editor`, optional `nodeRenderers` / `edgeRenderers` / `portRenderers` registries, `interactionMode`, `showMinimap`, `showControls`, `colorMode` ("light" | "dark" | "system"), and passthrough callbacks (`onNodeClick`, `onEdgeClick`, `onConnect`, `onNodesChange`, `onEdgesChange`, `onLinkValidate`, `onDropNodeDefinition`).
- `NoderaCanvasProvider` / `useNoderaCanvas` — React Flow provider wrapper.
- `useEditorGraph` — derives `{ nodes, edges, selectedNodeIds, selectedEdgeIds }` from the engine, event-driven.
- `NodeRendererRegistry` / `EdgeRendererRegistry` — register custom renderers by definition renderer id; duplicates fail loudly; resolution falls back to `nodera-default-node` / `nodera-default-edge`. The mapper carries the definition's `renderer` id in node `data.rendererId`, so a registered renderer is used automatically (see the demo's `transform-card`).
- `DefaultNodeRenderer`, `DefaultEdgeRenderer`, `PortHandle` — default renderers reading `visual` hints; `PortHandle` maps port direction to Handle type/position (input → target/Left; output/bidirectional → source/Right under `ConnectionMode: "loose"`; Handle id is exactly the port id). The node-type wrapper renders ports for every renderer, custom ones included.
- `defaultEdgeOptionsFromVisual` — `EdgeVisual` → React Flow edge options (lineStyle, color, animation, arrows).
- Mappers: `toReactFlowNodes`, `toReactFlowEdges`, `nodePositionFromReactFlow`, `connectionFromReactFlow`, `removedIdsFromReactFlowChanges`.
- Selection: click selects, Shift-click adds, click on the pane clears, RF box/multi selection syncs into the engine through `selectMultiple`; drag positions commit through `commitDraggedNodes` (one undo unit per moved node) and RF selection changes through `commitSelectionFromReactFlow`.
- Keyboard: `Delete` and `Backspace` remove the selected elements (they flow through the `removeNode` / `removeEdge` use cases). Other shortcuts (copy/paste, undo/redo) belong to the host application layer.

## Interaction mode and canvas background

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

## Usage

Import the React Flow stylesheet once in your host app before rendering:

```ts
import "@xyflow/react/dist/style.css";
```

See `examples/phase4-demo` (`pnpm --filter @nodera/example-phase4-demo dev`).

## Architecture rules honored

- Viewport/zoom/pan stays React Flow internal state (never in the portable document or the engine).
- The engine remains the single source of truth; the canvas holds no parallel model state.
- The domain never receives React Flow objects; only plain ids and positions cross the boundary.
