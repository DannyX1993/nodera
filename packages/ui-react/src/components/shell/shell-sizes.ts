import { DEFAULT_LAYOUT_VIEWPORT, resolveLayout } from "@nodera/layout-engine";
import type { DockRegion, LayoutDefinition, LayoutState } from "@nodera/ui-core";

/** Edge length of every docked region of the shell. */
export interface ShellSizes {
  readonly header: number;
  readonly footer: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Definition the shell hands to the layout engine.
 *
 * `computeShellSizes` reports region *edges* only, and those come from the
 * applied `LayoutState`; the shell declares no layout of its own, so it passes
 * an explicitly empty definition instead of inventing panels the host never
 * asked for (S2/S4: the framework imposes no layout).
 */
const SHELL_GEOMETRY_DEFINITION: LayoutDefinition = {
  id: "nodera.shell.region-geometry",
  panels: [],
};

/** Edge of a resolved region rectangle that becomes the shell size. */
const REGION_DIMENSION: Record<DockRegion, "width" | "height"> = {
  header: "height",
  footer: "height",
  bottom: "height",
  left: "width",
  right: "width",
};

/**
 * Edge sizes of the regions the shell renders.
 *
 * The layout engine owns region geometry: this function delegates to
 * `resolveLayout` with the documented default viewport and only maps the
 * resolved region rectangles to shell edges — `height` for the horizontal
 * regions (`header`, `footer`, `bottom`) and `width` for the side regions
 * (`left`, `right`). There is no second max-per-region rule here, so the shell
 * and the engine cannot drift apart. Regions the layout does not place, panels
 * that are hidden, floating or external, and layouts not applied yet report `0`,
 * which the shell renders as "size to content".
 */
export function computeShellSizes(layout: LayoutState | undefined): ShellSizes {
  const sizes: Record<DockRegion, number> = {
    header: 0,
    footer: 0,
    left: 0,
    right: 0,
    bottom: 0,
  };

  if (layout === undefined) {
    return sizes;
  }

  const resolved = resolveLayout(SHELL_GEOMETRY_DEFINITION, layout, {
    viewport: DEFAULT_LAYOUT_VIEWPORT,
  });
  for (const { region, rect } of resolved.regions) {
    sizes[region] = rect[REGION_DIMENSION[region]];
  }

  return sizes;
}

/**
 * First visible panel docked in a region, in layout panel order.
 *
 * A region can only be resized when the host knows *which* panel the requested
 * edge size belongs to: the shell reports the region, the layout engine resizes
 * a panel. This helper is that mapping, so a host wires
 * `EditorShell.onResizeRegion` to `useLayoutActions().resizePanel` without
 * re-implementing the "first visible panel of the region" rule. A region with
 * no visible panel, and a shell that has no layout applied yet, report
 * `undefined` and the host simply does nothing.
 */
export function panelIdForRegion(
  layout: LayoutState | undefined,
  region: DockRegion,
): string | undefined {
  const panel = layout?.panels.find(
    (candidate) => candidate.region === region && candidate.visible,
  );
  return panel?.panelId;
}
