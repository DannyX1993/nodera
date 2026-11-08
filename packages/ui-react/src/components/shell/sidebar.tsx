import type { CSSProperties, ReactNode } from "react";

import { BUTTON_STYLE, BORDER, SURFACE_STYLE, TEXT_STYLE } from "./styles.js";

/** Props accepted by {@link Sidebar}. */
export interface SidebarProps {
  readonly children: ReactNode;
  readonly title?: string;
  /** Offers a collapse toggle. Requires `onToggle` to render the button. */
  readonly collapsible?: boolean;
  /** Whether the sidebar is collapsed. Collapsed sidebars render the title bar only. */
  readonly collapsed?: boolean;
  readonly onToggle?: () => void;
  readonly className?: string;
}

const SIDEBAR_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  height: "100%",
  overflow: "hidden",
  ...SURFACE_STYLE,
  ...TEXT_STYLE,
};

const TITLE_BAR_STYLE: CSSProperties = {
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
  textTransform: "uppercase",
};

const CONTENT_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
};

/**
 * Collapsible sidebar surface.
 *
 * The sidebar owns no state: `collapsed`/`onToggle` come from the host (or from
 * UI state the host subscribed to), so the same component can be a palette, a
 * navigator or anything else.
 */
export function Sidebar(props: SidebarProps): ReactNode {
  const collapsed = props.collapsed === true;
  const onToggle = props.onToggle;
  const showToggle = props.collapsible === true && onToggle !== undefined;
  const hasTitleBar = props.title !== undefined || showToggle;

  return (
    <aside
      data-nodera-sidebar=""
      data-nodera-collapsed={collapsed ? "true" : "false"}
      {...(props.className === undefined ? {} : { className: props.className })}
      style={SIDEBAR_STYLE}
    >
      {hasTitleBar ? (
        <div data-nodera-sidebar-title-bar="" style={TITLE_BAR_STYLE}>
          {props.title === undefined ? null : (
            <span data-nodera-sidebar-title="" style={TITLE_STYLE}>
              {props.title}
            </span>
          )}
          {showToggle ? (
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-label={
                props.title === undefined ? "Toggle sidebar" : `Toggle ${props.title}`
              }
              onClick={onToggle}
              style={BUTTON_STYLE}
            >
              <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {collapsed ? null : (
        <div data-nodera-sidebar-content="" style={CONTENT_STYLE}>
          {props.children}
        </div>
      )}
    </aside>
  );
}
