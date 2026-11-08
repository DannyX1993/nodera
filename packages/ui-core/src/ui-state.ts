import type { LayoutState } from "./layout.js";

/** Interaction mode of the editor surface. */
export type InteractionMode = "select" | "pan";

/** Element a context menu was opened for. */
export type MenuTargetKind = "node" | "edge" | "pane" | "canvas";

/**
 * Currently open menu.
 *
 * Menus are presentation state: they are tracked so surfaces can render them,
 * and they are never written into the portable document.
 */
export interface OpenMenuState {
  readonly kind: "context" | "panel";
  readonly targetKind: MenuTargetKind;
  /** Id of the node or edge the menu targets; empty for panes and canvases. */
  readonly targetId: string;
  /** Pointer position in host coordinates. */
  readonly position: { readonly x: number; readonly y: number };
}

/**
 * Editor UI state: everything the presentation layer owns that is *not* graph
 * domain state, editor selection/history (owned by the application layer) or
 * canvas viewport (owned by the canvas adapter).
 */
export interface UiState {
  /** Id of the theme applied to the UI root. */
  readonly themeId: string;
  /** Id of the applied layout. */
  readonly layoutId: string;
  /** Current panel state of the applied layout. */
  readonly layout: LayoutState | undefined;
  /** Open menu, if any. */
  readonly menu: OpenMenuState | undefined;
  /** Search query of search surfaces. */
  readonly searchQuery: string;
  readonly interactionMode: InteractionMode;
  /** Panel that currently has focus, if any. */
  readonly activePanelId: string | undefined;
}

/** Initial values accepted by {@link UiStateStore}. */
export interface UiStateStoreOptions {
  /** Theme applied to the UI root. Required: the registry resolves ids. */
  readonly themeId: string;
  /** Layout applied to the shell. Required: the registry resolves ids. */
  readonly layoutId: string;
  readonly layout?: LayoutState;
  readonly interactionMode?: InteractionMode;
  readonly searchQuery?: string;
}

/** Listener notified after every state change. */
export type UiStateListener = (state: UiState) => void;

/**
 * Framework-agnostic UI state container.
 *
 * Immutable snapshots plus `subscribe` are enough for any binding: React uses
 * `useSyncExternalStore`, other frameworks subscribe directly. There is no
 * hidden global state and no state library dependency.
 */
export class UiStateStore {
  private state: UiState;
  private readonly listeners = new Set<UiStateListener>();

  constructor(options: UiStateStoreOptions) {
    this.state = {
      themeId: options.themeId,
      layoutId: options.layoutId,
      layout: options.layout,
      menu: undefined,
      searchQuery: options.searchQuery ?? "",
      interactionMode: options.interactionMode ?? "select",
      activePanelId: undefined,
    };
  }

  /** Current immutable snapshot. Its identity changes only on a real change. */
  getState(): UiState {
    return this.state;
  }

  /** Subscribes to state changes. Returns the unsubscribe function. */
  subscribe(listener: UiStateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Applies the theme with the given id. */
  setTheme(themeId: string): void {
    if (themeId === this.state.themeId) {
      return;
    }
    this.commit({ ...this.state, themeId });
  }

  /** Applies a layout together with the panel state it produces. */
  setLayout(layoutId: string, layout: LayoutState): void {
    if (layoutId === this.state.layoutId && layout === this.state.layout) {
      return;
    }
    this.commit({ ...this.state, layoutId, layout });
  }

  /**
   * Applies a layout updater, typically a layout-engine reducer.
   *
   * Does nothing until a layout is applied. The updater must return the same
   * reference when nothing changes; the store
   * then keeps the previous snapshot and notifies nobody, which prevents render
   * churn in panels that re-derive on every notification.
   */
  updateLayout(updater: (layout: LayoutState) => LayoutState): void {
    const current = this.state.layout;
    if (current === undefined) {
      return;
    }
    const next = updater(current);
    if (next === current) {
      return;
    }
    this.commit({ ...this.state, layout: next });
  }

  /** Opens a menu. Re-opening the exact same menu is a no-op. */
  openMenu(menu: OpenMenuState): void {
    const current = this.state.menu;
    if (
      current !== undefined &&
      current.kind === menu.kind &&
      current.targetKind === menu.targetKind &&
      current.targetId === menu.targetId &&
      current.position.x === menu.position.x &&
      current.position.y === menu.position.y
    ) {
      return;
    }
    this.commit({ ...this.state, menu });
  }

  /** Closes the open menu, if any. */
  closeMenu(): void {
    if (this.state.menu === undefined) {
      return;
    }
    this.commit({ ...this.state, menu: undefined });
  }

  /** Replaces the search query. */
  setSearchQuery(searchQuery: string): void {
    if (searchQuery === this.state.searchQuery) {
      return;
    }
    this.commit({ ...this.state, searchQuery });
  }

  /** Switches the editor interaction mode. */
  setInteractionMode(interactionMode: InteractionMode): void {
    if (interactionMode === this.state.interactionMode) {
      return;
    }
    this.commit({ ...this.state, interactionMode });
  }

  /** Marks a panel as focused, or clears the focus with `undefined`. */
  setActivePanel(activePanelId: string | undefined): void {
    if (activePanelId === this.state.activePanelId) {
      return;
    }
    this.commit({ ...this.state, activePanelId });
  }

  private commit(next: UiState): void {
    this.state = next;
    for (const listener of [...this.listeners]) {
      listener(next);
    }
  }
}
