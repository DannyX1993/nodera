import { describe, expect, it } from "vitest";

import { cssVariables } from "./theme-tokens.js";
import { DEFAULT_THEME, DEFAULT_THEME_ID, DARK_THEME, DARK_THEME_ID } from "./theme-presets.js";

describe("built-in themes", () => {
  it("expose stable ids and names", () => {
    expect(DEFAULT_THEME_ID).toBe("nodera.light");
    expect(DARK_THEME_ID).toBe("nodera.dark");
    expect(DEFAULT_THEME.id).toBe(DEFAULT_THEME_ID);
    expect(DARK_THEME.id).toBe(DARK_THEME_ID);
    expect(DEFAULT_THEME.colorScheme).toBe("light");
    expect(DARK_THEME.colorScheme).toBe("dark");
  });

  it("cover every customization group with canonical tokens", () => {
    const requiredKeys: Record<string, readonly string[]> = {
      colors: ["background", "surface", "surfaceAlt", "border", "text", "textMuted", "accent", "danger", "warning", "success", "info"],
      spacing: ["xs", "sm", "md", "lg", "xl"],
      typography: ["fontFamily", "fontFamilyMono", "fontSizeSm", "fontSizeMd", "fontSizeLg", "fontWeightNormal", "fontWeightBold", "lineHeight"],
      borders: ["width", "style", "radiusSm", "radiusMd", "radiusLg"],
      shadows: ["sm", "md", "lg"],
      icons: ["sizeSm", "sizeMd", "sizeLg", "strokeWidth"],
      node: ["background", "backgroundSelected", "borderColor", "borderColorSelected", "borderWidth", "radius", "padding", "textColor", "textColorMuted"],
      edge: ["strokeColor", "strokeColorSelected", "strokeWidth", "strokeWidthSelected", "labelColor", "labelFontSize"],
      handle: ["size", "background", "borderColor", "borderWidth", "radius"],
      selection: ["outlineColor", "outlineWidth", "outlineOffset", "background"],
      canvas: ["background", "backgroundDot", "backgroundDotSize"],
    };

    for (const [group, keys] of Object.entries(requiredKeys)) {
      for (const key of keys) {
        const value = (DEFAULT_THEME.tokens as unknown as Record<string, Record<string, string>>)[group]?.[key];
        expect(value, `missing ${group}.${key} in the default theme`).toBeTruthy();
      }
    }
  });

  it("declare the canvas dot grid with a numeric gap token and no dead grid tokens", () => {
    // `canvas.backgroundDot` + `canvas.backgroundDotSize` are the ONLY canvas
    // pattern tokens a consumer can honour: the canvas adapter paints React
    // Flow's `<Background />` with the dot colour and a numeric gap. The old
    // `gridColor`/`gridSize` tokens had no consumer (theme contract drift), so
    // they must not come back without one.
    for (const theme of [DEFAULT_THEME, DARK_THEME]) {
      expect(theme.tokens.canvas.backgroundDotSize).toMatch(/^\d+$/);
      expect(theme.tokens.canvas.gridColor).toBeUndefined();
      expect(theme.tokens.canvas.gridSize).toBeUndefined();
    }
    expect(DEFAULT_THEME.tokens.canvas.backgroundDotSize).toBe("16");
    expect(DARK_THEME.tokens.canvas.backgroundDotSize).toBe("16");
  });

  it("produce a light and a dark variant that actually differ in background", () => {
    expect(DEFAULT_THEME.tokens.colors.background).not.toBe(DARK_THEME.tokens.colors.background);
    expect(cssVariables(DEFAULT_THEME.tokens)["--ndr-colors-background"]).toBe(
      DEFAULT_THEME.tokens.colors.background,
    );
    expect(cssVariables(DARK_THEME.tokens)["--ndr-colors-background"]).toBe(
      DARK_THEME.tokens.colors.background,
    );
  });

  it("are frozen so the shared presets cannot be mutated by a host", () => {
    expect(Object.isFrozen(DEFAULT_THEME)).toBe(true);
    expect(Object.isFrozen(DEFAULT_THEME.tokens.node)).toBe(true);
  });
});
