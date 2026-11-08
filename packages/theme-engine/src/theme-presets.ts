import { createTheme, type ThemeDefinition } from "./theme.js";
import type { DesignTokens } from "./theme-tokens.js";

/** Stable id of the built-in light theme. */
export const DEFAULT_THEME_ID = "nodera.light";

/** Stable id of the built-in dark theme. */
export const DARK_THEME_ID = "nodera.dark";

const lightTokens: DesignTokens = {
  colors: {
    background: "#f8fafc",
    surface: "#ffffff",
    surfaceAlt: "#f1f5f9",
    border: "#d8dee9",
    borderStrong: "#94a3b8",
    text: "#111827",
    textMuted: "#5b6472",
    textInverse: "#ffffff",
    accent: "#2563eb",
    accentText: "#ffffff",
    accentMuted: "#93c5fd",
    danger: "#dc2626",
    warning: "#d97706",
    success: "#15803d",
    info: "#0284c7",
    focus: "#2563eb",
    overlay: "rgba(15, 23, 42, 0.35)",
  },
  spacing: {
    xs: "2px",
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    xxl: "24px",
  },
  typography: {
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontFamilyMono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
    fontSizeSm: "11px",
    fontSizeMd: "13px",
    fontSizeLg: "15px",
    fontWeightNormal: "400",
    fontWeightBold: "600",
    lineHeight: "1.4",
    letterSpacing: "0",
  },
  borders: {
    width: "1px",
    widthThick: "2px",
    style: "solid",
    radiusSm: "3px",
    radiusMd: "5px",
    radiusLg: "8px",
  },
  shadows: {
    sm: "0 1px 2px rgba(15, 23, 42, 0.08)",
    md: "0 2px 6px rgba(15, 23, 42, 0.12)",
    lg: "0 8px 24px rgba(15, 23, 42, 0.18)",
  },
  icons: {
    sizeSm: "12px",
    sizeMd: "16px",
    sizeLg: "20px",
    strokeWidth: "1.75",
  },
  node: {
    background: "#ffffff",
    backgroundSelected: "#eff6ff",
    borderColor: "#c7d2e0",
    borderColorSelected: "#2563eb",
    borderWidth: "1px",
    radius: "5px",
    padding: "8px",
    textColor: "#111827",
    textColorMuted: "#5b6472",
    fontSize: "13px",
    labelFontWeight: "600",
    minWidth: "140px",
  },
  edge: {
    strokeColor: "#7c8896",
    strokeColorSelected: "#2563eb",
    strokeWidth: "1.5",
    strokeWidthSelected: "2.5",
    labelColor: "#334155",
    labelFontSize: "11px",
    labelBackground: "#ffffff",
  },
  handle: {
    size: "8px",
    background: "#ffffff",
    borderColor: "#7c8896",
    borderWidth: "1.5px",
    radius: "50%",
  },
  selection: {
    outlineColor: "#2563eb",
    outlineWidth: "2px",
    outlineOffset: "1px",
    background: "rgba(37, 99, 235, 0.08)",
  },
  canvas: {
    background: "#f8fafc",
    backgroundDot: "#cbd5e1",
    gridColor: "rgba(148, 163, 184, 0.25)",
    gridSize: "16px",
  },
};

const darkTokens: DesignTokens = {
  ...lightTokens,
  colors: {
    background: "#111827",
    surface: "#1a2333",
    surfaceAlt: "#222d3f",
    border: "#2f3b4f",
    borderStrong: "#475569",
    text: "#e5e9f0",
    textMuted: "#94a3b8",
    textInverse: "#111827",
    accent: "#60a5fa",
    accentText: "#0b1220",
    accentMuted: "#1e3a8a",
    danger: "#f87171",
    warning: "#fbbf24",
    success: "#4ade80",
    info: "#38bdf8",
    focus: "#60a5fa",
    overlay: "rgba(2, 6, 16, 0.6)",
  },
  node: {
    ...lightTokens.node,
    background: "#1f2937",
    backgroundSelected: "#1e3a8a",
    borderColor: "#37465c",
    borderColorSelected: "#60a5fa",
    textColor: "#e5e9f0",
    textColorMuted: "#94a3b8",
  },
  edge: {
    ...lightTokens.edge,
    strokeColor: "#64748b",
    strokeColorSelected: "#60a5fa",
    labelColor: "#cbd5e1",
    labelBackground: "#1a2333",
  },
  handle: {
    ...lightTokens.handle,
    background: "#111827",
    borderColor: "#94a3b8",
  },
  selection: {
    outlineColor: "#60a5fa",
    outlineWidth: "2px",
    outlineOffset: "1px",
    background: "rgba(96, 165, 250, 0.14)",
  },
  canvas: {
    background: "#0f172a",
    backgroundDot: "#334155",
    gridColor: "rgba(71, 85, 105, 0.35)",
    gridSize: "16px",
  },
};

/** Built-in light theme (`nodera.light`). */
export const DEFAULT_THEME: ThemeDefinition = createTheme({
  id: DEFAULT_THEME_ID,
  name: "Nodera Light",
  description: "Default light theme for the Nodera editor shell.",
  colorScheme: "light",
  tokens: lightTokens,
});

/** Built-in dark theme (`nodera.dark`). */
export const DARK_THEME: ThemeDefinition = createTheme({
  id: DARK_THEME_ID,
  name: "Nodera Dark",
  description: "Dark counterpart of the default light theme.",
  colorScheme: "dark",
  tokens: darkTokens,
});
