/**
 * Theme contribution of the Phase 6 demo.
 *
 * A theme is declarative token data: the SDK registers it, the React binding
 * projects the tokens into CSS custom properties on its themed wrapper, and
 * every surface of the editor (shell, panels, canvas nodes, edges and handles)
 * reads them. Authoring a theme therefore needs no framework code — the host
 * only describes values.
 *
 * The demo registers `demo.theme.copper-dusk` next to the built-in themes the
 * theme registry always has, and the header control applies either of them with
 * `builder.theme.setDefault(...)`.
 */

import type { Builder } from "@nodera/sdk";

/**
 * Input accepted by `builder.theme.register`.
 *
 * Derived from the public API instead of importing the theme-engine package:
 * the SDK does not re-export the concrete `CreateThemeInput` type, so the demo
 * names the parameter type of the method it calls.
 */
export type DemoThemeInput = Parameters<Builder["theme"]["register"]>[0];

/** Id of the theme this host contributes. */
export const DEMO_THEME_ID = "demo.theme.copper-dusk";

/** Id of the built-in default theme, the alternative the demo switches back to. */
export const BUILT_IN_THEME_ID = "nodera.light";

/** Warm dark theme: copper accents on graphite surfaces. */
export const DEMO_THEME: DemoThemeInput = {
  id: DEMO_THEME_ID,
  name: "Copper Dusk",
  description: "Host theme of the Phase 6 demo: graphite surfaces with copper accents.",
  colorScheme: "dark",
  tokens: {
    colors: {
      background: "#14100d",
      surface: "#1d1815",
      surfaceAlt: "#272020",
      border: "#3a3130",
      borderStrong: "#5c4d47",
      text: "#f4ece6",
      textMuted: "#b3a49b",
      textInverse: "#14100d",
      accent: "#f0a15a",
      accentText: "#1a1208",
      accentMuted: "#7c4a22",
      danger: "#f27a72",
      warning: "#f6c661",
      success: "#8fd694",
      info: "#7fc8de",
      focus: "#f0a15a",
      overlay: "rgba(10, 8, 7, 0.62)",
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
      fontFamily: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
      fontFamilyMono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
      fontSizeSm: "11px",
      fontSizeMd: "13px",
      fontSizeLg: "15px",
      fontWeightNormal: "400",
      fontWeightBold: "700",
      lineHeight: "1.45",
      letterSpacing: "0.01em",
    },
    borders: {
      width: "1px",
      widthThick: "2px",
      style: "solid",
      radiusSm: "3px",
      radiusMd: "6px",
      radiusLg: "10px",
    },
    shadows: {
      sm: "0 1px 2px rgba(8, 6, 5, 0.35)",
      md: "0 2px 8px rgba(8, 6, 5, 0.4)",
      lg: "0 10px 28px rgba(8, 6, 5, 0.5)",
    },
    icons: {
      sizeSm: "12px",
      sizeMd: "16px",
      sizeLg: "20px",
      strokeWidth: "1.75",
    },
    node: {
      background: "#211b18",
      backgroundSelected: "#3a2415",
      borderColor: "#463b37",
      borderColorSelected: "#f0a15a",
      borderWidth: "1px",
      radius: "6px",
      padding: "8px",
      textColor: "#f4ece6",
      textColorMuted: "#b3a49b",
      fontSize: "13px",
      labelFontWeight: "700",
      minWidth: "150px",
    },
    edge: {
      strokeColor: "#a3826d",
      strokeColorSelected: "#f0a15a",
      strokeWidth: "1.5",
      strokeWidthSelected: "2.5",
      labelColor: "#e6d8cd",
      labelFontSize: "11px",
      labelBackground: "#1d1815",
    },
    handle: {
      size: "8px",
      background: "#14100d",
      borderColor: "#c99a72",
      borderWidth: "1.5px",
      radius: "50%",
    },
    selection: {
      outlineColor: "#f0a15a",
      outlineWidth: "2px",
      outlineOffset: "1px",
      background: "rgba(240, 161, 90, 0.14)",
    },
    canvas: {
      background: "#100d0b",
      backgroundDot: "#3d332d",
      backgroundDotSize: "16",
    },
  },
};
