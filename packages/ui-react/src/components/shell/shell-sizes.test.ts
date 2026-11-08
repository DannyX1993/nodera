import { describe, expect, it } from "vitest";

import { createLayoutState, EDITOR_LAYOUT, IDE_LAYOUT } from "@nodera/layout-engine";
import type { LayoutState } from "@nodera/ui-core";

import { computeShellSizes, panelIdForRegion } from "./shell-sizes.js";

describe("computeShellSizes", () => {
  it("reports the largest size of the visible panels of every region", () => {
    const layout = createLayoutState(IDE_LAYOUT);

    expect(computeShellSizes(layout)).toEqual({
      header: 44,
      footer: 28,
      left: 240,
      right: 320,
      bottom: 180,
    });
  });

  it("reports 0 for a region the layout has no panel in", () => {
    const sizes = computeShellSizes(createLayoutState(EDITOR_LAYOUT));

    expect(sizes).toEqual({ header: 44, footer: 0, left: 240, right: 300, bottom: 160 });
  });

  it("ignores hidden panels and panels outside the docked regions", () => {
    const layout: LayoutState = {
      panels: [
        { panelId: "hidden", region: "left", visible: false, size: 400 },
        { panelId: "visible", region: "left", visible: true, size: 200 },
        { panelId: "floating", region: "floating", visible: true, size: 320 },
        { panelId: "external", region: "external", visible: true, size: 999 },
      ],
    };

    expect(computeShellSizes(layout)).toEqual({
      header: 0,
      footer: 0,
      left: 200,
      right: 0,
      bottom: 0,
    });
  });

  it("reports 0 for every region when no layout is applied", () => {
    expect(computeShellSizes(undefined)).toEqual({
      header: 0,
      footer: 0,
      left: 0,
      right: 0,
      bottom: 0,
    });
  });
});

describe("panelIdForRegion", () => {
  it("returns the first visible panel docked in the region", () => {
    const layout: LayoutState = {
      panels: [
        { panelId: "palette", region: "left", visible: true, size: 240 },
        { panelId: "navigator", region: "left", visible: true, size: 260 },
        { panelId: "properties", region: "right", visible: true, size: 300 },
      ],
    };

    expect(panelIdForRegion(layout, "left")).toBe("palette");
    expect(panelIdForRegion(layout, "right")).toBe("properties");
  });

  it("skips hidden panels of the region", () => {
    const layout: LayoutState = {
      panels: [
        { panelId: "palette", region: "left", visible: false, size: 240 },
        { panelId: "navigator", region: "left", visible: true, size: 240 },
        { panelId: "validation", region: "bottom", visible: false, size: 160 },
      ],
    };

    expect(panelIdForRegion(layout, "left")).toBe("navigator");
    expect(panelIdForRegion(layout, "bottom")).toBeUndefined();
  });

  it("returns undefined without a layout or for a region it does not place", () => {
    expect(panelIdForRegion(undefined, "left")).toBeUndefined();
    expect(panelIdForRegion(createLayoutState(EDITOR_LAYOUT), "footer")).toBeUndefined();
    expect(panelIdForRegion({ panels: [] }, "right")).toBeUndefined();
  });
});
