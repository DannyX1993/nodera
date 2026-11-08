import { describe, expect, it } from "vitest";

import { createTheme, themeToCssVariables } from "./theme.js";
import type { DesignTokens } from "./theme-tokens.js";

const tokens: DesignTokens = {
  colors: { background: "#ffffff", text: "#111827" },
  spacing: { sm: "4px" },
  typography: { fontFamily: "sans-serif" },
  borders: { width: "1px" },
  shadows: { sm: "0 1px 2px rgba(0,0,0,0.1)" },
  icons: { size: "16px" },
  node: { background: "#ffffff" },
  edge: { stroke: "#333333" },
  handle: { background: "#333333" },
  selection: { outline: "#2563eb" },
  canvas: { background: "#f8fafc" },
};

describe("createTheme", () => {
  it("builds a theme definition from declarative tokens", () => {
    const theme = createTheme({
      id: "acme.brand",
      name: "Acme brand",
      colorScheme: "dark",
      tokens,
    });

    expect(theme.id).toBe("acme.brand");
    expect(theme.name).toBe("Acme brand");
    expect(theme.colorScheme).toBe("dark");
    expect(theme.tokens.colors.background).toBe("#ffffff");
  });

  it("freezes the theme and its tokens so registries cannot be mutated from outside", () => {
    const theme = createTheme({ id: "acme.brand", name: "Acme brand", tokens });

    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.tokens)).toBe(true);
    expect(Object.isFrozen(theme.tokens.colors)).toBe(true);
  });

  it("rejects an empty id or name", () => {
    expect(() => createTheme({ id: "", name: "Acme brand", tokens })).toThrowError(
      "theme id must not be empty",
    );
    expect(() => createTheme({ id: "acme.brand", name: "", tokens })).toThrowError(
      "theme name must not be empty",
    );
  });
});

describe("themeToCssVariables", () => {
  it("projects a theme into the css variables a host applies to the UI root", () => {
    const theme = createTheme({ id: "acme.brand", name: "Acme brand", tokens });

    expect(themeToCssVariables(theme)).toEqual({
      "--ndr-colors-background": "#ffffff",
      "--ndr-colors-text": "#111827",
      "--ndr-spacing-sm": "4px",
      "--ndr-typography-font-family": "sans-serif",
      "--ndr-borders-width": "1px",
      "--ndr-shadows-sm": "0 1px 2px rgba(0,0,0,0.1)",
      "--ndr-icons-size": "16px",
      "--ndr-node-background": "#ffffff",
      "--ndr-edge-stroke": "#333333",
      "--ndr-handle-background": "#333333",
      "--ndr-selection-outline": "#2563eb",
      "--ndr-canvas-background": "#f8fafc",
    });
  });
});
