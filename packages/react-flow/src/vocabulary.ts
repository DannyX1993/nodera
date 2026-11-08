/**
 * Public renderer vocabulary of the SDK binding.
 *
 * A renderer value stays opaque inside `@nodera/sdk`: the SDK records it as
 * `unknown` under a stable id and never inspects it (D3), so nothing about a
 * component crosses the framework-agnostic boundary. Once the binding receives
 * it, that same value has a contract — the props it is called with, the slots
 * it can fill. Those contracts are declared by the package that implements them,
 * and a host that writes a renderer has to be able to *name* them.
 *
 * This module publishes the UI-side half of that vocabulary, re-exported
 * type-only from its owner `@nodera/ui-react`: panel, property, toolbar and menu
 * renderer props, plus the slot and registry shapes a host composes.
 *
 * The canvas-side half (`NoderaNodeRendererProps`, `NoderaNodeData`,
 * `NoderaNodePort`, `NoderaPortRendererProps`, `GraphCanvasProps`) is owned and
 * exported by the canvas layer of this same package (see `./index.js`), so it is
 * not re-exported here: one export of each name, no ambiguity, and a host
 * implementing a renderer and the registry that mounts it always agree on the
 * same type.
 */

export type {
  ComponentRenderers,
  EditorShellSlots,
  MenuRendererProps,
  PanelRendererProps,
  PropertyRendererProps,
  ToolbarRendererProps,
} from "@nodera/ui-react";
