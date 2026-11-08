/**
 * Public renderer vocabulary of the React binding.
 *
 * A renderer value stays opaque inside `@nodera/sdk`: the SDK records it as
 * `unknown` under a stable id and never inspects it (D3), so nothing about a
 * component crosses the framework-agnostic boundary. Once the React binding
 * receives it, that same value has a contract — the props it is called with, the
 * data it reads from the canvas, the slots it can fill. Those contracts are
 * declared by the two packages that implement them, and a host that writes a
 * renderer has to be able to *name* them.
 *
 * This module is a type-only re-export of the owners of those contracts:
 *
 * - `@nodera/canvas-react-flow` owns what a canvas renderer receives
 *   (node/port props, node data, the canvas component's own props).
 * - `@nodera/ui-react` owns what a UI renderer receives (panel, property,
 *   toolbar and menu props) plus the slot and registry shapes a host composes.
 *
 * The binding never re-declares them, so a host implementing a renderer and the
 * registry that mounts it always agree on the same type.
 */

export type {
  GraphCanvasProps,
  NoderaNodeData,
  NoderaNodePort,
  NoderaNodeRendererProps,
  NoderaPortRendererProps,
} from "@nodera/canvas-react-flow";

export type {
  ComponentRenderers,
  EditorShellSlots,
  MenuRendererProps,
  PanelRendererProps,
  PropertyRendererProps,
  ToolbarRendererProps,
} from "@nodera/ui-react";
