/**
 * Layout model shared by the editor UI store and the layout engine.
 *
 * These are pure data types: no React, no DOM, no graph domain concepts. The
 * layout engine computes geometry from them, and never touches the graph.
 */

/** Region a panel can be docked into. */
export type DockRegion = "header" | "footer" | "left" | "right" | "bottom";

/** Region a panel can occupy, including the non-docked ones. */
export type PanelRegion = DockRegion | "floating" | "external";

/** Axis-aligned rectangle in panel coordinates. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Current placement of one panel inside a layout. */
export interface LayoutPanelState {
  readonly panelId: string;
  readonly region: PanelRegion;
  readonly visible: boolean;
  /** Width for `left`/`right`, height for `header`/`footer`/`bottom`, edge length for floating panels. */
  readonly size: number;
  /** Position and size of a floating panel. Ignored for docked regions. */
  readonly rect?: Rect;
}

/** Current panel state of an applied layout. */
export interface LayoutState {
  readonly panels: readonly LayoutPanelState[];
}

/** Initial placement a layout declares for one panel. */
export interface LayoutPanelPlacement {
  readonly panelId: string;
  readonly region: PanelRegion;
  readonly visible?: boolean;
  readonly size?: number;
  readonly rect?: Rect;
}

/**
 * Declarative layout declared by the host application.
 *
 * The framework never selects, injects or defaults a layout: the host declares
 * which layout exists, which panels it places and where, and the editor only
 * tracks the resulting state.
 */
export interface LayoutDefinition {
  /** Globally qualified, stable id, e.g. `acme.ide-layout`. */
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  /** Default edge sizes of docked regions, used by the geometry resolver. */
  readonly regionSizes?: Partial<Record<DockRegion, number>>;
  /** Panels the layout places, in visual order. */
  readonly panels: readonly LayoutPanelPlacement[];
  /** Host-extensible metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
