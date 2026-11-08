import type { CSSProperties } from "react";

/**
 * Shared token-driven styles of the structural shell components (D2).
 *
 * Every visual value reads a `--ndr-*` custom property with a fallback equal to
 * the built-in light theme, so the components render correctly with no
 * stylesheet and hosts can restyle them by overriding tokens (S3). Nothing here
 * is exported from the package entry point: it is internal style vocabulary,
 * not public API.
 */

/** Theme border shorthand used by region separators and panel chrome. */
export const BORDER =
  "var(--ndr-borders-width, 1px) solid var(--ndr-colors-border, #d8dee9)";

/** Theme radius of interactive surfaces. */
export const RADIUS = "var(--ndr-borders-radius-md, 5px)";

/** Theme small elevation, used by floating chrome. */
export const SHADOW_SM = "var(--ndr-shadows-sm, 0 1px 2px rgba(15, 23, 42, 0.08))";

/** Body text style every shell surface inherits from the theme. */
export const TEXT_STYLE: CSSProperties = {
  fontFamily: "var(--ndr-typography-font-family, system-ui)",
  fontSize: "var(--ndr-typography-font-size-md, 13px)",
  lineHeight: "var(--ndr-typography-line-height, 1.4)",
  color: "var(--ndr-colors-text, #111827)",
};

/** Secondary text style for subtitles and hints. */
export const MUTED_TEXT_STYLE: CSSProperties = {
  color: "var(--ndr-colors-text-muted, #5b6472)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
};

/** Surface background of panels and chrome bars. */
export const SURFACE_STYLE: CSSProperties = {
  background: "var(--ndr-colors-surface, #ffffff)",
  color: "var(--ndr-colors-text, #111827)",
};

/** Minimal button style hosts get before replacing the renderer. */
export const BUTTON_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "var(--ndr-icons-size-md, 16px)",
  minHeight: "var(--ndr-icons-size-md, 16px)",
  padding: "var(--ndr-spacing-xs, 2px) var(--ndr-spacing-sm, 4px)",
  border: BORDER,
  borderRadius: RADIUS,
  background: "transparent",
  color: "var(--ndr-colors-text-muted, #5b6472)",
  font: "inherit",
  lineHeight: 1,
  cursor: "pointer",
};
