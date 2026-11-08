import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EDITOR_LAYOUT_ID } from "@nodera/layout-engine";
import { DEFAULT_THEME_ID } from "@nodera/theme-engine";
import { DialogRegistry, UiStateStore, type DialogDefinition } from "@nodera/ui-core";

import { NoderaUiProvider, useUiState } from "../providers/ui-provider.js";
import { useDialogActions } from "./dialog-actions.js";

afterEach(cleanup);

const CREATE_NODE: DialogDefinition = {
  id: "acme.dialog.create-node",
  title: "Create node",
};

function createStore(): UiStateStore {
  const dialogRegistry = new DialogRegistry();
  dialogRegistry.register(CREATE_NODE);
  return new UiStateStore({
    themeId: DEFAULT_THEME_ID,
    layoutId: EDITOR_LAYOUT_ID,
    dialogRegistry,
  });
}

function DialogProbe() {
  const state = useUiState();
  const dialogs = useDialogActions();
  return (
    <>
      <span data-testid="active-dialog">{state.activeDialogId ?? "none"}</span>
      <button
        type="button"
        data-testid="open"
        onClick={() => dialogs.open("acme.dialog.create-node")}
      />
      <button
        type="button"
        data-testid="open-unknown"
        onClick={() => dialogs.open("acme.dialog.missing")}
      />
      <button type="button" data-testid="close" onClick={() => dialogs.close()} />
    </>
  );
}

function wrapperFor(store: UiStateStore) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <NoderaUiProvider store={store}>{children}</NoderaUiProvider>;
  };
}

describe("useDialogActions", () => {
  it("opens and closes the dialog through the ui store", () => {
    const store = createStore();
    render(<DialogProbe />, { wrapper: wrapperFor(store) });

    fireEvent.click(screen.getByTestId("open"));
    expect(store.getState().activeDialogId).toBe("acme.dialog.create-node");
    expect(screen.getByTestId("active-dialog").textContent).toBe("acme.dialog.create-node");

    fireEvent.click(screen.getByTestId("close"));
    expect(store.getState().activeDialogId).toBeUndefined();
    expect(screen.getByTestId("active-dialog").textContent).toBe("none");
  });

  it("leaves the state untouched when the store refuses an unknown dialog id", () => {
    const store = createStore();
    render(<DialogProbe />, { wrapper: wrapperFor(store) });

    fireEvent.click(screen.getByTestId("open-unknown"));

    expect(store.getState().activeDialogId).toBeUndefined();
    expect(screen.getByTestId("active-dialog").textContent).toBe("none");
  });

  it("re-renders state consumers on a store change", () => {
    const store = createStore();
    render(<DialogProbe />, { wrapper: wrapperFor(store) });

    act(() => {
      store.openDialog("acme.dialog.create-node");
    });

    expect(screen.getByTestId("active-dialog").textContent).toBe("acme.dialog.create-node");
  });

  it("keeps the actions object stable across renders", () => {
    const store = createStore();
    const seen: unknown[] = [];

    function IdentityProbe() {
      const actions = useDialogActions();
      const state = useUiState();
      seen.push(actions);
      return <span data-testid="active-dialog">{state.activeDialogId ?? "none"}</span>;
    }

    render(<IdentityProbe />, { wrapper: wrapperFor(store) });
    act(() => {
      store.openDialog("acme.dialog.create-node");
    });

    expect(seen.length).toBeGreaterThan(1);
    expect(seen[0]).toBe(seen[seen.length - 1]);
  });
});
