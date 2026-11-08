import { PanelRegistry, type PanelDefinition, type PanelRegion } from "@nodera/ui-core";

/** Options a preset panel may declare on top of its identity and region. */
interface PanelOptions {
  readonly size?: number;
  readonly resizable?: boolean;
  readonly hideable?: boolean;
  readonly title?: string;
}

/**
 * Builds one preset panel definition.
 *
 * The renderer id is derived from the stable panel id (`nodera.panel.<id>`), so
 * a host can replace exactly one panel renderer by registering a component
 * under that id, and UI copy changes never break the reference.
 */
function definePanel(
  id: string,
  region: PanelRegion,
  options: PanelOptions = {},
): PanelDefinition {
  return Object.freeze({
    id,
    title: options.title ?? toTitle(id),
    region,
    renderer: `nodera.panel.${id}`,
    ...(options.size === undefined ? {} : { size: options.size }),
    ...(options.resizable === undefined ? {} : { resizable: options.resizable }),
    ...(options.hideable === undefined ? {} : { hideable: options.hideable }),
  });
}

function toTitle(id: string): string {
  const [first = "", ...rest] = id.split("-");
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

/**
 * Panels the framework ships as starting points.
 *
 * They describe the Phase 5 modules (S1) without imposing a layout: each
 * definition only declares what the panel is, which region it prefers and how
 * big it starts. A host may ignore, move, hide or replace any of them.
 */
export const DEFAULT_PANELS: readonly PanelDefinition[] = Object.freeze([
  definePanel("header", "header", { size: 44, resizable: false, hideable: false }),
  definePanel("footer", "footer", { size: 28, resizable: false, hideable: false }),
  definePanel("palette", "left", { title: "Node palette", size: 240 }),
  definePanel("navigator", "left", { size: 240 }),
  definePanel("properties", "right", { size: 300 }),
  definePanel("inspector", "right", { size: 300 }),
  definePanel("validation", "bottom", { size: 160 }),
  definePanel("history", "bottom", { size: 160 }),
  definePanel("metadata", "external"),
  definePanel("search", "floating", { size: 320 }),
  definePanel("minimap", "right", { size: 240 }),
]) as readonly PanelDefinition[];

/**
 * Creates a registry holding the default panels.
 *
 * A fresh registry per UI instance keeps hosts isolated: replacing a panel
 * definition in one editor never leaks into another.
 */
export function createDefaultPanelRegistry(): PanelRegistry {
  const registry = new PanelRegistry();
  for (const panel of DEFAULT_PANELS) {
    const registered = registry.register(panel);
    if (!registered.ok) {
      throw new Error(registered.error.message);
    }
  }
  return registry;
}
