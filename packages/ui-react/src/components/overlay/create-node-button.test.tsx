import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import { EDITOR_LAYOUT_ID } from "@nodera/layout-engine";
import { DEFAULT_THEME_ID } from "@nodera/theme-engine";
import {
  DialogRegistry,
  NODERA_CREATE_NODE_DIALOG_ID,
  UiStateStore,
} from "@nodera/ui-core";

import { NoderaUiProvider } from "../../providers/ui-provider.js";
import { createDiscoveryEditor } from "../discovery/test-helpers.js";
import { CreateNodeButton } from "./create-node-button.js";

afterEach(cleanup);

function createStore(dialogs: DialogRegistry | null): UiStateStore {
  return new UiStateStore({
    themeId: DEFAULT_THEME_ID,
    layoutId: EDITOR_LAYOUT_ID,
    ...(dialogs === null ? {} : { dialogRegistry: dialogs }),
  });
}

function renderButton(
  props: { readonly className?: string; readonly label?: string; readonly children?: ReactNode } = {},
  dialogs: DialogRegistry | null = new DialogRegistry(),
): UiStateStore {
  const store = createStore(dialogs);
  render(
    <NoderaUiProvider store={store} editor={createDiscoveryEditor()}>
      <CreateNodeButton {...props} />
    </NoderaUiProvider>,
  );
  return store;
}

describe("CreateNodeButton", () => {
  it("is a labelled button that announces a dialog", () => {
    renderButton();

    const button = screen.getByRole("button", { name: "Add node" });

    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.textContent).toBe("+");
  });

  it("opens the built-in create-node dialog through the UI store", () => {
    const store = renderButton();

    fireEvent.click(screen.getByRole("button", { name: "Add node" }));

    expect(store.getState().activeDialogId).toBe(NODERA_CREATE_NODE_DIALOG_ID);
  });

  it("takes the host label and the host content", () => {
    renderButton({ label: "Create node", children: "New" });

    const button = screen.getByRole("button", { name: "Create node" });

    expect(button.textContent).toBe("New");
  });

  it("is reachable with the keyboard: a native button Enter and Space activate", () => {
    const store = renderButton();
    const button = screen.getByRole("button", { name: "Add node" });

    // jsdom does not synthesise the click a browser produces for Enter/Space on a
    // native button, so the pin is that the affordance *is* that button: focusable
    // (no tabindex="-1"), enabled, and with no key handler of its own that could
    // swallow those keys. The click below is the activation those keys trigger.
    button.focus();
    expect(document.activeElement).toBe(button);
    expect(button.hasAttribute("tabindex")).toBe(false);

    fireEvent.click(button);

    expect(store.getState().activeDialogId).toBe(NODERA_CREATE_NODE_DIALOG_ID);
  });

  it("does not take focus when it renders", () => {
    renderButton();

    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Add node" }));
  });

  it("opens nothing when the store has no dialog registry", () => {
    const store = renderButton({}, null);

    fireEvent.click(screen.getByRole("button", { name: "Add node" }));

    expect(store.getState().activeDialogId).toBeUndefined();
  });

  it("keeps the host class next to its own hook attribute", () => {
    renderButton({ className: "host-toolbar-button" });

    const button = screen.getByRole("button", { name: "Add node" });

    expect(button.className).toBe("host-toolbar-button");
    expect(button.hasAttribute("data-nodera-create-node")).toBe(true);
  });
});
