import { describe, expect, it } from "vitest";

import {
  THEME_TOKEN_GROUPS,
  cssVariables,
  mergeDesignTokens,
  tokenVariableName,
  type DesignTokens,
} from "./theme-tokens.js";

/** Smallest valid token set: every group present, one canonical key each. */
function tokensWith(overrides: Partial<Record<string, Record<string, string>>> = {}): DesignTokens {
  const base: Record<string, Record<string, string>> = {
    colors: { background: "#ffffff" },
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
  return { ...base, ...overrides } as unknown as DesignTokens;
}

describe("theme token groups", () => {
  it("exposes the eleven customization groups required by the UI customization module", () => {
    expect([...THEME_TOKEN_GROUPS]).toEqual([
      "colors",
      "spacing",
      "typography",
      "borders",
      "shadows",
      "icons",
      "node",
      "edge",
      "handle",
      "selection",
      "canvas",
    ]);
  });
});

describe("tokenVariableName", () => {
  it("builds a prefixed css custom property from a group and a kebab-cased token key", () => {
    expect(tokenVariableName("colors", "background")).toBe("--ndr-colors-background");
    expect(tokenVariableName("colors", "surfaceAlt")).toBe("--ndr-colors-surface-alt");
    expect(tokenVariableName("node", "borderColorSelected")).toBe("--ndr-node-border-color-selected");
  });

  it("rejects an empty group or key instead of producing a malformed variable", () => {
    expect(() => tokenVariableName("colors", "")).toThrowError('token key must not be empty');
    expect(() => tokenVariableName("", "background")).toThrowError('token group must not be empty');
  });
});

describe("cssVariables", () => {
  it("flattens every group into css custom properties in declaration order", () => {
    const variables = cssVariables(tokensWith());

    expect(variables["--ndr-colors-background"]).toBe("#ffffff");
    expect(variables["--ndr-spacing-sm"]).toBe("4px");
    expect(variables["--ndr-typography-font-family"]).toBe("sans-serif");
    expect(variables["--ndr-borders-width"]).toBe("1px");
    expect(variables["--ndr-shadows-sm"]).toBe("0 1px 2px rgba(0,0,0,0.1)");
    expect(variables["--ndr-icons-size"]).toBe("16px");
    expect(variables["--ndr-node-background"]).toBe("#ffffff");
    expect(variables["--ndr-edge-stroke"]).toBe("#333333");
    expect(variables["--ndr-handle-background"]).toBe("#333333");
    expect(variables["--ndr-selection-outline"]).toBe("#2563eb");
    expect(variables["--ndr-canvas-background"]).toBe("#f8fafc");
  });

  it("emits one variable per declared token, with no extra entries", () => {
    const variables = cssVariables(tokensWith());

    expect(Object.keys(variables)).toHaveLength(THEME_TOKEN_GROUPS.length);
    expect(Object.keys(variables) as string[]).toEqual([
      "--ndr-colors-background",
      "--ndr-spacing-sm",
      "--ndr-typography-font-family",
      "--ndr-borders-width",
      "--ndr-shadows-sm",
      "--ndr-icons-size",
      "--ndr-node-background",
      "--ndr-edge-stroke",
      "--ndr-handle-background",
      "--ndr-selection-outline",
      "--ndr-canvas-background",
    ]);
  });

  it("keeps custom token keys a host adds to any group", () => {
    const variables = cssVariables(
      tokensWith({ colors: { background: "#ffffff", brandPrimary: "rebeccapurple" } }),
    );

    expect(variables["--ndr-colors-brand-primary"]).toBe("rebeccapurple");
  });
});

describe("mergeDesignTokens", () => {
  it("overrides only the patched keys and preserves the rest of the theme", () => {
    const merged = mergeDesignTokens(tokensWith(), {
      colors: { background: "#000000" },
      node: { radius: "8px" },
    });

    expect(merged.colors.background).toBe("#000000");
    expect(merged.node.radius).toBe("8px");
    expect(merged.node.background).toBe("#ffffff");
    expect(merged.spacing.sm).toBe("4px");
  });

  it("does not mutate the base tokens", () => {
    const base = tokensWith();
    mergeDesignTokens(base, { colors: { background: "#000000" } });

    expect(base.colors.background).toBe("#ffffff");
  });

  it("keeps groups the patch does not mention identical to the base", () => {
    const base = tokensWith();
    const merged = mergeDesignTokens(base, { icons: { size: "20px" } });

    expect(merged.node).toBe(base.node);
    expect(merged.icons.size).toBe("20px");
    expect(merged.icons).not.toBe(base.icons);
  });
});
