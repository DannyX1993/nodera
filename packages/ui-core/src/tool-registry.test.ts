import { describe, expect, it } from "vitest";

import {
  DEFAULT_TOOL_AVAILABILITY_CONTEXT,
  isToolAvailable,
  type ToolAvailabilityContext,
} from "./tool-definition.js";
import { ToolRegistry } from "./tool-registry.js";
import type { ToolDefinition } from "./tool-definition.js";

function context(overrides: Partial<ToolAvailabilityContext> = {}): ToolAvailabilityContext {
  return { ...DEFAULT_TOOL_AVAILABILITY_CONTEXT, ...overrides };
}

const undo: ToolDefinition = {
  id: "tool.undo",
  label: "Undo",
  group: "history",
  command: { kind: "undo" },
  availability: "undo-available",
};

const redo: ToolDefinition = {
  id: "tool.redo",
  label: "Redo",
  group: "history",
  command: { kind: "redo" },
  availability: "redo-available",
};

const remove: ToolDefinition = {
  id: "tool.delete",
  label: "Delete selection",
  group: "edit",
  command: { kind: "delete-selection" },
  availability: "selection",
};

describe("ToolRegistry", () => {
  it("registers tools and enumerates them by group and unique group order", () => {
    const registry = new ToolRegistry();
    registry.register(undo);
    registry.register(remove);
    registry.register(redo);

    expect(registry.size).toBe(3);
    expect(registry.byGroup("history").map((tool) => tool.id)).toEqual(["tool.undo", "tool.redo"]);
    expect(registry.byGroup("edit").map((tool) => tool.id)).toEqual(["tool.delete"]);
    expect(registry.groups()).toEqual(["history", "edit"]);
    expect(registry.byGroup("missing")).toEqual([]);
  });

  it("lists tools without a group under an unspecified bucket when none declare one", () => {
    const registry = new ToolRegistry();
    registry.register({ id: "tool.fit", label: "Fit view", command: { kind: "fit-view" } });

    expect(registry.groups()).toEqual([]);
    expect(registry.byGroup("").map((tool) => tool.id)).toEqual(["tool.fit"]);
  });

  it("rejects a duplicate tool id", () => {
    const registry = new ToolRegistry();
    registry.register(undo);

    const result = registry.register({ ...undo, label: "Undo again" });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toBe(
      'tool-registry already contains a definition with id "tool.undo"',
    );
  });
});

describe("isToolAvailable", () => {
  it("always exposes a tool that declares no availability rule", () => {
    expect(isToolAvailable({ id: "tool.fit", label: "Fit", command: { kind: "fit-view" } }, context())).toBe(true);
  });

  it("gates undo and redo on the history state", () => {
    expect(isToolAvailable(undo, context({ canUndo: false }))).toBe(false);
    expect(isToolAvailable(undo, context({ canUndo: true }))).toBe(true);
    expect(isToolAvailable(redo, context({ canRedo: false }))).toBe(false);
    expect(isToolAvailable(redo, context({ canRedo: true }))).toBe(true);
  });

  it("gates selection tools on nodes or edges being selected", () => {
    expect(isToolAvailable(remove, context())).toBe(false);
    expect(isToolAvailable(remove, context({ selectedNodeCount: 1 }))).toBe(true);
    expect(isToolAvailable(remove, context({ selectedEdgeCount: 2 }))).toBe(true);
  });

  it("distinguishes node-selection, edge-selection and clipboard rules", () => {
    expect(isToolAvailable({ id: "t", label: "Node only", command: { kind: "custom", id: "x" }, availability: "node-selection" }, context({ selectedEdgeCount: 1 }))).toBe(false);
    expect(isToolAvailable({ id: "t", label: "Node only", command: { kind: "custom", id: "x" }, availability: "node-selection" }, context({ selectedNodeCount: 1 }))).toBe(true);
    expect(isToolAvailable({ id: "t", label: "Edge only", command: { kind: "custom", id: "x" }, availability: "edge-selection" }, context({ selectedEdgeCount: 1 }))).toBe(true);
    expect(isToolAvailable({ id: "t", label: "Paste", command: { kind: "paste-selection" }, availability: "clipboard" }, context({ clipboardSize: 0 }))).toBe(false);
    expect(isToolAvailable({ id: "t", label: "Paste", command: { kind: "paste-selection" }, availability: "clipboard" }, context({ clipboardSize: 1 }))).toBe(true);
  });
});
