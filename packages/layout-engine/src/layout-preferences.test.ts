import { describe, expect, it } from "vitest";
import type { LayoutDefinition } from "@nodera/ui-core";

import { createLayoutState } from "./layout-state.js";
import {
  LAYOUT_PREFERENCES_VERSION,
  applyPreferences,
  deserializePreferences,
  serializePreferences,
  toPreferences,
  type LayoutPreferences,
} from "./layout-preferences.js";
import {
  createMemoryLayoutPreferenceStore,
  restoreLayoutPreferences,
  saveLayoutPreferences,
} from "./layout-preference-store.js";

const definition: LayoutDefinition = {
  id: "acme.classic",
  panels: [
    { panelId: "palette", region: "left", size: 240 },
    { panelId: "properties", region: "right", size: 300 },
  ],
};

describe("toPreferences", () => {
  it("captures the applied layout id and the full panel state", () => {
    const state = createLayoutState(definition);

    expect(toPreferences(definition.id, state)).toEqual({
      version: LAYOUT_PREFERENCES_VERSION,
      layoutId: "acme.classic",
      panels: [
        { panelId: "palette", region: "left", visible: true, size: 240 },
        { panelId: "properties", region: "right", visible: true, size: 300 },
      ],
    });
  });
});

describe("serializePreferences and deserializePreferences", () => {
  it("round-trips preferences through json", () => {
    const state = createLayoutState(definition);
    const preferences = toPreferences(definition.id, state);

    const parsed = deserializePreferences(serializePreferences(preferences));

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value).toEqual(preferences);
    expect(applyPreferences(preferences, definition).state).toEqual(state);
  });

  it("rejects an unsupported preferences version", () => {
    const result = deserializePreferences({ version: 2, layoutId: "acme.classic", panels: [] });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("unsupported-version");
    expect(!result.ok && result.error.message).toBe(
      'layout preferences version 2 is not supported (expected 1)',
    );
  });

  it("rejects malformed input with a structural message", () => {
    expect(deserializePreferences("not json").ok).toBe(false);
    expect(deserializePreferences(42).ok).toBe(false);
    expect(deserializePreferences({ version: 1, layoutId: "", panels: [] }).ok).toBe(false);
    expect(deserializePreferences({ version: 1, layoutId: "acme.classic" }).ok).toBe(false);

    const badPanel = deserializePreferences({
      version: 1,
      layoutId: "acme.classic",
      panels: [{ panelId: "palette", region: "sideways", visible: true, size: 240 }],
    });
    expect(badPanel.ok).toBe(false);
    expect(!badPanel.ok && badPanel.error.kind).toBe("malformed");

    const badSize = deserializePreferences({
      version: 1,
      layoutId: "acme.classic",
      panels: [{ panelId: "palette", region: "left", visible: true, size: "big" }],
    });
    expect(badSize.ok).toBe(false);

    const badRect = deserializePreferences({
      version: 1,
      layoutId: "acme.classic",
      panels: [{ panelId: "search", region: "floating", visible: true, size: 200, rect: { x: 1 } }],
    });
    expect(badRect.ok).toBe(false);
  });
});

describe("applyPreferences", () => {
  it("applies saved regions, visibility and sizes onto the declared layout", () => {
    const preferences: LayoutPreferences = {
      version: LAYOUT_PREFERENCES_VERSION,
      layoutId: "acme.classic",
      panels: [
        {
          panelId: "palette",
          region: "floating",
          visible: false,
          size: 260,
          rect: { x: 40, y: 50, width: 260, height: 180 },
        },
      ],
    };

    const applied = applyPreferences(preferences, definition);

    expect(applied.state.panels[0]).toEqual({
      panelId: "palette",
      region: "floating",
      visible: false,
      size: 260,
      rect: { x: 40, y: 50, width: 260, height: 180 },
    });
    expect(applied.state.panels[1]).toEqual({
      panelId: "properties",
      region: "right",
      visible: true,
      size: 300,
    });
  });

  it("ignores preferences for panels the layout no longer declares", () => {
    const preferences: LayoutPreferences = {
      version: LAYOUT_PREFERENCES_VERSION,
      layoutId: "acme.classic",
      panels: [
        { panelId: "removed-panel", region: "left", visible: true, size: 200 },
        { panelId: "palette", region: "left", visible: true, size: 200 },
      ],
    };

    const applied = applyPreferences(preferences, definition);

    expect(applied.ignoredPanelIds).toEqual(["removed-panel"]);
    expect(applied.state.panels[0]?.size).toBe(200);
    expect(applied.state.panels).toHaveLength(2);
  });
});

describe("layout preference store", () => {
  it("saves the current layout and restores it later", () => {
    const store = createMemoryLayoutPreferenceStore();
    const state = createLayoutState(definition);
    saveLayoutPreferences(store, definition.id, state);

    const restored = restoreLayoutPreferences(store, definition);

    expect(restored.status).toBe("restored");
    expect(restored.state).toEqual(state);
  });

  it("reports a missing preference instead of inventing a layout", () => {
    const restored = restoreLayoutPreferences(createMemoryLayoutPreferenceStore(), definition);

    expect(restored.status).toBe("missing");
    expect(restored.state).toBeUndefined();
  });

  it("reports a malformed stored preference and keeps the declared layout", () => {
    const store = createMemoryLayoutPreferenceStore({ version: 7, layoutId: "acme.classic" });

    const restored = restoreLayoutPreferences(store, definition);

    expect(restored.status).toBe("malformed");
    expect(restored.state).toBeUndefined();
  });

  it("clear removes the stored preference", () => {
    const store = createMemoryLayoutPreferenceStore();
    saveLayoutPreferences(store, definition.id, createLayoutState(definition));

    store.clear();

    expect(restoreLayoutPreferences(store, definition).status).toBe("missing");
  });
});
