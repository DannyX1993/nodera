import { describe, expect, it } from "vitest";
import type { LayoutDefinition, PanelDefinition } from "@nodera/ui-core";

import {
  createLayoutState,
  dockPanel,
  floatPanel,
  resizePanel,
  setPanelVisible,
  togglePanel,
} from "./layout-state.js";

const definition: LayoutDefinition = {
  id: "acme.test",
  panels: [
    { panelId: "palette", region: "left", size: 240 },
    { panelId: "properties", region: "right", size: 300, visible: false },
    { panelId: "validation", region: "bottom", size: 160 },
  ],
};

const panels: readonly PanelDefinition[] = [
  {
    id: "palette",
    title: "Palette",
    region: "left",
    size: 240,
    minSize: 200,
    maxSize: 360,
    resizable: true,
  },
  { id: "properties", title: "Properties", region: "right", size: 300, hideable: true },
  { id: "validation", title: "Validation", region: "bottom", size: 160, resizable: false, hideable: false },
];

describe("createLayoutState", () => {
  it("derives panel state from the layout placements and their declared defaults", () => {
    const state = createLayoutState(definition);

    expect(state.panels).toEqual([
      { panelId: "palette", region: "left", visible: true, size: 240 },
      { panelId: "properties", region: "right", visible: false, size: 300 },
      { panelId: "validation", region: "bottom", visible: true, size: 160 },
    ]);
  });

  it("falls back to the panel definition size and then to the documented default", () => {
    const state = createLayoutState(
      {
        id: "acme.test",
        panels: [
          { panelId: "palette", region: "left" },
          { panelId: "unknown", region: "bottom" },
        ],
      },
      { panels },
    );

    expect(state.panels[0]?.size).toBe(240);
    expect(state.panels[1]?.size).toBe(240);
  });

  it("uses the region size of the layout when neither the panel nor the placement declare one", () => {
    const state = createLayoutState(
      { id: "acme.test", regionSizes: { left: 320 }, panels: [{ panelId: "palette", region: "left" }] },
      { panels },
    );

    expect(state.panels[0]?.size).toBe(320);
  });

  it("keeps the rectangle of a panel the layout places as floating", () => {
    const state = createLayoutState({
      id: "acme.test",
      panels: [
        {
          panelId: "search",
          region: "floating",
          rect: { x: 10, y: 20, width: 220, height: 140 },
        },
      ],
    });

    expect(state.panels[0]?.rect).toEqual({ x: 10, y: 20, width: 220, height: 140 });
  });
});

describe("resizePanel", () => {
  it("clamps a resize to the panel min and max size", () => {
    const state = createLayoutState(definition, { panels });

    expect(resizePanel(state, { panelId: "palette", size: 400 }, { panels }).panels[0]?.size).toBe(360);
    expect(resizePanel(state, { panelId: "palette", size: 120 }, { panels }).panels[0]?.size).toBe(200);
    expect(resizePanel(state, { panelId: "palette", size: 300 }, { panels }).panels[0]?.size).toBe(300);
  });

  it("ignores a resize of a non-resizable panel", () => {
    const state = createLayoutState(definition, { panels });

    expect(resizePanel(state, { panelId: "validation", size: 400 }, { panels })).toBe(state);
  });

  it("ignores unknown panels and non-finite sizes without rebuilding state", () => {
    const state = createLayoutState(definition, { panels });

    expect(resizePanel(state, { panelId: "missing", size: 100 }, { panels })).toBe(state);
    expect(resizePanel(state, { panelId: "palette", size: Number.NaN }, { panels })).toBe(state);
    expect(resizePanel(state, { panelId: "palette", size: Number.POSITIVE_INFINITY }, { panels })).toBe(state);
  });

  it("returns the same state when the size does not change", () => {
    const state = createLayoutState(definition, { panels });

    expect(resizePanel(state, { panelId: "palette", size: 240 }, { panels })).toBe(state);
  });
});

describe("setPanelVisible and togglePanel", () => {
  it("hides and shows a hideable panel", () => {
    const state = createLayoutState(definition, { panels });

    expect(setPanelVisible(state, { panelId: "properties", visible: true }, { panels }).panels[1]?.visible).toBe(true);
    expect(togglePanel(state, { panelId: "properties" }, { panels }).panels[1]?.visible).toBe(true);
  });

  it("keeps the size when a panel is hidden and shown again", () => {
    const hidden = setPanelVisible(createLayoutState(definition, { panels }), { panelId: "palette", visible: false }, { panels });
    const shown = setPanelVisible(hidden, { panelId: "palette", visible: true }, { panels });

    expect(hidden.panels[0]?.visible).toBe(false);
    expect(shown.panels[0]?.size).toBe(240);
    expect(shown.panels[0]?.visible).toBe(true);
  });

  it("ignores a non-hideable panel and an unchanged visibility", () => {
    const state = createLayoutState(definition, { panels });

    expect(setPanelVisible(state, { panelId: "validation", visible: false }, { panels })).toBe(state);
    expect(setPanelVisible(state, { panelId: "properties", visible: false }, { panels })).toBe(state);
    expect(togglePanel(state, { panelId: "missing" }, { panels })).toBe(state);
  });
});

describe("dockPanel and floatPanel", () => {
  it("moves a dockable panel to another region and clears its floating rectangle", () => {
    const floated = floatPanel(
      createLayoutState(definition, { panels }),
      { panelId: "palette", rect: { x: 30, y: 40, width: 240, height: 300 } },
      { panels },
    );

    const docked = dockPanel(floated, { panelId: "palette", region: "right" }, { panels });

    expect(docked.panels[0]?.region).toBe("right");
    expect(docked.panels[0]?.rect).toBeUndefined();
  });

  it("floats a panel with its rectangle and marks it visible", () => {
    const hidden = setPanelVisible(createLayoutState(definition, { panels }), { panelId: "properties", visible: false }, { panels });

    const floated = floatPanel(hidden, { panelId: "properties", rect: { x: 5, y: 6, width: 280, height: 200 } }, { panels });

    expect(floated.panels[1]).toEqual({
      panelId: "properties",
      region: "floating",
      visible: true,
      size: 300,
      rect: { x: 5, y: 6, width: 280, height: 200 },
    });
  });

  it("ignores docking when the panel is not dockable and floating when it is not allowed", () => {
    const fixedPanels: readonly PanelDefinition[] = [
      { id: "properties", title: "Properties", region: "right", dockable: false },
      { id: "palette", title: "Palette", region: "left", floating: false },
    ];
    const state = createLayoutState(definition, { panels: fixedPanels });

    expect(dockPanel(state, { panelId: "properties", region: "left" }, { panels: fixedPanels })).toBe(state);
    expect(
      floatPanel(state, { panelId: "palette", rect: { x: 0, y: 0, width: 10, height: 10 } }, { panels: fixedPanels }),
    ).toBe(state);
  });
});
