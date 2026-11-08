import type { CSSProperties, ReactNode } from "react";

/** Props accepted by {@link CanvasContainer}. */
export interface CanvasContainerProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Floating overlays (minimap, toolbars, menus) painted above the canvas. */
  readonly overlays?: ReactNode;
}

const CONTAINER_STYLE: CSSProperties = {
  position: "relative",
  display: "flex",
  flex: 1,
  width: "100%",
  height: "100%",
  minWidth: 0,
  minHeight: 0,
  overflow: "hidden",
  background: "var(--ndr-canvas-background, #f8fafc)",
};

const CONTENT_STYLE: CSSProperties = {
  position: "relative",
  display: "flex",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
};

const OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 1,
  /*
   * Overlays must not intercept canvas pointers; overlay content opts into
   * pointer events itself (`PanelChrome` and `ContextMenu` do). The layer sits
   * at `z-index: 1` inside the host's stacking context, so a host that mounts
   * its own chrome as a later sibling with a higher stacking order must raise
   * the shell's z-index instead of expecting overlays to float above it.
   */
  pointerEvents: "none",
};

/**
 * Canvas region of the shell.
 *
 * It is a plain positioning surface: the framework never assumes React Flow, so
 * the host passes its canvas (or any other renderer) as children and its
 * floating widgets through `overlays`.
 */
export function CanvasContainer(props: CanvasContainerProps): ReactNode {
  return (
    <div
      data-nodera-canvas-container=""
      {...(props.className === undefined ? {} : { className: props.className })}
      style={CONTAINER_STYLE}
    >
      <div data-nodera-canvas-content="" style={CONTENT_STYLE}>
        {props.children}
      </div>
      {props.overlays === undefined || props.overlays === null ? null : (
        <div data-nodera-canvas-overlays="" style={OVERLAY_STYLE}>
          {props.overlays}
        </div>
      )}
    </div>
  );
}
