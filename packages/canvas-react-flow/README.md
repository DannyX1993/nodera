# @nodera/canvas-react-flow

React Flow canvas adapter for Nodera (Phase 4). Translates the Nodera domain model to React Flow and translates visual interactions back into application commands. React Flow never crosses into the domain or application layers.

## Public API

- `GraphCanvas` — renders the graph from an `EditorEngine`; subscribes to the engine event bus; translates drag, connect, select and delete interactions back into use cases (`moveNode`, `createEdge`, `removeNode`, `removeEdge`, `selectNode`, `selectEdge`, `selectMultiple`, `clearSelection`). Props: `editor`, optional `nodeRenderers` / `edgeRenderers` registries, `showMinimap`, `showControls`, `colorMode` ("light" | "dark" | "system"), and passthrough callbacks (`onNodeClick`, `onEdgeClick`, `onConnect`, `onNodesChange`, `onEdgesChange`, `onLinkValidate`).
- `NoderaCanvasProvider` / `useNoderaCanvas` — React Flow provider wrapper.
- `useEditorGraph` — derives `{ nodes, edges, selectedNodeIds, selectedEdgeIds }` from the engine, event-driven.
- `NodeRendererRegistry` / `EdgeRendererRegistry` — register custom renderers by definition renderer id; duplicates fail loudly; resolution falls back to `nodera-default-node` / `nodera-default-edge`. The mapper carries the definition's `renderer` id in node `data.rendererId`, so a registered renderer is used automatically (see the demo's `transform-card`).
- `DefaultNodeRenderer`, `DefaultEdgeRenderer`, `PortHandle` — default renderers reading `visual` hints; `PortHandle` maps port direction to Handle type/position (input → target/Left; output/bidirectional → source/Right under `ConnectionMode: "loose"`; Handle id is exactly the port id). The node-type wrapper renders ports for every renderer, custom ones included.
- `defaultEdgeOptionsFromVisual` — `EdgeVisual` → React Flow edge options (lineStyle, color, animation, arrows).
- Mappers: `toReactFlowNodes`, `toReactFlowEdges`, `nodePositionFromReactFlow`, `connectionFromReactFlow`, `removedIdsFromReactFlowChanges`.
- Selection: click selects, Shift-click adds, click on the pane clears, RF box/multi selection syncs into the engine through `selectMultiple`; drag positions commit through `commitDraggedNodes` (one undo unit per moved node).

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
