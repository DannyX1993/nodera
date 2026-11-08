import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { DockRegion, LayoutState } from "@nodera/ui-core";

import { useUiState } from "../../providers/ui-provider.js";
import { computeShellSizes } from "./shell-sizes.js";
import { BORDER, TEXT_STYLE } from "./styles.js";

/** Content the host places into the shell regions. Only `canvas` is required. */
export interface EditorShellSlots {
  readonly canvas: ReactNode;
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly left?: ReactNode;
  readonly right?: ReactNode;
  readonly bottom?: ReactNode;
  /** Floating panels; rendered in an absolute overlay above the docked regions. */
  readonly floating?: ReactNode;
}

/** Props accepted by {@link EditorShell}. */
export interface EditorShellProps {
  readonly slots: EditorShellSlots;
  readonly className?: string;
  /**
   * Enables the region splitters. The shell reports the requested edge size and
   * the host decides what to do with it (persist it, resize a panel, ignore it).
   */
  readonly onResizeRegion?: (region: DockRegion, size: number) => void;
}

/** Thickness of a region splitter, in pixels. */
const SPLITTER_SIZE = 4;

const SHELL_STYLE: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  background: "var(--ndr-colors-background, #f8fafc)",
  ...TEXT_STYLE,
};

const MAIN_STYLE: CSSProperties = {
  display: "flex",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  alignItems: "stretch",
};

const CENTER_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
};

const CANVAS_STYLE: CSSProperties = {
  position: "relative",
  display: "flex",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
};

const FLOATING_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 10,
  /*
   * The overlay only positions floating panels: it must not swallow canvas
   * pointers, so floating content opts into pointer events itself.
   */
  pointerEvents: "none",
};

const VERTICAL_SPLITTER_STYLE: CSSProperties = {
  flexShrink: 0,
  alignSelf: "stretch",
  width: `${SPLITTER_SIZE}px`,
  cursor: "col-resize",
  background: "var(--ndr-colors-border, #d8dee9)",
  touchAction: "none",
  userSelect: "none",
};

const HORIZONTAL_SPLITTER_STYLE: CSSProperties = {
  flexShrink: 0,
  width: "100%",
  height: `${SPLITTER_SIZE}px`,
  cursor: "row-resize",
  background: "var(--ndr-colors-border, #d8dee9)",
  touchAction: "none",
  userSelect: "none",
};

function barStyle(size: number, edge: "top" | "bottom"): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    width: "100%",
    ...(size > 0 ? { height: `${size}px` } : {}),
    overflow: "hidden",
    ...(edge === "bottom" ? { borderBottom: BORDER } : { borderTop: BORDER }),
  };
}

function sideStyle(size: number, edge: "left" | "right"): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    minWidth: 0,
    overflow: "hidden",
    ...(size > 0 ? { width: `${size}px` } : {}),
    ...(edge === "right" ? { borderLeft: BORDER } : { borderRight: BORDER }),
  };
}

/** A region is rendered when a layout is not applied yet, or when it places a visible panel there. */
function regionIsPlaced(layout: LayoutState | undefined, region: DockRegion): boolean {
  if (layout === undefined) {
    return true;
  }
  return layout.panels.some((panel) => panel.region === region && panel.visible);
}

function isPresent(node: ReactNode | undefined): boolean {
  return node !== undefined && node !== null;
}

/**
 * Structural composition of the editor surface (S2, D9).
 *
 * The shell only arranges what the host gives it: the canvas region is required,
 * every other region disappears when its slot is absent or when the applied
 * layout does not place a visible panel there. It never selects a layout, never
 * injects panels and never owns graph state; a host that wants a completely
 * different composition can skip this component and place the panels itself.
 */
export function EditorShell(props: EditorShellProps): ReactNode {
  const layout = useUiState().layout;
  const sizes = computeShellSizes(layout);
  const onResizeRegion = props.onResizeRegion;
  const slots = props.slots;

  const visible = {
    header: isPresent(slots.header) && regionIsPlaced(layout, "header"),
    footer: isPresent(slots.footer) && regionIsPlaced(layout, "footer"),
    left: isPresent(slots.left) && regionIsPlaced(layout, "left"),
    right: isPresent(slots.right) && regionIsPlaced(layout, "right"),
    bottom: isPresent(slots.bottom) && regionIsPlaced(layout, "bottom"),
    floating: isPresent(slots.floating),
  } as const;

  const startResize = (region: DockRegion, event: ReactPointerEvent<HTMLDivElement>): void => {
    if (onResizeRegion === undefined) {
      return;
    }
    const horizontal = region === "left" || region === "right";
    const start = horizontal ? event.clientX : event.clientY;
    const startSize = sizes[region];
    // Growing a region moves its edge towards the canvas: right/bottom/footer
    // grow while the pointer moves towards the origin, left and header away.
    const sign = region === "left" || region === "header" ? 1 : -1;
    const doc = event.currentTarget.ownerDocument;

    const onMove = (moveEvent: PointerEvent): void => {
      const current = horizontal ? moveEvent.clientX : moveEvent.clientY;
      if (!Number.isFinite(current) || !Number.isFinite(start)) {
        return;
      }
      onResizeRegion(region, Math.max(0, startSize + sign * (current - start)));
    };
    const onEnd = (): void => {
      doc.removeEventListener("pointermove", onMove);
      doc.removeEventListener("pointerup", onEnd);
    };

    doc.addEventListener("pointermove", onMove);
    doc.addEventListener("pointerup", onEnd);
    event.preventDefault();
  };

  const splitter = (region: DockRegion): ReactNode => {
    if (onResizeRegion === undefined) {
      return null;
    }
    const vertical = region === "left" || region === "right";
    return (
      <div
        data-nodera-splitter={region}
        role="separator"
        aria-orientation={vertical ? "vertical" : "horizontal"}
        style={vertical ? VERTICAL_SPLITTER_STYLE : HORIZONTAL_SPLITTER_STYLE}
        onPointerDown={(event) => startResize(region, event)}
      />
    );
  };

  return (
    <div
      data-nodera-shell=""
      {...(props.className === undefined ? {} : { className: props.className })}
      style={SHELL_STYLE}
    >
      {visible.header ? (
        <div data-nodera-region="header" style={barStyle(sizes.header, "bottom")}>
          {slots.header}
        </div>
      ) : null}
      {visible.header ? splitter("header") : null}

      <div style={MAIN_STYLE}>
        {visible.left ? (
          <div data-nodera-region="left" style={sideStyle(sizes.left, "left")}>
            {slots.left}
          </div>
        ) : null}
        {visible.left ? splitter("left") : null}

        <div style={CENTER_STYLE}>
          <div data-nodera-region="canvas" style={CANVAS_STYLE}>
            {slots.canvas}
          </div>
          {visible.bottom ? splitter("bottom") : null}
          {visible.bottom ? (
            <div data-nodera-region="bottom" style={barStyle(sizes.bottom, "top")}>
              {slots.bottom}
            </div>
          ) : null}
        </div>

        {visible.right ? splitter("right") : null}
        {visible.right ? (
          <div data-nodera-region="right" style={sideStyle(sizes.right, "right")}>
            {slots.right}
          </div>
        ) : null}
      </div>

      {visible.footer ? splitter("footer") : null}
      {visible.footer ? (
        <div data-nodera-region="footer" style={barStyle(sizes.footer, "top")}>
          {slots.footer}
        </div>
      ) : null}

      {visible.floating ? (
        <div data-nodera-region="floating" style={FLOATING_STYLE}>
          {slots.floating}
        </div>
      ) : null}
    </div>
  );
}
