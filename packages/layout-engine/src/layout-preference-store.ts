import type { LayoutDefinition, LayoutState } from "@nodera/ui-core";

import { applyPreferences, deserializePreferences, toPreferences } from "./layout-preferences.js";
import type { LayoutOptions } from "./layout-state.js";

/**
 * Port a host implements to persist layout preferences.
 *
 * The engine never decides where preferences live: the host wires an adapter
 * (local storage, a file, a remote profile) behind this contract. The value is
 * opaque to the port, so adapters may store the object or its JSON text.
 */
export interface LayoutPreferenceStore {
  /** Returns the persisted payload, or `undefined` when nothing is stored. */
  load(): unknown;
  /** Persists the payload. */
  save(preferences: unknown): void;
  /** Removes the persisted payload. */
  clear(): void;
}

/** In-memory preference store, useful for tests and ephemeral hosts. */
export function createMemoryLayoutPreferenceStore(initial?: unknown): LayoutPreferenceStore {
  let current: unknown = initial;
  return {
    load: () => current,
    save: (preferences) => {
      current = preferences;
    },
    clear: () => {
      current = undefined;
    },
  };
}

/** Persists the current layout state. */
export function saveLayoutPreferences(
  store: LayoutPreferenceStore,
  layoutId: string,
  state: LayoutState,
): void {
  store.save(toPreferences(layoutId, state));
}

/** Outcome of restoring layout preferences. */
export interface RestoreLayoutResult {
  readonly status: "restored" | "missing" | "malformed";
  readonly state: LayoutState | undefined;
  readonly ignoredPanelIds: readonly string[];
  /** Diagnostic message when the stored payload is malformed. */
  readonly diagnostic?: string;
}

/**
 * Restores a layout state from the store.
 *
 * Never invents a layout: when nothing is stored the host keeps the declared
 * default, and when the payload is unusable the host is told why instead of
 * silently falling back to an arbitrary panel arrangement.
 */
export function restoreLayoutPreferences(
  store: LayoutPreferenceStore,
  definition: LayoutDefinition,
  options: LayoutOptions = {},
): RestoreLayoutResult {
  const stored = store.load();
  if (stored === undefined) {
    return { status: "missing", state: undefined, ignoredPanelIds: [] };
  }

  const parsed = deserializePreferences(stored);
  if (!parsed.ok) {
    return {
      status: "malformed",
      state: undefined,
      ignoredPanelIds: [],
      diagnostic: parsed.error.message,
    };
  }

  const applied = applyPreferences(parsed.value, definition, options);
  return { status: "restored", state: applied.state, ignoredPanelIds: applied.ignoredPanelIds };
}
