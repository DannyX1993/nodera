import { describe, expect, it } from "vitest";
import type { LayoutDefinition } from "@nodera/ui-core";

import { createLayoutState } from "./layout-state.js";
import { resolveLayout } from "./resolve-layout.js";

const viewport = { width: 1000, height: 600 };

const classic: LayoutDefinition = {
  id: "acme.classic",
  panels: [
    { panelId: "header", region: "header", size: 40 },
    { panelId: "footer", region: "footer", size: 30 },
    { panelId: "palette", region: "left", size: 240 },
    { panelId: "properties", region: "right", size: 300 },
    { panelId: "validation", region: "bottom", size: 160 },
  ],
};

describe("resolveLayout", () => {
  it("computes the docked regions and the panel rectangles of a classic layout", () => {
    const resolved = resolveLayout(classic, createLayoutState(classic), { viewport });

    expect(resolved.regions).toEqual([
      { region: "header", rect: { x: 0, y: 0, width: 1000, height: 40 } },
      { region: "left", rect: { x: 0, y: 40, width: 240, height: 530 } },
      { region: "right", rect: { x: 700, y: 40, width: 300, height: 530 } },
      { region: "bottom", rect: { x: 240, y: 410, width: 460, height: 160 } },
      { region: "footer", rect: { x: 0, y: 570, width: 1000, height: 30 } },
    ]);

    expect(resolved.panels.map((panel) => panel.panelId)).toEqual([
      "header",
      "footer",
      "palette",
      "properties",
      "validation",
    ]);
    expect(resolved.panels[2]?.rect).toEqual({ x: 0, y: 40, width: 240, height: 530 });
  });

  it("leaves the remaining area to the canvas: no region means no reserved space", () => {
    const canvasOnly: LayoutDefinition = {
      id: "acme.canvas-only",
      panels: [{ panelId: "header", region: "header", size: 40 }],
    };

    const resolved = resolveLayout(canvasOnly, createLayoutState(canvasOnly), { viewport });

    expect(resolved.regions).toEqual([
      { region: "header", rect: { x: 0, y: 0, width: 1000, height: 40 } },
    ]);
  });

  it("excludes hidden panels from the geometry and reports them separately", () => {
    const state = createLayoutState(classic);
    const hiddenState = {
      panels: state.panels.map((panel) =>
        panel.panelId === "properties" ? { ...panel, visible: false } : panel,
      ),
    };

    const resolved = resolveLayout(classic, hiddenState, { viewport });

    expect(resolved.hidden).toEqual(["properties"]);
    expect(resolved.panels.map((panel) => panel.panelId)).not.toContain("properties");
    expect(resolved.regions.find((region) => region.region === "right")).toBeUndefined();
  });

  it("splits a region between the visible panels docked into it", () => {
    const stacked: LayoutDefinition = {
      id: "acme.stacked",
      panels: [
        { panelId: "palette", region: "left", size: 220 },
        { panelId: "navigator", region: "left", size: 220 },
      ],
    };

    const resolved = resolveLayout(stacked, createLayoutState(stacked), { viewport });

    expect(resolved.panels[0]?.rect).toEqual({ x: 0, y: 0, width: 220, height: 300 });
    expect(resolved.panels[1]?.rect).toEqual({ x: 0, y: 300, width: 220, height: 300 });
  });

  it("places floating panels at their rectangle, outside the docked regions", () => {
    const floating: LayoutDefinition = {
      id: "acme.floating",
      panels: [
        { panelId: "palette", region: "left", size: 240 },
        {
          panelId: "search",
          region: "floating",
          size: 280,
          rect: { x: 300, y: 120, width: 280, height: 200 },
        },
      ],
    };

    const resolved = resolveLayout(floating, createLayoutState(floating), { viewport });

    expect(resolved.panels[1]).toEqual({
      panelId: "search",
      region: "floating",
      rect: { x: 300, y: 120, width: 280, height: 200 },
    });
    expect(resolved.regions.map((region) => region.region)).toEqual(["left"]);
  });

  it("gives a floating panel without a rectangle a documented default position", () => {
    const floating: LayoutDefinition = {
      id: "acme.floating",
      panels: [{ panelId: "search", region: "floating", size: 280 }],
    };

    const resolved = resolveLayout(floating, createLayoutState(floating), { viewport });

    expect(resolved.panels[0]?.rect).toEqual({ x: 16, y: 16, width: 280, height: 280 });
  });

  it("reports external panels without inventing geometry for them", () => {
    const external: LayoutDefinition = {
      id: "acme.external",
      panels: [{ panelId: "metadata", region: "external" }],
    };

    const resolved = resolveLayout(external, createLayoutState(external), { viewport });

    expect(resolved.external).toEqual(["metadata"]);
    expect(resolved.panels).toEqual([]);
    expect(resolved.regions).toEqual([]);
  });

  it("never produces negative canvas space when docked sizes exceed the viewport", () => {
    const oversized: LayoutDefinition = {
      id: "acme.oversized",
      panels: [
        { panelId: "palette", region: "left", size: 900 },
        { panelId: "properties", region: "right", size: 900 },
      ],
    };

    const resolved = resolveLayout(oversized, createLayoutState(oversized), { viewport });

    expect(resolved.regions[0]?.rect.width).toBe(900);
    expect(resolved.regions[1]?.rect.width).toBe(900);
    expect(resolved.regions[1]?.rect.x).toBe(100);
  });

  it("resolves against a documented default viewport when the host provides none", () => {
    const resolved = resolveLayout(classic, createLayoutState(classic));

    expect(resolved.viewport).toEqual({ width: 1280, height: 800 });
  });
});
