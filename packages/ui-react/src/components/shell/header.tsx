import type { CSSProperties, ReactNode } from "react";

import { BORDER, MUTED_TEXT_STYLE, SURFACE_STYLE, TEXT_STYLE } from "./styles.js";

/** Props accepted by {@link Header}. */
export interface HeaderProps {
  readonly title?: string;
  readonly subtitle?: string;
  readonly children?: ReactNode;
  /** Host actions rendered at the trailing edge of the header. */
  readonly actions?: ReactNode;
}

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-md, 8px)",
  flex: 1,
  minWidth: 0,
  height: "100%",
  padding: "0 var(--ndr-spacing-md, 8px)",
  ...SURFACE_STYLE,
  ...TEXT_STYLE,
};

const TITLE_STYLE: CSSProperties = {
  fontWeight: "var(--ndr-typography-font-weight-bold, 600)",
  fontSize: "var(--ndr-typography-font-size-lg, 15px)",
  whiteSpace: "nowrap",
};

const SUBTITLE_STYLE: CSSProperties = {
  ...MUTED_TEXT_STYLE,
  borderLeft: BORDER,
  paddingLeft: "var(--ndr-spacing-md, 8px)",
  whiteSpace: "nowrap",
};

const CONTENT_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-sm, 4px)",
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
};

const ACTIONS_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-sm, 4px)",
};

/**
 * Header region content: title, subtitle, host content and actions.
 *
 * It is a content component, not a shell region: the host decides whether it
 * renders it at all, and where (S2).
 */
export function Header(props: HeaderProps): ReactNode {
  return (
    <div data-nodera-region-content="header" style={HEADER_STYLE}>
      {props.title === undefined ? null : (
        <span data-nodera-header-title="" style={TITLE_STYLE}>
          {props.title}
        </span>
      )}
      {props.subtitle === undefined ? null : (
        <span data-nodera-header-subtitle="" style={SUBTITLE_STYLE}>
          {props.subtitle}
        </span>
      )}
      {props.children === undefined || props.children === null ? null : (
        <div style={CONTENT_STYLE}>{props.children}</div>
      )}
      {props.actions === undefined || props.actions === null ? null : (
        <div data-nodera-header-actions="" style={ACTIONS_STYLE}>
          {props.actions}
        </div>
      )}
    </div>
  );
}
