import { describe, expect, it } from "vitest";

import { createDefaultPanelRegistry } from "./default-panels.js";
import { createDefaultToolRegistry } from "./default-tools.js";

const PANEL_IDS = [
  "header",
  "footer",
  "palette",
  "navigator",
  "properties",
  "inspector",
  "validation",
  "history",
  "metadata",
  "search",
  "minimap",
];

describe("createDefaultPanelRegistry", () => {
  it("registers the phase-5 panels in composition order", () => {
    const registry = createDefaultPanelRegistry();

    expect(registry.size).toBe(PANEL_IDS.length);
    expect(registry.all().map((panel) => panel.id)).toEqual(PANEL_IDS);
    for (const id of PANEL_IDS) {
      expect(registry.get(id)?.renderer).toBe(`nodera.panel.${id}`);
    }
  });

  it("declares the documented regions and sizes", () => {
    const registry = createDefaultPanelRegistry();

    expect(registry.get("header")).toMatchObject({ region: "header", size: 44, resizable: false, hideable: false });
    expect(registry.get("footer")).toMatchObject({ region: "footer", size: 28, resizable: false, hideable: false });
    expect(registry.get("palette")).toMatchObject({ title: "Node palette", region: "left", size: 240 });
    expect(registry.get("navigator")).toMatchObject({ region: "left", size: 240 });
    expect(registry.get("properties")).toMatchObject({ region: "right", size: 300 });
    expect(registry.get("inspector")).toMatchObject({ region: "right", size: 300 });
    expect(registry.get("validation")).toMatchObject({ region: "bottom", size: 160 });
    expect(registry.get("history")).toMatchObject({ region: "bottom", size: 160 });
    expect(registry.get("metadata")).toMatchObject({ region: "external" });
    expect(registry.get("search")).toMatchObject({ region: "floating", size: 320 });
    expect(registry.get("minimap")).toMatchObject({ region: "right", size: 240 });
  });
});

describe("createDefaultToolRegistry", () => {
  it("registers the declarative tools in presentation order", () => {
    const registry = createDefaultToolRegistry();

    expect(registry.all().map((tool) => tool.id)).toEqual([
      "tool.undo",
      "tool.redo",
      "tool.delete",
      "tool.copy",
      "tool.cut",
      "tool.paste",
      "tool.validate",
      "tool.fit-view",
    ]);
  });

  it("declares commands, groups, availability and danger flags", () => {
    const registry = createDefaultToolRegistry();

    expect(registry.get("tool.undo")).toMatchObject({
      group: "history",
      command: { kind: "undo" },
      availability: "undo-available",
    });
    expect(registry.get("tool.redo")).toMatchObject({
      group: "history",
      command: { kind: "redo" },
      availability: "redo-available",
    });
    expect(registry.get("tool.delete")).toMatchObject({
      group: "edit",
      command: { kind: "delete-selection" },
      availability: "selection",
      danger: true,
    });
    expect(registry.get("tool.copy")).toMatchObject({
      group: "edit",
      command: { kind: "copy-selection" },
      availability: "selection",
    });
    expect(registry.get("tool.cut")).toMatchObject({
      group: "edit",
      command: { kind: "cut-selection" },
      availability: "selection",
      danger: true,
    });
    expect(registry.get("tool.paste")).toMatchObject({
      group: "edit",
      command: { kind: "paste-selection" },
      availability: "clipboard",
    });
    expect(registry.get("tool.validate")).toMatchObject({
      group: "graph",
      command: { kind: "validate" },
      availability: "always",
    });
    expect(registry.get("tool.fit-view")).toMatchObject({
      group: "view",
      command: { kind: "fit-view" },
      availability: "always",
    });
  });
});
