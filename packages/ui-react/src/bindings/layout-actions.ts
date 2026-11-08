import { useMemo } from "react";

import {
  createLayoutState,
  deserializePreferences,
  dockPanel as dockPanelState,
  floatPanel as floatPanelState,
  resizePanel as resizePanelState,
  restoreLayoutPreferences,
  saveLayoutPreferences,
  setPanelVisible as setPanelVisibleState,
  togglePanel as togglePanelState,
  type LayoutOptions,
  type LayoutPreferenceStore,
} from "@nodera/layout-engine";
import type { DockRegion, LayoutState, Rect } from "@nodera/ui-core";

import { useNoderaUi } from "../providers/ui-provider.js";

/**
 * Outcome of {@link LayoutActions.restorePreferences}.
 *
 * The engine's diagnostics are part of the binding's contract, not an internal
 * detail: a host reports them to the user instead of guessing why nothing
 * changed. A restore never throws and never partly applies — the applied layout
 * is either replaced or left exactly as it was.
 */
export interface RestorePreferencesResult {
  /**
   * - `restored`: the stored preference was valid and is now the applied layout.
   * - `missing`: nothing was stored, the applied layout is unchanged.
   * - `malformed`: the stored payload is unusable, see `diagnostic`.
   * - `unknown-layout`: the stored layout id is not declared by the host, so
   *   there is nothing to apply it to, see `diagnostic`.
   */
  readonly status: "restored" | "missing" | "malformed" | "unknown-layout";
  /** Id of the layout that became the applied layout, when one was restored. */
  readonly layoutId?: string;
  /** Preference entries dropped because the declared layout no longer has them. */
  readonly ignoredPanelIds: readonly string[];
  /** Human-readable reason of a non-restored outcome. */
  readonly diagnostic?: string;
}

/**
 * Layout actions of the nearest provider.
 *
 * Every action funnels through a layout-engine reducer and the UI store, so
 * layout rules (clamping, capabilities, persistence format) exist exactly once
 * and the React layer only decides *when* to apply them.
 */
export interface LayoutActions {
  /** Applies a declared layout. Unknown layout ids are ignored. */
  applyLayout(layoutId: string): void;
  /** Re-applies the layout the registry declares as default. */
  resetLayout(): void;
  /** Resizes a panel within its declared bounds. */
  resizePanel(panelId: string, size: number): void;
  /** Shows or hides a panel, if the panel definition allows it. */
  setPanelVisible(panelId: string, visible: boolean): void;
  /** Flips the visibility of a panel. */
  togglePanel(panelId: string): void;
  /** Moves a panel into a dock region. */
  dockPanel(panelId: string, region: DockRegion): void;
  /** Floats a panel at the given rectangle. */
  floatPanel(panelId: string, rect: Rect): void;
  /** Persists the applied layout state through a host-provided store. */
  savePreferences(preferences: LayoutPreferenceStore): void;
  /**
   * Restores previously persisted layout preferences.
   *
   * Never throws: a missing, malformed or undeclared preference is a reported
   * no-op that leaves the applied layout untouched.
   */
  restorePreferences(preferences: LayoutPreferenceStore): RestorePreferencesResult;
}

/** Binds the layout engine and the UI store to a stable actions object. */
export function useLayoutActions(): LayoutActions {
  const { store, layoutRegistry, panelRegistry } = useNoderaUi();

  return useMemo<LayoutActions>(() => {
    const options = (): LayoutOptions => ({ panels: panelRegistry.all() });

    const applyLayout = (layoutId: string): void => {
      const definition = layoutRegistry.get(layoutId);
      if (definition === undefined) {
        return;
      }
      store.setLayout(definition.id, createLayoutState(definition, options()));
    };

    const updateLayout = (reducer: (layout: LayoutState) => LayoutState): void => {
      store.updateLayout((layout) => reducer(layout));
    };

    return {
      applyLayout,
      resetLayout: () => {
        applyLayout(layoutRegistry.getDefault().id);
      },
      resizePanel: (panelId, size) => {
        updateLayout((layout) => resizePanelState(layout, { panelId, size }, options()));
      },
      setPanelVisible: (panelId, visible) => {
        updateLayout((layout) => setPanelVisibleState(layout, { panelId, visible }, options()));
      },
      togglePanel: (panelId) => {
        updateLayout((layout) => togglePanelState(layout, { panelId }, options()));
      },
      dockPanel: (panelId, region) => {
        updateLayout((layout) => dockPanelState(layout, { panelId, region }, options()));
      },
      floatPanel: (panelId, rect) => {
        updateLayout((layout) => floatPanelState(layout, { panelId, rect }, options()));
      },
      savePreferences: (preferences) => {
        const state = store.getState();
        if (state.layout === undefined) {
          return;
        }
        saveLayoutPreferences(preferences, state.layoutId, state.layout);
      },
      restorePreferences: (preferences): RestorePreferencesResult => {
        const stored = preferences.load();
        if (stored === undefined) {
          return { status: "missing", ignoredPanelIds: [] };
        }
        const parsed = deserializePreferences(stored);
        if (!parsed.ok) {
          return { status: "malformed", ignoredPanelIds: [], diagnostic: parsed.error.message };
        }
        const definition = layoutRegistry.get(parsed.value.layoutId);
        if (definition === undefined) {
          return {
            status: "unknown-layout",
            ignoredPanelIds: [],
            diagnostic: `Stored layout '${parsed.value.layoutId}' is not declared by the host; the applied layout is unchanged`,
          };
        }
        const restored = restoreLayoutPreferences(preferences, definition, options());
        if (restored.status !== "restored" || restored.state === undefined) {
          // Nothing was applied: report the engine's own reason unchanged.
          return restored.diagnostic === undefined
            ? { status: restored.status, ignoredPanelIds: restored.ignoredPanelIds }
            : {
                status: restored.status,
                ignoredPanelIds: restored.ignoredPanelIds,
                diagnostic: restored.diagnostic,
              };
        }
        store.setLayout(definition.id, restored.state);
        return {
          status: "restored",
          layoutId: definition.id,
          ignoredPanelIds: restored.ignoredPanelIds,
        };
      },
    };
  }, [store, layoutRegistry, panelRegistry]);
}
