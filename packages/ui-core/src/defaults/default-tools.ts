import { ToolRegistry } from "../tool-registry.js";
import type {
  ToolAvailability,
  ToolCommand,
  ToolDefinition,
} from "../tool-definition.js";

/** Options a preset tool may declare on top of its command. */
interface ToolOptions {
  readonly availability?: ToolAvailability;
  readonly danger?: boolean;
  readonly description?: string;
}

/**
 * Builds one preset tool definition.
 *
 * Tools are declarative (D4): a command kind plus an availability rule, never a
 * function. Every surface (toolbar, palette, context menu) resolves the same
 * definition, and the presentation adapter translates the command into the
 * matching application use case.
 */
function defineTool(
  id: string,
  label: string,
  group: string,
  command: ToolCommand,
  options: ToolOptions = {},
): ToolDefinition {
  return Object.freeze({
    id,
    label,
    group,
    command,
    availability: options.availability ?? "always",
    ...(options.danger === undefined ? {} : { danger: options.danger }),
    ...(options.description === undefined ? {} : { description: options.description }),
  });
}

/**
 * Tools the framework ships as starting points.
 *
 * They cover the editing, history, validation and view actions of the Phase 5
 * toolbar and context menu. Availability is declarative, so a surface never
 * re-implements the history or selection rules that decide when a tool applies.
 */
export const DEFAULT_TOOLS: readonly ToolDefinition[] = Object.freeze([
  defineTool("tool.undo", "Undo", "history", { kind: "undo" }, { availability: "undo-available" }),
  defineTool("tool.redo", "Redo", "history", { kind: "redo" }, { availability: "redo-available" }),
  defineTool("tool.delete", "Delete", "edit", { kind: "delete-selection" }, {
    availability: "selection",
    danger: true,
    description: "Removes the selected nodes and edges.",
  }),
  defineTool("tool.copy", "Copy", "edit", { kind: "copy-selection" }, {
    availability: "selection",
    description: "Copies the selection into the clipboard.",
  }),
  defineTool("tool.cut", "Cut", "edit", { kind: "cut-selection" }, {
    availability: "selection",
    danger: true,
    description: "Copies the selection into the clipboard and removes it.",
  }),
  defineTool("tool.paste", "Paste", "edit", { kind: "paste-selection" }, {
    availability: "clipboard",
    description: "Pastes the clipboard into the graph.",
  }),
  defineTool("tool.validate", "Validate", "graph", { kind: "validate" }, {
    description: "Runs the validation pipeline and reports its issues.",
  }),
  defineTool("tool.fit-view", "Fit view", "view", { kind: "fit-view" }, {
    description: "Fits the whole graph into the canvas viewport.",
  }),
]) as readonly ToolDefinition[];

/**
 * Creates a registry holding the default tools.
 *
 * A fresh registry per UI instance lets a host drop or replace individual tools
 * without mutating a shared, framework-wide registry.
 */
export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of DEFAULT_TOOLS) {
    const registered = registry.register(tool);
    if (!registered.ok) {
      throw new Error(registered.error.message);
    }
  }
  return registry;
}
