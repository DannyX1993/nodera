import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EDITOR_LAYOUT_ID } from "@nodera/layout-engine";
import { DARK_THEME_ID, DEFAULT_THEME_ID } from "@nodera/theme-engine";
import { UiStateStore, type OpenMenuState } from "@nodera/ui-core";

import { NoderaUiProvider, useUiState } from "../providers/ui-provider.js";
import { useUiStateActions } from "./ui-state-actions.js";

afterEach(cleanup);

function createStore(): UiStateStore {
  return new UiStateStore({ themeId: DEFAULT_THEME_ID, layoutId: EDITOR_LAYOUT_ID });
}

function wrapperFor(store: UiStateStore) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <NoderaUiProvider store={store}>{children}</NoderaUiProvider>;
  };
}

const MENU: OpenMenuState = {
  kind: "context",
  targetKind: "node",
  targetId: "n1",
  position: { x: 10, y: 20 },
};

function ActionsProbe() {
  const state = useUiState();
  const actions = useUiStateActions();
  return (
    <>
      <span data-testid="theme">{state.themeId}</span>
      <span data-testid="query">{state.searchQuery}</span>
      <span data-testid="mode">{state.interactionMode}</span>
      <span data-testid="active-panel">{state.activePanelId ?? "none"}</span>
      <span data-testid="menu">{state.menu?.targetId ?? "none"}</span>
      <button type="button" data-testid="set-theme" onClick={() => actions.setTheme(DARK_THEME_ID)} />
      <button type="button" data-testid="set-query" onClick={() => actions.setSearchQuery("needle")} />
      <button type="button" data-testid="set-mode" onClick={() => actions.setInteractionMode("pan")} />
      <button type="button" data-testid="set-active" onClick={() => actions.setActivePanel("palette")} />
      <button type="button" data-testid="open-menu" onClick={() => actions.openMenu(MENU)} />
      <button type="button" data-testid="close-menu" onClick={() => actions.closeMenu()} />
    </>
  );
}

describe("useUiStateActions", () => {
  it("delegates every action to the ui store", () => {
    const store = createStore();

    render(
      <NoderaUiProvider store={store}>
        <ActionsProbe />
      </NoderaUiProvider>,
    );

    fireEvent.click(screen.getByTestId("set-theme"));
    expect(store.getState().themeId).toBe(DARK_THEME_ID);
    expect(screen.getByTestId("theme").textContent).toBe(DARK_THEME_ID);

    fireEvent.click(screen.getByTestId("set-query"));
    expect(store.getState().searchQuery).toBe("needle");
    expect(screen.getByTestId("query").textContent).toBe("needle");

    fireEvent.click(screen.getByTestId("set-mode"));
    expect(store.getState().interactionMode).toBe("pan");
    expect(screen.getByTestId("mode").textContent).toBe("pan");

    fireEvent.click(screen.getByTestId("set-active"));
    expect(store.getState().activePanelId).toBe("palette");

    fireEvent.click(screen.getByTestId("open-menu"));
    expect(store.getState().menu).toEqual(MENU);
    expect(screen.getByTestId("menu").textContent).toBe("n1");

    fireEvent.click(screen.getByTestId("close-menu"));
    expect(store.getState().menu).toBeUndefined();
    expect(screen.getByTestId("menu").textContent).toBe("none");
  });

  it("re-renders state consumers on a store change", () => {
    const store = createStore();
    render(
      <NoderaUiProvider store={store}>
        <ActionsProbe />
      </NoderaUiProvider>,
    );

    act(() => {
      store.setInteractionMode("pan");
    });

    expect(screen.getByTestId("mode").textContent).toBe("pan");
  });

  it("keeps the actions object stable across renders", () => {
    const store = createStore();
    const seen: unknown[] = [];

    function IdentityProbe() {
      const actions = useUiStateActions();
      const state = useUiState();
      seen.push(actions);
      return <span data-testid="query">{state.searchQuery}</span>;
    }

    render(
      <NoderaUiProvider store={store}>
        <IdentityProbe />
      </NoderaUiProvider>,
    );
    act(() => {
      store.setSearchQuery("x");
    });

    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]).toBe(seen[seen.length - 1]);
  });
});
