import { describe, expect, it } from "vitest";

import { UiStateStore, type DragPolicy } from "./ui-state.js";
import type { LayoutState } from "./layout.js";
import { DialogRegistry } from "./dialog-registry.js";
import type { DialogDefinition } from "./dialog-definition.js";

const emptyLayout: LayoutState = { panels: [] };

const layoutA: LayoutState = {
  panels: [
    { panelId: "palette", region: "left", visible: true, size: 240 },
    { panelId: "validation", region: "bottom", visible: false, size: 160 },
  ],
};

function createStore() {
  return new UiStateStore({
    themeId: "nodera.light",
    layoutId: "nodera.editor",
    layout: emptyLayout,
  });
}

const createNodeDialog: DialogDefinition = {
  id: "acme.dialog.create-node",
  title: "Create node",
};

function dialogRegistry(): DialogRegistry {
  const registry = new DialogRegistry();
  registry.register(createNodeDialog);
  return registry;
}

function createDialogStore(dialogs: DialogRegistry | null = dialogRegistry()) {
  return new UiStateStore({
    themeId: "nodera.light",
    layoutId: "nodera.editor",
    layout: emptyLayout,
    ...(dialogs === null ? {} : { dialogRegistry: dialogs }),
  });
}

describe("UiStateStore", () => {
  it("exposes the initial UI state with documented defaults", () => {
    const store = createStore();

    expect(store.getState()).toEqual({
      themeId: "nodera.light",
      layoutId: "nodera.editor",
      layout: emptyLayout,
      menu: undefined,
      searchQuery: "",
      interactionMode: "select",
      activePanelId: undefined,
      activeDialogId: undefined,
      dragPolicy: "free",
    });
  });

  it("seeds the drag policy the host declares", () => {
    const store = new UiStateStore({
      themeId: "nodera.light",
      layoutId: "nodera.editor",
      layout: emptyLayout,
      dragPolicy: "snap-back",
    });

    expect(store.getState().dragPolicy).toBe("snap-back");
  });

  it("changes the drag policy and notifies its subscribers once", () => {
    const store = createStore();
    const seen: DragPolicy[] = [];
    store.subscribe((state) => seen.push(state.dragPolicy));

    store.setDragPolicy("locked");

    expect(store.getState().dragPolicy).toBe("locked");
    expect(seen).toEqual(["locked"]);
  });

  it("notifies nobody when the drag policy already matches", () => {
    const store = createStore();
    const before = store.getState();
    let notifications = 0;
    store.subscribe(() => notifications++);

    store.setDragPolicy("free");

    expect(notifications).toBe(0);
    expect(store.getState()).toBe(before);
  });

  it("returns a stable snapshot while nothing changes", () => {
    const store = createStore();

    expect(store.getState()).toBe(store.getState());
  });

  it("notifies subscribers on a real change and stops after unsubscribe", () => {
    const store = createStore();
    const seen: string[] = [];
    const unsubscribe = store.subscribe((state) => seen.push(state.themeId));

    store.setTheme("nodera.dark");
    expect(seen).toEqual(["nodera.dark"]);
    expect(store.getState().themeId).toBe("nodera.dark");

    unsubscribe();
    store.setTheme("nodera.light");
    expect(seen).toEqual(["nodera.dark"]);
  });

  it("does not notify nor rebuild state when the value already matches", () => {
    const store = createStore();
    const before = store.getState();
    let notifications = 0;
    store.subscribe(() => notifications++);

    store.setTheme("nodera.light");
    store.setSearchQuery("");
    store.setInteractionMode("select");
    store.closeMenu();

    expect(notifications).toBe(0);
    expect(store.getState()).toBe(before);
  });

  it("switches the applied layout together with its id and panel state", () => {
    const store = createStore();

    store.setLayout("nodera.canvas-only", layoutA);

    expect(store.getState().layoutId).toBe("nodera.canvas-only");
    expect(store.getState().layout).toBe(layoutA);
  });

  it("applies a layout updater and keeps the previous layout untouched", () => {
    const store = createStore();
    store.setLayout("nodera.editor", layoutA);

    store.updateLayout((layout) => ({
      panels: layout.panels.map((panel) =>
        panel.panelId === "validation" ? { ...panel, visible: true } : panel,
      ),
    }));

    expect(store.getState().layout?.panels[1]?.visible).toBe(true);
    expect(store.getState().layout?.panels[0]).toBe(layoutA.panels[0]);
    expect(layoutA.panels[1]?.visible).toBe(false);
  });

  it("leaves the layout untouched when the updater changes nothing", () => {
    const store = createStore();
    store.setLayout("nodera.editor", layoutA);
    const before = store.getState();
    let notifications = 0;
    store.subscribe(() => notifications++);

    store.updateLayout((layout) => layout);

    expect(store.getState()).toBe(before);
    expect(notifications).toBe(0);
  });

  it("opens and closes a context menu with its target and position", () => {
    const store = createStore();

    store.openMenu({ kind: "context", targetKind: "node", targetId: "node-1", position: { x: 10, y: 20 } });

    expect(store.getState().menu).toEqual({
      kind: "context",
      targetKind: "node",
      targetId: "node-1",
      position: { x: 10, y: 20 },
    });

    store.closeMenu();
    expect(store.getState().menu).toBeUndefined();
  });

  it("keeps the search query and interaction mode", () => {
    const store = createStore();

    store.setSearchQuery("http");
    store.setInteractionMode("pan");

    expect(store.getState().searchQuery).toBe("http");
    expect(store.getState().interactionMode).toBe("pan");
  });

  it("tracks the active panel and lets it be cleared", () => {
    const store = createStore();

    store.setActivePanel("properties");
    expect(store.getState().activePanelId).toBe("properties");

    store.setActivePanel(undefined);
    expect(store.getState().activePanelId).toBeUndefined();
  });

  it("opens a registered dialog by id and resolves its definition", () => {
    const store = createDialogStore();

    const opened = store.openDialog("acme.dialog.create-node");

    expect(opened.ok).toBe(true);
    expect(opened.ok && opened.value).toBe(createNodeDialog);
    expect(store.getState().activeDialogId).toBe("acme.dialog.create-node");

    store.closeDialog();
    expect(store.getState().activeDialogId).toBeUndefined();
  });

  it("refuses a dialog id the registry does not know and leaves the state untouched", () => {
    const store = createDialogStore();
    store.openDialog("acme.dialog.create-node");
    const before = store.getState();
    let notifications = 0;
    store.subscribe(() => notifications++);

    const refused = store.openDialog("acme.dialog.missing");

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.kind).toBe("not-found");
    expect(store.getState()).toBe(before);
    expect(store.getState().activeDialogId).toBe("acme.dialog.create-node");
    expect(notifications).toBe(0);
  });

  it("refuses every dialog when the store has no dialog registry", () => {
    const store = createDialogStore(null);

    const refused = store.openDialog("acme.dialog.create-node");

    expect(refused.ok).toBe(false);
    expect(store.getState().activeDialogId).toBeUndefined();
  });

  it("does not notify nor rebuild state when the same dialog is already open", () => {
    const store = createDialogStore();
    store.openDialog("acme.dialog.create-node");
    const before = store.getState();
    let notifications = 0;
    store.subscribe(() => notifications++);

    store.openDialog("acme.dialog.create-node");
    store.closeDialog();
    store.closeDialog();

    expect(notifications).toBe(1);
    expect(before.activeDialogId).toBe("acme.dialog.create-node");
  });

  it("supports several independent subscribers", () => {
    const store = createStore();
    const first: string[] = [];
    const second: string[] = [];
    store.subscribe((state) => first.push(state.searchQuery));
    store.subscribe((state) => second.push(state.searchQuery));

    store.setSearchQuery("edge");

    expect(first).toEqual(["edge"]);
    expect(second).toEqual(["edge"]);
  });
});
