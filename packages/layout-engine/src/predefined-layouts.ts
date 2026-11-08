import type { LayoutDefinition } from "@nodera/ui-core";

/** Stable id of the classic editor layout. */
export const EDITOR_LAYOUT_ID = "nodera.layout.editor";

/** Stable id of the canvas-only layout. */
export const CANVAS_ONLY_LAYOUT_ID = "nodera.layout.canvas-only";

/** Stable id of the ide-like layout. */
export const IDE_LAYOUT_ID = "nodera.layout.ide";

/**
 * Classic editor composition: header, palette, properties and validation panel
 * around the canvas. It is a starting point, never a mandatory arrangement.
 */
export const EDITOR_LAYOUT: LayoutDefinition = Object.freeze({
  id: EDITOR_LAYOUT_ID,
  name: "Editor",
  description: "Header, palette, properties inspector and validation panel around the canvas.",
  panels: Object.freeze([
    Object.freeze({ panelId: "header", region: "header" as const, size: 44 }),
    Object.freeze({ panelId: "palette", region: "left" as const, size: 240 }),
    Object.freeze({ panelId: "properties", region: "right" as const, size: 300 }),
    Object.freeze({ panelId: "validation", region: "bottom" as const, size: 160 }),
  ]),
}) as LayoutDefinition;

/** Canvas-only composition: a single header bar and everything else for the canvas. */
export const CANVAS_ONLY_LAYOUT: LayoutDefinition = Object.freeze({
  id: CANVAS_ONLY_LAYOUT_ID,
  name: "Canvas only",
  description: "A single header bar; the rest of the window belongs to the canvas.",
  panels: Object.freeze([Object.freeze({ panelId: "header", region: "header" as const, size: 44 })]),
}) as LayoutDefinition;

/** Ide-like composition: two stacked left panels, properties, validation and footer. */
export const IDE_LAYOUT: LayoutDefinition = Object.freeze({
  id: IDE_LAYOUT_ID,
  name: "IDE",
  description: "Navigator and palette stacked on the left, properties on the right, validation below.",
  panels: Object.freeze([
    Object.freeze({ panelId: "header", region: "header" as const, size: 44 }),
    Object.freeze({ panelId: "palette", region: "left" as const, size: 240 }),
    Object.freeze({ panelId: "navigator", region: "left" as const, size: 240 }),
    Object.freeze({ panelId: "properties", region: "right" as const, size: 320 }),
    Object.freeze({ panelId: "validation", region: "bottom" as const, size: 180 }),
    Object.freeze({ panelId: "footer", region: "footer" as const, size: 28 }),
  ]),
}) as LayoutDefinition;

/** Layouts the framework ships as starting points. */
export const PREDEFINED_LAYOUTS: readonly LayoutDefinition[] = Object.freeze([
  EDITOR_LAYOUT,
  CANVAS_ONLY_LAYOUT,
  IDE_LAYOUT,
]) as readonly LayoutDefinition[];
