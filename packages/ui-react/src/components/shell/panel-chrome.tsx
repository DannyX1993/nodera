import type { CSSProperties, ReactNode } from "react";

import {
  BUTTON_STYLE,
  BORDER,
  SURFACE_STYLE,
  TEXT_STYLE,
} from "./styles.js";

/** Props accepted by {@link PanelChrome}. */
export interface PanelChromeProps {
  /** Stable panel id the chrome belongs to. */
  readonly panelId: string;
  readonly title: string;
  /** Whether the panel may be hidden. Requires `onHide` to render the action. */
  readonly hideable?: boolean;
  readonly onHide?: () => void;
  /** Host-provided actions rendered next to the title. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

const PANEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  ...SURFACE_STYLE,
  ...TEXT_STYLE,
};

const CHROME_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-sm, 4px)",
  flexShrink: 0,
  padding: "var(--ndr-spacing-sm, 4px) var(--ndr-spacing-md, 8px)",
  borderBottom: BORDER,
  background: "var(--ndr-colors-surface-alt, #f1f5f9)",
};

const TITLE_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: "var(--ndr-typography-font-weight-bold, 600)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  letterSpacing: "var(--ndr-typography-letter-spacing, 0)",
  textTransform: "uppercase",
};

const ACTIONS_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-xs, 2px)",
};

const BODY_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
  padding: "var(--ndr-spacing-sm, 4px) var(--ndr-spacing-md, 8px)",
};

/**
 * Chrome of a panel: title bar, host actions and an optional hide action.
 *
 * The chrome never decides whether a panel is visible: it reports the host's
 * hide intent and the layout engine owns visibility (D9). The hide action only
 * appears when the panel is hideable *and* the host wired a handler.
 */
export function PanelChrome(props: PanelChromeProps): ReactNode {
  const onHide = props.onHide;
  const showHide = props.hideable === true && onHide !== undefined;

  return (
    <section data-nodera-panel-id={props.panelId} style={PANEL_STYLE}>
      <header data-nodera-panel-chrome="" style={CHROME_STYLE}>
        <span data-nodera-panel-title="" style={TITLE_STYLE}>
          {props.title}
        </span>
        {props.actions === undefined || props.actions === null ? null : (
          <span data-nodera-panel-actions="" style={ACTIONS_STYLE}>
            {props.actions}
          </span>
        )}
        {showHide ? (
          <button
            type="button"
            aria-label={`Hide ${props.title}`}
            onClick={onHide}
            style={BUTTON_STYLE}
          >
            ×
          </button>
        ) : null}
      </header>
      <div data-nodera-panel-body="" style={BODY_STYLE}>
        {props.children}
      </div>
    </section>
  );
}
