import { describe, expect, it } from "vitest";

import {
  UiStateStore,
  type ConnectionsPolicy,
  type DragPolicy,
  type NodeTransition,
  type PortsPolicy,
} from "./ui-state.js";
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
      pendingEdgeInsertId: undefined,
      pendingAppendAnchorId: undefined,
      pendingBranchInsertId: undefined,
      dragPolicy: "free",
      nodeTransition: "instant",
      connections: "editable",
      ports: "visible",
    });
  });

  it("records the anchor of a phantom append session and notifies once per change", () => {
    const store = createStore();
    const seen: (string | undefined)[] = [];
    store.subscribe((state) => seen.push(state.pendingAppendAnchorId));

    store.setPendingAppendAnchorId("node-1");
    store.setPendingAppendAnchorId("node-1");

    expect(store.getState().pendingAppendAnchorId).toBe("node-1");
    expect(seen).toEqual(["node-1"]);

    store.setPendingAppendAnchorId(undefined);

    expect(store.getState().pendingAppendAnchorId).toBeUndefined();
    expect(seen).toEqual(["node-1", undefined]);
  });

  it("clears the pending append anchor together with the pending edge when the dialog closes", () => {
    const store = createDialogStore();
    store.setPendingAppendAnchorId("node-1");
    store.setPendingEdgeInsertId("edge-1");
    store.openDialog("acme.dialog.create-node");
    let notifications = 0;
    store.subscribe(() => notifications++);

    store.closeDialog();

    expect(store.getState().activeDialogId).toBeUndefined();
    expect(store.getState().pendingEdgeInsertId).toBeUndefined();
    expect(store.getState().pendingAppendAnchorId).toBeUndefined();
    // One commit: a closed dialog never leaves half of its session behind.
    expect(notifications).toBe(1);
  });

  it("ends a phantom append session whose dialog was already closed", () => {
    const store = createStore();
    store.setPendingAppendAnchorId("node-1");

    store.closeDialog();

    expect(store.getState().pendingAppendAnchorId).toBeUndefined();
  });

  it("records the edge an insertion is pending for and notifies once per change", () => {
    const store = createStore();
    const seen: (string | undefined)[] = [];
    store.subscribe((state) => seen.push(state.pendingEdgeInsertId));

    store.setPendingEdgeInsertId("edge-1");
    store.setPendingEdgeInsertId("edge-1");

    expect(store.getState().pendingEdgeInsertId).toBe("edge-1");
    expect(seen).toEqual(["edge-1"]);

    store.setPendingEdgeInsertId(undefined);

    expect(store.getState().pendingEdgeInsertId).toBeUndefined();
    expect(seen).toEqual(["edge-1", undefined]);
  });

  it("clears the pending edge insertion when the dialog closes", () => {
    const store = createDialogStore();
    store.setPendingEdgeInsertId("edge-1");
    store.openDialog("acme.dialog.create-node");

    store.closeDialog();

    expect(store.getState().activeDialogId).toBeUndefined();
    expect(store.getState().pendingEdgeInsertId).toBeUndefined();
  });

  it("keeps the pending edge insertion while its dialog is open", () => {
    const store = createDialogStore();

    store.setPendingEdgeInsertId("edge-1");
    store.openDialog("acme.dialog.create-node");

    expect(store.getState().pendingEdgeInsertId).toBe("edge-1");
  });

  it("records the node a branching insertion is pending for and notifies once per change", () => {
    const store = createStore();
    const seen: (string | undefined)[] = [];
    store.subscribe((state) => seen.push(state.pendingBranchInsertId));

    store.setPendingBranchInsertId("node-1");
    store.setPendingBranchInsertId("node-1");

    expect(store.getState().pendingBranchInsertId).toBe("node-1");
    expect(seen).toEqual(["node-1"]);

    store.setPendingBranchInsertId(undefined);

    expect(store.getState().pendingBranchInsertId).toBeUndefined();
    expect(seen).toEqual(["node-1", undefined]);
  });

  it("clears the pending branch insertion together with every other session when the dialog closes", () => {
    const store = createDialogStore();
    store.setPendingBranchInsertId("node-1");
    store.setPendingEdgeInsertId("edge-1");
    store.setPendingAppendAnchorId("node-2");
    store.openDialog("acme.dialog.create-node");
    let notifications = 0;
    store.subscribe(() => notifications++);

    store.closeDialog();

    expect(store.getState().pendingBranchInsertId).toBeUndefined();
    expect(store.getState().pendingEdgeInsertId).toBeUndefined();
    expect(store.getState().pendingAppendAnchorId).toBeUndefined();
    // One commit: a closed dialog never leaves half of its session behind.
    expect(notifications).toBe(1);
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

  it("seeds the node transition the host declares", () => {
    const store = new UiStateStore({
      themeId: "nodera.light",
      layoutId: "nodera.editor",
      layout: emptyLayout,
      nodeTransition: "animated",
    });

    expect(store.getState().nodeTransition).toBe("animated");
  });

  it("keeps an instant node transition by default, today's behaviour", () => {
    expect(createStore().getState().nodeTransition).toBe("instant");
  });

  it("changes the node transition and notifies its subscribers once", () => {
    const store = createStore();
    const seen: NodeTransition[] = [];
    store.subscribe((state) => seen.push(state.nodeTransition));

    store.setNodeTransition("animated");

    expect(store.getState().nodeTransition).toBe("animated");
    expect(seen).toEqual(["animated"]);
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

describe("UiStateStore connections and ports policies", () => {
  it("defaults to editable connections and visible ports", () => {
    const state = createStore().getState();

    expect(state.connections).toBe("editable");
    expect(state.ports).toBe("visible");
  });

  it("seeds the policies the host declares", () => {
    const store = new UiStateStore({
      themeId: "nodera.light",
      layoutId: "nodera.editor",
      layout: emptyLayout,
      connections: "fixed",
      ports: "hidden",
    });

    expect(store.getState().connections).toBe("fixed");
    expect(store.getState().ports).toBe("hidden");
  });

  it("changes the connections policy and notifies its subscribers once", () => {
    const store = createStore();
    const seen: ConnectionsPolicy[] = [];
    store.subscribe((state) => seen.push(state.connections));

    store.setConnections("fixed");

    expect(store.getState().connections).toBe("fixed");
    expect(seen).toEqual(["fixed"]);
  });

  it("notifies nobody when the connections policy already matches", () => {
    const store = createStore();
    const before = store.getState();
    let notifications = 0;
    store.subscribe(() => notifications++);

    store.setConnections("editable");

    expect(notifications).toBe(0);
    expect(store.getState()).toBe(before);
  });

  it("changes the ports policy and notifies its subscribers once", () => {
    const store = createStore();
    const seen: PortsPolicy[] = [];
    store.subscribe((state) => seen.push(state.ports));

    store.setPorts("hidden");

    expect(store.getState().ports).toBe("hidden");
    expect(seen).toEqual(["hidden"]);
  });

  it("notifies nobody when the ports policy already matches", () => {
    const store = createStore();
    const before = store.getState();
    let notifications = 0;
    store.subscribe(() => notifications++);

    store.setPorts("visible");

    expect(notifications).toBe(0);
    expect(store.getState()).toBe(before);
  });
});
