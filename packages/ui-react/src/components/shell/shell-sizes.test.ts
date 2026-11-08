import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LAYOUT_VIEWPORT,
  createLayoutState,
  EDITOR_LAYOUT,
  IDE_LAYOUT,
  resolveLayout,
} from "@nodera/layout-engine";
import type { LayoutState } from "@nodera/ui-core";

import { computeShellSizes, panelIdForRegion } from "./shell-sizes.js";

/**
 * Delegation seam of the shell geometry.
 *
 * `computeShellSizes` must ask the layout engine where the regions are instead
 * of re-deriving a max-per-region rule from panel sizes (two geometry paths
 * drift). The suite records the engine call through a partial module mock so
 * the delegation is observable: a re-implemented inline rule ignores the
 * recorded override and fails the pinned cases below.
 */
vi.mock("@nodera/layout-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodera/layout-engine")>();
  return { ...actual, resolveLayout: vi.fn(actual.resolveLayout) };
});

const resolveLayoutSpy = vi.mocked(resolveLayout);

beforeEach(() => {
  resolveLayoutSpy.mockClear();
});

describe("computeShellSizes", () => {
  it("reads the region edges from the layout engine's resolved geometry", () => {
    const layout = createLayoutState(IDE_LAYOUT);

    // Rectangles the engine would never produce for this layout: only a real
    // delegation can report them, an inline max-per-region rule cannot.
    resolveLayoutSpy.mockReturnValueOnce({
      viewport: DEFAULT_LAYOUT_VIEWPORT,
      regions: [
        { region: "header", rect: { x: 0, y: 0, width: 1280, height: 52 } },
        { region: "left", rect: { x: 0, y: 52, width: 275, height: 720 } },
        { region: "bottom", rect: { x: 275, y: 520, width: 700, height: 190 } },
      ],
      panels: [],
      hidden: [],
      external: [],
    });

    expect(computeShellSizes(layout)).toEqual({
      header: 52,
      footer: 0,
      left: 275,
      right: 0,
      bottom: 190,
    });
  });

  it("resolves the geometry with an empty definition and the default viewport", () => {
    const layout = createLayoutState(EDITOR_LAYOUT);

    computeShellSizes(layout);

    expect(resolveLayoutSpy).toHaveBeenCalledTimes(1);
    const call = resolveLayoutSpy.mock.calls[0];
    expect(call?.[0].panels).toEqual([]);
    expect(call?.[1]).toBe(layout);
    expect(call?.[2]).toStrictEqual({ viewport: DEFAULT_LAYOUT_VIEWPORT });
  });

  it("uses the largest panel of a region, never the sum of the panels", () => {
    const layout: LayoutState = {
      panels: [
        { panelId: "palette", region: "left", visible: true, size: 240 },
        { panelId: "navigator", region: "left", visible: true, size: 260 },
      ],
    };

    expect(computeShellSizes(layout).left).toBe(260);
  });

  it("ignores panels the shell does not dock even when they are larger", () => {
    const layout: LayoutState = {
      panels: [
        { panelId: "palette", region: "left", visible: true, size: 200 },
        { panelId: "search", region: "floating", visible: true, size: 900 },
        { panelId: "metadata", region: "external", visible: true, size: 900 },
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
