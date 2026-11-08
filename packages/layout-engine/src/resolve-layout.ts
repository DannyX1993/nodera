import type {
  DockRegion,
  LayoutDefinition,
  LayoutPanelState,
  LayoutState,
  PanelRegion,
  Rect,
} from "@nodera/ui-core";

/** Viewport the layout is resolved against. */
export interface LayoutViewport {
  readonly width: number;
  readonly height: number;
}

/** Options accepted by {@link resolveLayout}. */
export interface ResolveLayoutOptions {
  /** Available area. Defaults to the documented 1280x800 editor viewport. */
  readonly viewport?: LayoutViewport;
}

/** Documented default viewport used when the host provides none. */
export const DEFAULT_LAYOUT_VIEWPORT: LayoutViewport = Object.freeze({ width: 1280, height: 800 });

/** A docked region and the area it reserves. */
export interface ResolvedRegion {
  readonly region: DockRegion;
  readonly rect: Rect;
}

/** One positioned panel. */
export interface ResolvedPanel {
  readonly panelId: string;
  readonly region: PanelRegion;
  readonly rect: Rect;
}

/** Geometry of a layout state. */
export interface ResolvedLayout {
  readonly viewport: LayoutViewport;
  readonly regions: readonly ResolvedRegion[];
  readonly panels: readonly ResolvedPanel[];
  /** Panels the host asked to hide. */
  readonly hidden: readonly string[];
  /** Panels rendered outside the canvas area, without layout geometry. */
  readonly external: readonly string[];
}

/** Regions in the order they are reported. */
const REGION_ORDER: readonly DockRegion[] = ["header", "left", "right", "bottom", "footer"];

/** Offset of the default position of a floating panel. */
const FLOATING_MARGIN = 16;

function isDockRegion(region: PanelRegion): region is DockRegion {
  return region !== "floating" && region !== "external";
}

function regionSize(panels: readonly LayoutPanelState[], region: DockRegion): number {
  let size = 0;
  for (const panel of panels) {
    if (panel.region === region && panel.size > size) {
      size = panel.size;
    }
  }
  return size;
}

/**
 * Splits a region area between the panels docked into it.
 *
 * Side regions stack their panels vertically; stacked regions place them
 * side by side. Areas are never negative, even when the host declares sizes
 * larger than the viewport.
 */
function sliceArea(area: Rect, index: number, count: number, region: DockRegion): Rect {
  if (count <= 1) {
    return area;
  }
  if (region === "left" || region === "right") {
    const height = Math.max(0, Math.floor(area.height / count));
    return { x: area.x, y: area.y + height * index, width: area.width, height };
  }
  const width = Math.max(0, Math.floor(area.width / count));
  return { x: area.x + width * index, y: area.y, width, height: area.height };
}

/**
 * Computes the geometry of a layout state.
 *
 * Pure function: it reads the layout and viewport only, never touches the graph,
 * and returns the areas the shell renders into. The remaining area is always
 * left to the canvas, so a layout that declares fewer regions gives the canvas
 * more room instead of inventing panels.
 */
export function resolveLayout(
  _definition: LayoutDefinition,
  state: LayoutState,
  options: ResolveLayoutOptions = {},
): ResolvedLayout {
  const viewport = options.viewport ?? DEFAULT_LAYOUT_VIEWPORT;

  const docked = state.panels.filter(
    (panel) => panel.visible && isDockRegion(panel.region),
  );
  const hidden = state.panels
    .filter((panel) => !panel.visible && panel.region !== "external")
    .map((panel) => panel.panelId);
  const external = state.panels
    .filter((panel) => panel.region === "external")
    .map((panel) => panel.panelId);

  const headerHeight = regionSize(docked, "header");
  const footerHeight = regionSize(docked, "footer");
  const leftWidth = regionSize(docked, "left");
  const rightWidth = regionSize(docked, "right");
  const bottomHeight = regionSize(docked, "bottom");

  const contentHeight = Math.max(0, viewport.height - headerHeight - footerHeight);
  const centerWidth = Math.max(0, viewport.width - leftWidth - rightWidth);

  const regionRects: Record<DockRegion, Rect> = {
    header: { x: 0, y: 0, width: viewport.width, height: headerHeight },
    left: { x: 0, y: headerHeight, width: leftWidth, height: contentHeight },
    right: {
      x: Math.max(0, viewport.width - rightWidth),
      y: headerHeight,
      width: rightWidth,
      height: contentHeight,
    },
    bottom: {
      x: leftWidth,
      y: Math.max(0, headerHeight + contentHeight - bottomHeight),
      width: centerWidth,
      height: bottomHeight,
    },
    footer: {
      x: 0,
      y: Math.max(0, viewport.height - footerHeight),
      width: viewport.width,
      height: footerHeight,
    },
  };

  const regions = REGION_ORDER.filter((region) =>
    docked.some((panel) => panel.region === region),
  ).map((region) => ({ region, rect: regionRects[region] }));

  const panels = state.panels
    .filter((panel) => panel.visible)
    .map((panel): ResolvedPanel | undefined => {
      if (panel.region === "floating") {
        return {
          panelId: panel.panelId,
          region: "floating",
          rect: panel.rect ?? {
            x: leftWidth + FLOATING_MARGIN,
            y: headerHeight + FLOATING_MARGIN,
            width: panel.size,
            height: panel.size,
          },
        };
      }
      if (!isDockRegion(panel.region)) {
        return undefined;
      }
      const siblings = docked.filter((candidate) => candidate.region === panel.region);
      const index = siblings.findIndex((candidate) => candidate.panelId === panel.panelId);
      return {
        panelId: panel.panelId,
        region: panel.region,
        rect: sliceArea(regionRects[panel.region], index, siblings.length, panel.region),
      };
    })
    .filter((panel): panel is ResolvedPanel => panel !== undefined);

  return { viewport, regions, panels, hidden, external };
}
