import type { DockRegion, LayoutState } from "@nodera/ui-core";

/** Edge length of every docked region of the shell. */
export interface ShellSizes {
  readonly header: number;
  readonly footer: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Edge sizes of the regions the shell renders.
 *
 * A region is as large as its largest visible panel (side regions stack
 * vertically, stacked regions side by side, so the widest/tallest panel decides
 * the region). Regions without a visible panel and layouts that are not applied
 * yet report `0`, which the shell renders as "size to content".
 */
export function computeShellSizes(layout: LayoutState | undefined): ShellSizes {
  const sizes: Record<DockRegion, number> = {
    header: 0,
    footer: 0,
    left: 0,
    right: 0,
    bottom: 0,
  };

  if (layout !== undefined) {
    for (const panel of layout.panels) {
      if (!panel.visible || panel.region === "floating" || panel.region === "external") {
        continue;
      }
      const region: DockRegion = panel.region;
      if (panel.size > sizes[region]) {
        sizes[region] = panel.size;
      }
    }
  }

  return {
    header: sizes.header,
    footer: sizes.footer,
    left: sizes.left,
    right: sizes.right,
    bottom: sizes.bottom,
  };
}
