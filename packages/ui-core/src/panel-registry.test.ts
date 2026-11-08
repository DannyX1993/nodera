import { describe, expect, it } from "vitest";

import { PanelRegistry } from "./panel-registry.js";
import { DEFAULT_PANEL_DEFAULTS, resolvePanelDefaults } from "./panel-definition.js";
import type { PanelDefinition } from "./panel-definition.js";

const palette: PanelDefinition = {
  id: "palette",
  title: "Node palette",
  region: "left",
  renderer: "nodera.panel.node-palette",
};

const validation: PanelDefinition = {
  id: "validation",
  title: "Validation",
  region: "bottom",
};

const inspector: PanelDefinition = {
  id: "inspector",
  title: "Inspector",
  region: "right",
};

describe("PanelRegistry", () => {
  it("registers panel definitions and enumerates them by region in registration order", () => {
    const registry = new PanelRegistry();
    registry.register(palette);
    registry.register(validation);
    registry.register(inspector);

    expect(registry.size).toBe(3);
    expect(registry.all().map((panel) => panel.id)).toEqual(["palette", "validation", "inspector"]);
    expect(registry.byRegion("left").map((panel) => panel.id)).toEqual(["palette"]);
    expect(registry.byRegion("floating")).toEqual([]);
  });

  it("rejects a duplicate panel id instead of overwriting it", () => {
    const registry = new PanelRegistry();
    registry.register(palette);

    const result = registry.register({ ...palette, title: "Another palette" });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toBe(
      'panel-registry already contains a definition with id "palette"',
    );
  });

  it("reports unknown panels as not-found and stops listing them after unregister", () => {
    const registry = new PanelRegistry();
    registry.register(palette);

    expect(registry.get("validation")).toBeUndefined();
    expect(registry.require("validation").ok).toBe(false);
    expect(registry.unregister("validation").ok).toBe(false);

    const removed = registry.unregister("palette");
    expect(removed.ok).toBe(true);
    expect(registry.has("palette")).toBe(false);
    expect(registry.byRegion("left")).toEqual([]);
  });
});

describe("resolvePanelDefaults", () => {
  it("fills documented defaults for a panel that declares only its placement", () => {
    expect(resolvePanelDefaults(validation)).toEqual(DEFAULT_PANEL_DEFAULTS);
  });

  it("keeps explicit capability and sizing values", () => {
    const resolved = resolvePanelDefaults({
      ...palette,
      size: 320,
      minSize: 200,
      maxSize: 500,
      resizable: false,
      dockable: false,
      hideable: false,
      floating: false,
      visible: false,
      order: 2,
    });

    expect(resolved).toEqual({
      size: 320,
      minSize: 200,
      maxSize: 500,
      resizable: false,
      dockable: false,
      hideable: false,
      floating: false,
      visible: false,
      order: 2,
    });
  });
});
