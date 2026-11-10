/**
 * `@nodera/react-flow` — the React Flow integration for Nodera.
 *
 * The package has two layers, and they keep separate directories:
 *
 * 1. **The canvas adapter (engine)** — `./canvas`, `./map`, `./registries`,
 *    `./renderers` (except `renderer-set.ts`). It translates the portable graph
 *    model into React Flow and turns visual interactions back into application
 *    use cases. A Phase 4/5 host uses this layer directly, with no builder:
 *    `GraphCanvas`, `NoderaCanvasProvider`, the renderer registries and the
 *    default renderers need an `EditorEngine` and nothing else. It is the only
 *    place in the monorepo allowed to import `@xyflow/react`.
 *
 * 2. **The SDK binding (composition)** — `./adapter`, `./providers`, `./editor`,
 *    `./vocabulary` and `./renderers/renderer-set.ts`. It turns one assembled
 *    `Builder` into a renderable editor: `NoderaEditor`,
 *    `NoderaBuilderProvider`, `useBuilder`, `createReactFlowAdapter`,
 *    `createRendererSet`. Composition goes through `@nodera/sdk`; the binding
 *    never reaches the domain or the application use cases on its own.
 *
 * The two layers ship together because the binding is written against the canvas
 * types: it feeds `NodeRendererRegistry`/`EdgeRendererRegistry`/
 * `PortRendererRegistry` and the `GraphCanvas` prop contracts straight into the
 * canvas layer, so splitting them would produce a package whose whole public
 * surface is another package's types.
 *
 * React Flow is the *engine*. A different engine — or a non-React framework — is
 * a **different package**: this one stays React Flow's integration and keeps its
 * name, and nothing here is a prerequisite for the engine-agnostic
 * `@nodera/sdk`. `@nodera/ui-react` also stays separate and engine-agnostic: it
 * composes panels, providers and property renderers and never imports this
 * package or React Flow.
 */

// ---------------------------------------------------------------------------
// Canvas adapter layer
// ---------------------------------------------------------------------------

// React Flow mappers
export {
  toReactFlowNodes,
  toReactFlowEdges,
  nodePositionFromReactFlow,
  connectionFromReactFlow,
  removedIdsFromReactFlowChanges,
} from "./map/react-flow-mapper.js";

// Renderer registries
export {
  NodeRendererRegistry,
  EdgeRendererRegistry,
  PortRendererRegistry,
  DEFAULT_NODE_RENDERER_ID,
  DEFAULT_EDGE_RENDERER_ID,
  DEFAULT_PORT_RENDERER_ID,
  resolveNodeRenderer,
  resolvePortRenderer,
  DuplicateRegistrationError,
  MissingRendererError,
} from "./registries/renderer-registries.js";

// Renderers
export { DefaultNodeRenderer } from "./renderers/default-node-renderer.js";
export {
  DefaultEdgeRenderer,
  buildEdgePathThroughWaypoints,
} from "./renderers/default-edge-renderer.js";
export { PortHandle } from "./renderers/port-renderer.js";
export type { PortHandleProps } from "./renderers/port-renderer.js";
export { defaultEdgeOptionsFromVisual, type EdgeOptions } from "./renderers/edge-options.js";
export type {
  NoderaNodeData,
  NoderaNodePort,
  NoderaNodeRendererProps,
  NoderaPortRendererProps,
} from "./renderers/node-renderer-props.js";

// Canvas
export {
  NoderaEditorProvider,
  NoderaEditorContext,
  useNoderaEditor,
} from "./canvas/editor-context.js";
export { NoderaCanvasProvider, useNoderaCanvas } from "./canvas/nodera-canvas-provider.js";
export {
  GraphCanvas,
  commitDraggedNodes,
  commitSelectionFromReactFlow,
  canvasBackgroundOptions,
  canvasEdgeTypes,
} from "./canvas/graph-canvas.js";
export type { CanvasBackgroundOptions } from "./canvas/graph-canvas.js";
export { canvasInteractionSettings } from "./canvas/interaction-mode.js";
export type { CanvasInteractionMode, CanvasInteractionSettings } from "./canvas/interaction-mode.js";
export { useEditorGraph } from "./canvas/use-editor-graph.js";
export {
  NODE_DEFINITION_MIME_TYPE,
  nodeDefinitionFromDataTransfer,
  isNodeDefinitionDrag,
} from "./canvas/definition-drop.js";
export { NoderaNodeRenderer, createNodeType, useNodeTypes } from "./canvas/custom-node.js";
export type { NoderaNodeDataWithRenderer } from "./canvas/custom-node.js";
export type { GraphCanvasProps } from "./canvas/graph-canvas.js";
// The default insert affordances, so a host wraps them instead of reimplementing
// them: `renderEdgeInsert` and `renderPlaceholder` receive the framework geometry
// and the host supplies the control on top.
export {
  CanvasPlaceholderOverlay,
  DefaultEdgeInsertButton,
  DefaultPlaceholderBox,
} from "./canvas/graph-canvas.js";
export type {
  PhantomPlaceholder,
  PlaceholderKind,
} from "./canvas/graph-canvas.js";

// ---------------------------------------------------------------------------
// SDK binding layer
// ---------------------------------------------------------------------------

export * from "./vocabulary.js";
export * from "./adapter/react-flow-adapter.js";
export * from "./renderers/renderer-set.js";
export * from "./providers/builder-provider.js";
export * from "./editor/nodera-editor.js";
