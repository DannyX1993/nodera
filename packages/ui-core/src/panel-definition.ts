import type { RegistryEntry } from "@nodera/contracts";

import type { PanelRegion } from "./layout.js";

/**
 * Declarative panel definition.
 *
 * A panel definition says what a panel is, where it can live and how the shell
 * may present it. It never holds a component: the renderer is referenced by
 * id and resolved by the presentation adapter, which is what makes Level 2
 * component replacement ("Sustituir completamente ... Panel Renderer") possible
 * without touching the definition.
 */
export interface PanelDefinition extends RegistryEntry {
  /** Globally qualified, stable id, e.g. `acme.panel.node-palette`. */
  readonly id: string;
  /** Human-readable title, used by panel chrome and visibility menus. */
  readonly title: string;
  readonly description?: string;
  /** Icon token or icon id resolved by the host. */
  readonly icon?: string;
  /** Default region the layout places this panel in. */
  readonly region: PanelRegion;
  /** Renderer id resolved by the presentation adapter. */
  readonly renderer?: string;
  /** Default size: width for side regions, height for stacked regions. */
  readonly size?: number;
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly resizable?: boolean;
  readonly dockable?: boolean;
  readonly hideable?: boolean;
  /** Whether the panel may be floated. */
  readonly floating?: boolean;
  /** Default visibility in a layout. */
  readonly visible?: boolean;
  /** Visual order inside its region. */
  readonly order?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Capability and sizing values with every default resolved. */
export interface PanelDefaults {
  readonly size: number;
  readonly minSize: number;
  readonly maxSize: number;
  readonly resizable: boolean;
  readonly dockable: boolean;
  readonly hideable: boolean;
  readonly floating: boolean;
  readonly visible: boolean;
  readonly order: number;
}

/** Documented default capabilities of a panel that declares none. */
export const DEFAULT_PANEL_DEFAULTS: PanelDefaults = Object.freeze({
  size: 240,
  minSize: 120,
  maxSize: 800,
  resizable: true,
  dockable: true,
  hideable: true,
  floating: true,
  visible: true,
  order: 0,
});

/** Resolves the defaults of a panel definition without mutating it. */
export function resolvePanelDefaults(panel: PanelDefinition): PanelDefaults {
  return {
    size: panel.size ?? DEFAULT_PANEL_DEFAULTS.size,
    minSize: panel.minSize ?? DEFAULT_PANEL_DEFAULTS.minSize,
    maxSize: panel.maxSize ?? DEFAULT_PANEL_DEFAULTS.maxSize,
    resizable: panel.resizable ?? DEFAULT_PANEL_DEFAULTS.resizable,
    dockable: panel.dockable ?? DEFAULT_PANEL_DEFAULTS.dockable,
    hideable: panel.hideable ?? DEFAULT_PANEL_DEFAULTS.hideable,
    floating: panel.floating ?? DEFAULT_PANEL_DEFAULTS.floating,
    visible: panel.visible ?? DEFAULT_PANEL_DEFAULTS.visible,
    order: panel.order ?? DEFAULT_PANEL_DEFAULTS.order,
  };
}
