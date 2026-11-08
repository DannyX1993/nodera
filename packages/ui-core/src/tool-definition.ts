import type { RegistryEntry } from "@nodera/contracts";

import type { DockRegion } from "./layout.js";

/**
 * Declarative action a tool triggers.
 *
 * Commands are data, not functions: a palette item, a toolbar button and a
 * context-menu entry can all describe the same action, and the presentation
 * adapter translates it into the matching application use case. `custom` defers
 * to a host-provided handler, which is how applications extend the UI without
 * the framework knowing their semantics.
 */
export type ToolCommand =
  | { readonly kind: "undo" }
  | { readonly kind: "redo" }
  | { readonly kind: "delete-selection" }
  | { readonly kind: "copy-selection" }
  | { readonly kind: "cut-selection" }
  | { readonly kind: "paste-selection" }
  | { readonly kind: "validate" }
  | { readonly kind: "fit-view" }
  | { readonly kind: "add-node"; readonly definitionId: string }
  | {
      readonly kind: "insert-node";
      readonly edgeId: string;
      readonly definitionId: string;
    }
  | { readonly kind: "select-node"; readonly nodeId: string }
  | { readonly kind: "select-edge"; readonly edgeId: string }
  | { readonly kind: "clear-selection" }
  | { readonly kind: "toggle-panel"; readonly panelId: string }
  | { readonly kind: "dock-panel"; readonly panelId: string; readonly region: DockRegion }
  | { readonly kind: "float-panel"; readonly panelId: string }
  | { readonly kind: "custom"; readonly id: string };

/**
 * When a tool is offered.
 *
 * Declarative on purpose: availability is evaluated from editor facts by a pure
 * function, so toolbars and menus never re-implement history or selection rules.
 */
export type ToolAvailability =
  | "always"
  | "undo-available"
  | "redo-available"
  | "selection"
  | "node-selection"
  | "edge-selection"
  | "clipboard";

/** Editor facts that decide whether a tool is available. */
export interface ToolAvailabilityContext {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly selectedNodeCount: number;
  readonly selectedEdgeCount: number;
  readonly clipboardSize: number;
}

/** Context of an editor with nothing selected, empty history and empty clipboard. */
export const DEFAULT_TOOL_AVAILABILITY_CONTEXT: ToolAvailabilityContext = Object.freeze({
  canUndo: false,
  canRedo: false,
  selectedNodeCount: 0,
  selectedEdgeCount: 0,
  clipboardSize: 0,
});

/**
 * Declarative tool definition, shared by toolbars, palettes and context menus.
 */
export interface ToolDefinition extends RegistryEntry {
  /** Globally qualified, stable id, e.g. `acme.tool.validate`. */
  readonly id: string;
  /** Human-readable label shown by every surface that offers the tool. */
  readonly label: string;
  readonly description?: string;
  /** Icon token or icon id resolved by the host. */
  readonly icon?: string;
  /** Toolbar group; ungrouped tools are offered as standalone actions. */
  readonly group?: string;
  readonly command: ToolCommand;
  readonly availability?: ToolAvailability;
  /** Marks destructive actions so surfaces can present them accordingly. */
  readonly danger?: boolean;
}

/** Evaluates a tool availability rule against editor facts. */
export function isToolAvailable(
  tool: ToolDefinition,
  context: ToolAvailabilityContext,
): boolean {
  const rule: ToolAvailability = tool.availability ?? "always";
  switch (rule) {
    case "always":
      return true;
    case "undo-available":
      return context.canUndo;
    case "redo-available":
      return context.canRedo;
    case "selection":
      return context.selectedNodeCount > 0 || context.selectedEdgeCount > 0;
    case "node-selection":
      return context.selectedNodeCount > 0;
    case "edge-selection":
      return context.selectedEdgeCount > 0;
    case "clipboard":
      return context.clipboardSize > 0;
  }
}
