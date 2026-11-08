import type { CSSProperties, ReactNode } from "react";

import { MUTED_TEXT_STYLE, SURFACE_STYLE, TEXT_STYLE } from "./styles.js";

/** Props accepted by {@link Footer}. */
export interface FooterProps {
  readonly children?: ReactNode;
  /** Host actions rendered at the trailing edge of the footer. */
  readonly actions?: ReactNode;
}

const FOOTER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-md, 8px)",
  flex: 1,
  minWidth: 0,
  height: "100%",
  padding: "0 var(--ndr-spacing-md, 8px)",
  ...SURFACE_STYLE,
  ...MUTED_TEXT_STYLE,
};

const CONTENT_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-sm, 4px)",
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  ...TEXT_STYLE,
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
};

const ACTIONS_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-sm, 4px)",
};

/** Footer region content: status text and host actions. */
export function Footer(props: FooterProps): ReactNode {
  return (
    <div data-nodera-region-content="footer" style={FOOTER_STYLE}>
      {props.children === undefined || props.children === null ? null : (
        <div style={CONTENT_STYLE}>{props.children}</div>
      )}
      {props.actions === undefined || props.actions === null ? null : (
        <div data-nodera-footer-actions="" style={ACTIONS_STYLE}>
          {props.actions}
        </div>
      )}
    </div>
  );
}
