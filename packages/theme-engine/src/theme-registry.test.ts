import { describe, expect, it } from "vitest";

import { ThemeRegistry } from "./theme-registry.js";
import { createTheme } from "./theme.js";
import { DEFAULT_THEME, DARK_THEME, DEFAULT_THEME_ID, DARK_THEME_ID } from "./theme-presets.js";

const acme = createTheme({
  id: "acme.brand",
  name: "Acme brand",
  tokens: DEFAULT_THEME.tokens,
});

describe("ThemeRegistry", () => {
  it("registers the built-in light and dark themes and defaults to light", () => {
    const registry = new ThemeRegistry();

    expect(registry.all().map((theme) => theme.id)).toEqual([DEFAULT_THEME_ID, DARK_THEME_ID]);
    expect(registry.getDefault().id).toBe(DEFAULT_THEME_ID);
    expect(registry.size).toBe(2);
  });

  it("accepts a host theme registry with its own themes and default", () => {
    const registry = new ThemeRegistry({ themes: [acme], defaultThemeId: "acme.brand" });

    expect(registry.all().map((theme) => theme.id)).toEqual(["acme.brand"]);
    expect(registry.getDefault().id).toBe("acme.brand");
  });

  it("rejects a duplicate theme id instead of overwriting silently", () => {
    const registry = new ThemeRegistry();

    const result = registry.register(DEFAULT_THEME);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("duplicate-id");
    expect(!result.ok && result.error.message).toBe(
      'theme-registry already contains a definition with id "nodera.light"',
    );
  });

  it("switches the default theme to a registered id and rejects an unknown one", () => {
    const registry = new ThemeRegistry();
    registry.register(acme);

    expect(registry.setDefault("acme.brand")).toEqual({ ok: true, value: acme });

    const rejected = registry.setDefault("acme.missing");
    expect(rejected.ok).toBe(false);
    expect(!rejected.ok && rejected.error.kind).toBe("not-found");
  });

  it("fails construction when the declared default theme is not part of the themes", () => {
    expect(() => new ThemeRegistry({ themes: [acme], defaultThemeId: "acme.missing" })).toThrowError(
      'theme-registry has no definition with id "acme.missing"',
    );
  });

  it("resolves a theme by id and reports missing themes", () => {
    const registry = new ThemeRegistry();

    expect(registry.get(DARK_THEME_ID)?.id).toBe(DARK_THEME_ID);
    expect(registry.has("acme.brand")).toBe(false);
    expect(registry.get("acme.brand")).toBeUndefined();
    expect(registry.require(DARK_THEME_ID).ok).toBe(true);
    expect(!registry.require("acme.missing").ok).toBe(true);
  });
});
