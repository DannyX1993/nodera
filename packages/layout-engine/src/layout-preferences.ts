import { ok, err, type Result } from "@nodera/contracts";
import type { LayoutDefinition, LayoutPanelState, LayoutState, PanelRegion, Rect } from "@nodera/ui-core";

import { PANEL_REGIONS, createLayoutState, findPanel, type LayoutOptions } from "./layout-state.js";

/** Version of the persisted layout preferences payload. */
export const LAYOUT_PREFERENCES_VERSION = 1;

/** Persisted state of one panel. */
export interface LayoutPanelPreference {
  readonly panelId: string;
  readonly region: PanelRegion;
  readonly visible: boolean;
  readonly size: number;
  readonly rect?: Rect;
}

/** Persisted layout preferences: the applied layout and its panel state. */
export interface LayoutPreferences {
  readonly version: number;
  readonly layoutId: string;
  readonly panels: readonly LayoutPanelPreference[];
}

/** Why a preferences payload was rejected. */
export type PreferencesErrorKind = "malformed" | "unsupported-version";

/** Structured preferences error. */
export interface PreferencesError {
  readonly kind: PreferencesErrorKind;
  readonly message: string;
}

/** Result of applying stored preferences to a declared layout. */
export interface AppliedPreferences {
  readonly state: LayoutState;
  /** Preference entries dropped because the layout no longer declares them. */
  readonly ignoredPanelIds: readonly string[];
}

function malformed(message: string): PreferencesError {
  return { kind: "malformed", message };
}

/** Captures the current layout state as a persistable payload. */
export function toPreferences(layoutId: string, state: LayoutState): LayoutPreferences {
  return {
    version: LAYOUT_PREFERENCES_VERSION,
    layoutId,
    panels: state.panels.map((panel): LayoutPanelPreference => {
      const preference: LayoutPanelPreference = {
        panelId: panel.panelId,
        region: panel.region,
        visible: panel.visible,
        size: panel.size,
      };
      return panel.rect === undefined ? preference : { ...preference, rect: panel.rect };
    }),
  };
}

/** Serializes preferences into the JSON text a storage adapter persists. */
export function serializePreferences(preferences: LayoutPreferences): string {
  return JSON.stringify(preferences);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRect(value: unknown): Rect | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const numbers = [value["x"], value["y"], value["width"], value["height"]];
  if (!numbers.every((component) => typeof component === "number" && Number.isFinite(component))) {
    return undefined;
  }
  return {
    x: numbers[0] as number,
    y: numbers[1] as number,
    width: numbers[2] as number,
    height: numbers[3] as number,
  };
}

function parsePanel(value: unknown, index: number): LayoutPanelPreference | PreferencesError {
  if (!isRecord(value)) {
    return malformed(`layout preferences panel at index ${index} must be an object`);
  }
  const panelId = value["panelId"];
  if (typeof panelId !== "string" || panelId === "") {
    return malformed(`layout preferences panel at index ${index} has no panelId`);
  }
  const region = value["region"];
  if (typeof region !== "string" || !PANEL_REGIONS.includes(region as PanelRegion)) {
    return malformed(
      `layout preferences panel "${panelId}" has an unknown region "${String(region)}"`,
    );
  }
  const visible = value["visible"];
  if (typeof visible !== "boolean") {
    return malformed(`layout preferences panel "${panelId}" has no boolean visible flag`);
  }
  const size = value["size"];
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return malformed(`layout preferences panel "${panelId}" has an invalid size "${String(size)}"`);
  }
  const rect = value["rect"];
  if (rect !== undefined) {
    const parsedRect = parseRect(rect);
    if (parsedRect === undefined) {
      return malformed(`layout preferences panel "${panelId}" has an invalid rect`);
    }
    return {
      panelId,
      region: region as PanelRegion,
      visible,
      size,
      rect: parsedRect,
    };
  }
  return { panelId, region: region as PanelRegion, visible, size };
}

function isPreferencesError(value: unknown): value is PreferencesError {
  return isRecord(value) && typeof value["message"] === "string";
}

/**
 * Validates and parses a persisted preferences payload.
 *
 * Accepts the object form a storage adapter loads and the JSON text it stores.
 * Anything unparseable, incomplete or of an unknown version is an explicit
 * error: stored preferences are never trusted silently.
 */
export function deserializePreferences(
  input: unknown,
): Result<LayoutPreferences, PreferencesError> {
  let payload: unknown = input;
  if (typeof input === "string") {
    try {
      payload = JSON.parse(input);
    } catch {
      return err(malformed("layout preferences are not valid json"));
    }
  }
  if (!isRecord(payload)) {
    return err(malformed("layout preferences must be a json object"));
  }

  const version = payload["version"];
  if (typeof version !== "number") {
    return err(malformed("layout preferences have no numeric version"));
  }
  if (version !== LAYOUT_PREFERENCES_VERSION) {
    return err({
      kind: "unsupported-version",
      message: `layout preferences version ${version} is not supported (expected ${LAYOUT_PREFERENCES_VERSION})`,
    });
  }

  const layoutId = payload["layoutId"];
  if (typeof layoutId !== "string" || layoutId === "") {
    return err(malformed("layout preferences have no layoutId"));
  }

  const panels = payload["panels"];
  if (!Array.isArray(panels)) {
    return err(malformed("layout preferences have no panels array"));
  }

  const parsedPanels: LayoutPanelPreference[] = [];
  for (const [index, rawPanel] of panels.entries()) {
    const parsed = parsePanel(rawPanel, index);
    if (isPreferencesError(parsed)) {
      return err(parsed);
    }
    parsedPanels.push(parsed);
  }

  return ok({ version, layoutId, panels: parsedPanels });
}

function panelFromPreference(preference: LayoutPanelPreference): LayoutPanelState {
  const panel: LayoutPanelState = {
    panelId: preference.panelId,
    region: preference.region,
    visible: preference.visible,
    size: preference.size,
  };
  return preference.rect === undefined ? panel : { ...panel, rect: preference.rect };
}

/**
 * Applies stored preferences to a layout the host declares today.
 *
 * The declared layout is authoritative for which panels exist: preferences of
 * panels it no longer declares are dropped and reported, so a saved layout never
 * resurrects a panel the host removed.
 */
export function applyPreferences(
  preferences: LayoutPreferences,
  definition: LayoutDefinition,
  options: LayoutOptions = {},
): AppliedPreferences {
  const declared = createLayoutState(definition, options);
  const ignoredPanelIds = preferences.panels
    .filter((preference) => findPanel(declared, preference.panelId) === undefined)
    .map((preference) => preference.panelId);

  const known = preferences.panels.filter(
    (preference) => findPanel(declared, preference.panelId) !== undefined,
  );

  const panels = declared.panels.map((panel) => {
    const preference = known.find((candidate) => candidate.panelId === panel.panelId);
    return preference === undefined ? panel : panelFromPreference(preference);
  });

  return { state: { panels }, ignoredPanelIds };
}
