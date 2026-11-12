import { describe, expect, it } from "vitest";

import { DEFAULT_SHORTCUTS, type ShortcutMap } from "./shortcuts.js";

describe("DEFAULT_SHORTCUTS", () => {
  it("binds delete-selection to the Delete and Backspace keys", () => {
    expect(DEFAULT_SHORTCUTS["delete-selection"]).toEqual({
      key: ["Delete", "Backspace"],
      label: "Delete selected",
    });
  });

  it("binds close-overlay to the Escape key", () => {
    expect(DEFAULT_SHORTCUTS["close-overlay"]).toEqual({ key: "Escape", label: "Close" });
  });

  it("declares no modifier for either default", () => {
    expect(DEFAULT_SHORTCUTS["delete-selection"].modifiers).toBeUndefined();
    expect(DEFAULT_SHORTCUTS["close-overlay"].modifiers).toBeUndefined();
  });

  it("binds every action of the contract, and nothing else", () => {
    expect(Object.keys(DEFAULT_SHORTCUTS).sort()).toEqual(["close-overlay", "delete-selection"]);
  });

  it("is shared, immutable data", () => {
    expect(Object.isFrozen(DEFAULT_SHORTCUTS)).toBe(true);
  });

  it("accepts a host map that rebinds an action and adds modifiers", () => {
    const host: ShortcutMap = {
      "delete-selection": { key: "d", modifiers: ["ctrl"], label: "Borrar selección" },
      "close-overlay": DEFAULT_SHORTCUTS["close-overlay"],
    };

    expect(host["delete-selection"].key).toBe("d");
    expect(host["delete-selection"].modifiers).toEqual(["ctrl"]);
    expect(host["close-overlay"]).toBe(DEFAULT_SHORTCUTS["close-overlay"]);
  });
});
