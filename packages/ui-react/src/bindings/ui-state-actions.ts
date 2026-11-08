import { useMemo } from "react";

import type { InteractionMode, OpenMenuState } from "@nodera/ui-core";

import { useNoderaUi } from "../providers/ui-provider.js";

/**
 * UI state actions of the nearest provider.
 *
 * Every action delegates to the framework-agnostic `UiStateStore`: the React
 * layer never owns presentation state itself (D3), it only binds the store.
 */
export interface UiStateActions {
  /** Applies a theme by id. */
  setTheme(themeId: string): void;
  /** Replaces the query of the search surfaces. */
  setSearchQuery(searchQuery: string): void;
  /** Switches the editor interaction mode. */
  setInteractionMode(mode: InteractionMode): void;
  /** Marks the panel that has focus, or clears it with `undefined`. */
  setActivePanel(panelId: string | undefined): void;
  /** Opens a context or panel menu. */
  openMenu(menu: OpenMenuState): void;
  /** Closes the open menu, if any. */
  closeMenu(): void;
}

/** Binds the store actions to a stable object for React consumers. */
export function useUiStateActions(): UiStateActions {
  const { store } = useNoderaUi();

  return useMemo<UiStateActions>(
    () => ({
      setTheme: (themeId) => {
        store.setTheme(themeId);
      },
      setSearchQuery: (searchQuery) => {
        store.setSearchQuery(searchQuery);
      },
      setInteractionMode: (mode) => {
        store.setInteractionMode(mode);
      },
      setActivePanel: (panelId) => {
        store.setActivePanel(panelId);
      },
      openMenu: (menu) => {
        store.openMenu(menu);
      },
      closeMenu: () => {
        store.closeMenu();
      },
    }),
    [store],
  );
}
