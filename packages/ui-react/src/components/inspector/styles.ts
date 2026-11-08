import type { CSSProperties } from "react";

/**
 * Token-driven styles of the inspector surfaces (D2).
 *
 * Every visual value reads a `--ndr-*` custom property with the built-in light
 * theme as fallback, so the panels render correctly without a stylesheet and a
 * host can restyle them by overriding tokens (S3). Internal vocabulary only: it
 * is not part of the package public surface.
 */

export const FIELD_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
  minWidth: 0,
};

export const LABEL_STYLE: CSSProperties = {
  color: "var(--ndr-colors-text-muted, #5b6472)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  fontWeight: "var(--ndr-typography-font-weight-bold, 600)",
};

export const HINT_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--ndr-colors-text-muted, #5b6472)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
};

export const CONTROL_STYLE: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "var(--ndr-spacing-xs, 2px) var(--ndr-spacing-sm, 4px)",
  border: "var(--ndr-borders-width, 1px) solid var(--ndr-colors-border, #d8dee9)",
  borderRadius: "var(--ndr-borders-radius-md, 5px)",
  background: "var(--ndr-colors-surface, #ffffff)",
  color: "var(--ndr-colors-text, #111827)",
  fontFamily: "var(--ndr-typography-font-family, system-ui)",
  fontSize: "var(--ndr-typography-font-size-md, 13px)",
};

export const MONOSPACE_CONTROL_STYLE: CSSProperties = {
  ...CONTROL_STYLE,
  minHeight: "calc(var(--ndr-spacing-lg, 16px) * 3)",
  fontFamily:
    "var(--ndr-typography-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  resize: "vertical",
};

export const CHECKBOX_STYLE: CSSProperties = {
  margin: 0,
  accentColor: "var(--ndr-colors-accent, #2563eb)",
};

export const OPTION_LIST_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
};

export const OPTION_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-sm, 4px)",
  ...LABEL_STYLE,
  fontWeight: "var(--ndr-typography-font-weight-normal, 400)",
  color: "var(--ndr-colors-text, #111827)",
};

export const ISSUE_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--ndr-colors-danger, #b91c1c)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
};

export const PANEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-sm, 4px)",
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
  padding: "var(--ndr-spacing-sm, 4px)",
  background: "var(--ndr-colors-surface, #ffffff)",
  color: "var(--ndr-colors-text, #111827)",
  fontFamily: "var(--ndr-typography-font-family, system-ui)",
  fontSize: "var(--ndr-typography-font-size-md, 13px)",
};

export const HEADING_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--ndr-colors-text-muted, #5b6472)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  fontWeight: "var(--ndr-typography-font-weight-bold, 600)",
  textTransform: "uppercase",
};

export const SECTION_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-sm, 4px)",
  minWidth: 0,
};

export const MUTED_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--ndr-colors-text-muted, #5b6472)",
};

export const RAW_STYLE: CSSProperties = {
  margin: 0,
  padding: "var(--ndr-spacing-sm, 4px)",
  overflow: "auto",
  border: "var(--ndr-borders-width, 1px) solid var(--ndr-colors-border, #d8dee9)",
  borderRadius: "var(--ndr-borders-radius-md, 5px)",
  background: "var(--ndr-colors-surface-alt, #f8fafc)",
  fontFamily:
    "var(--ndr-typography-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
};

export const ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 40%) minmax(0, 1fr)",
  gap: "var(--ndr-spacing-sm, 4px)",
};

export const ROW_LABEL_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--ndr-colors-text-muted, #5b6472)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
};

export const ROW_VALUE_STYLE: CSSProperties = {
  margin: 0,
  overflowWrap: "anywhere",
};

export const LIST_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
  margin: 0,
  padding: 0,
  listStyle: "none",
};
