import {
  DEFAULT_PANEL_DEFAULTS,
  resolvePanelDefaults,
  type DockRegion,
  type LayoutDefinition,
  type LayoutPanelState,
  type LayoutState,
  type PanelDefinition,
  type PanelRegion,
  type Rect,
} from "@nodera/ui-core";

/** Panel capabilities a layout operation needs. */
export interface LayoutOptions {
  /** Panel definitions whose capabilities constrain the layout operations. */
  readonly panels?: readonly PanelDefinition[];
}

/** Sizing default used when neither the placement, the region nor the panel declare one. */
const FALLBACK_SIZE = DEFAULT_PANEL_DEFAULTS.size;

function panelOf(panelId: string, options: LayoutOptions): PanelDefinition | undefined {
  return options.panels?.find((panel) => panel.id === panelId);
}

function capabilitiesOf(panelId: string, options: LayoutOptions) {
  const panel = panelOf(panelId, options);
  return panel === undefined ? DEFAULT_PANEL_DEFAULTS : resolvePanelDefaults(panel);
}

function sameRect(left: Rect | undefined, right: Rect | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return (
    left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
  );
}

function samePanel(left: LayoutPanelState, right: LayoutPanelState): boolean {
  return (
    left.panelId === right.panelId &&
    left.region === right.region &&
    left.visible === right.visible &&
    left.size === right.size &&
    sameRect(left.rect, right.rect)
  );
}

/** Finds the current state of one panel. */
export function findPanel(state: LayoutState, panelId: string): LayoutPanelState | undefined {
  return state.panels.find((panel) => panel.panelId === panelId);
}

/**
 * Builds the initial panel state of a layout.
 *
 * Sizes resolve in this order: the placement of the layout, the layout region
 * size, the panel definition, and finally the documented default. Visibility
 * resolves from the placement, then the panel definition, then `true`.
 */
export function createLayoutState(
  definition: LayoutDefinition,
  options: LayoutOptions = {},
): LayoutState {
  const panels = definition.panels.map((placement): LayoutPanelState => {
    const panel = panelOf(placement.panelId, options);
    const capabilities = capabilitiesOf(placement.panelId, options);
    const regionSize =
      placement.region === "floating" || placement.region === "external"
        ? undefined
        : definition.regionSizes?.[placement.region];
    const size = placement.size ?? regionSize ?? panel?.size ?? FALLBACK_SIZE;
    const visible = placement.visible ?? panel?.visible ?? capabilities.visible;
    const base: LayoutPanelState = { panelId: placement.panelId, region: placement.region, visible, size };
    return placement.rect === undefined ? base : { ...base, rect: placement.rect };
  });

  return { panels };
}

/** Replaces one panel, returning the previous state when nothing changed. */
function withPanel(
  state: LayoutState,
  panelId: string,
  update: (panel: LayoutPanelState) => LayoutPanelState,
): LayoutState {
  const index = state.panels.findIndex((panel) => panel.panelId === panelId);
  if (index < 0) {
    return state;
  }
  const current = state.panels[index] as LayoutPanelState;
  const next = update(current);
  if (samePanel(current, next)) {
    return state;
  }
  const panels = state.panels.map((panel, position) => (position === index ? next : panel));
  return { panels };
}

/**
 * Resizes a panel within its declared bounds.
 *
 * Non-resizable panels, unknown panels and non-finite sizes are ignored, and an
 * unchanged size returns the very same layout state so the UI store notifies
 * nobody.
 */
export function resizePanel(
  state: LayoutState,
  input: { readonly panelId: string; readonly size: number },
  options: LayoutOptions = {},
): LayoutState {
  const capabilities = capabilitiesOf(input.panelId, options);
  if (!capabilities.resizable || !Number.isFinite(input.size)) {
    return state;
  }
  const size = Math.min(Math.max(input.size, capabilities.minSize), capabilities.maxSize);
  return withPanel(state, input.panelId, (panel) => ({ ...panel, size }));
}

/** Shows or hides a panel. Non-hideable panels are ignored. */
export function setPanelVisible(
  state: LayoutState,
  input: { readonly panelId: string; readonly visible: boolean },
  options: LayoutOptions = {},
): LayoutState {
  const capabilities = capabilitiesOf(input.panelId, options);
  if (!capabilities.hideable) {
    return state;
  }
  return withPanel(state, input.panelId, (panel) => ({ ...panel, visible: input.visible }));
}

/** Flips the visibility of a hideable panel. */
export function togglePanel(
  state: LayoutState,
  input: { readonly panelId: string },
  options: LayoutOptions = {},
): LayoutState {
  const capabilities = capabilitiesOf(input.panelId, options);
  if (!capabilities.hideable) {
    return state;
  }
  return withPanel(state, input.panelId, (panel) => ({ ...panel, visible: !panel.visible }));
}

/** Moves a dockable panel into a dock region and drops its floating rectangle. */
export function dockPanel(
  state: LayoutState,
  input: { readonly panelId: string; readonly region: DockRegion },
  options: LayoutOptions = {},
): LayoutState {
  const capabilities = capabilitiesOf(input.panelId, options);
  if (!capabilities.dockable) {
    return state;
  }
  return withPanel(state, input.panelId, (panel) => ({
    panelId: panel.panelId,
    region: input.region,
    visible: panel.visible,
    size: panel.size,
  }));
}

/** Floats a panel at the given rectangle, making it visible. */
export function floatPanel(
  state: LayoutState,
  input: { readonly panelId: string; readonly rect: Rect },
  options: LayoutOptions = {},
): LayoutState {
  const capabilities = capabilitiesOf(input.panelId, options);
  if (!capabilities.floating) {
    return state;
  }
  return withPanel(state, input.panelId, (panel) => ({
    panelId: panel.panelId,
    region: "floating",
    visible: true,
    size: panel.size,
    rect: input.rect,
  }));
}

/** All regions a panel state may reference. */
export const PANEL_REGIONS: readonly PanelRegion[] = [
  "header",
  "left",
  "right",
  "bottom",
  "footer",
  "floating",
  "external",
];
