import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { EditorEngine } from "@nodera/application";
import type { MenuTargetKind, ToolDefinition, UiStateStore } from "@nodera/ui-core";

import { DEFAULT_TOOLS } from "../../defaults/default-tools.js";
import { ContextMenu } from "./context-menu.js";
import {
  addActionNode,
  createActionEditor,
  createActionStore,
  createToolRegistry,
  renderWithUi,
  selectActionNode,
} from "./test-helpers.js";

afterEach(cleanup);

const TARGET_TOOLS: readonly ToolDefinition[] = Object.freeze([
  { id: "acme.always", label: "Always", command: { kind: "validate" } },
  { id: "acme.undo", label: "Undo", availability: "undo-available", command: { kind: "undo" } },
  {
    id: "acme.clipboard",
    label: "Paste",
    availability: "clipboard",
    command: { kind: "paste-selection" },
  },
  {
    id: "acme.selection",
    label: "Delete",
    availability: "selection",
    command: { kind: "delete-selection" },
  },
  {
    id: "acme.node-only",
    label: "Node only",
    availability: "node-selection",
    command: { kind: "copy-selection" },
  },
  {
    id: "acme.edge-only",
    label: "Edge only",
    availability: "edge-selection",
    command: { kind: "copy-selection" },
  },
]);

interface RenderMenuOptions {
  readonly targetKind: MenuTargetKind;
  readonly targetId?: string;
  readonly editor?: EditorEngine;
  readonly store?: UiStateStore;
  readonly tools?: readonly ToolDefinition[];
  readonly items?: readonly ToolDefinition[];
}

function renderMenu(options: RenderMenuOptions) {
  const store = options.store ?? createActionStore();
  const result = renderWithUi(
    <ContextMenu {...(options.items === undefined ? {} : { items: options.items })} />,
    {
      store,
      editor: options.editor ?? createActionEditor(),
      ...(options.tools === undefined
        ? {}
        : { toolRegistry: createToolRegistry(options.tools) }),
    },
  );
  act(() => {
    store.openMenu({
      kind: "context",
      targetKind: options.targetKind,
      targetId: options.targetId ?? "",
      position: { x: 12, y: 34 },
    });
  });
  return { ...result, store };
}

function required<T extends Element>(component: HTMLElement, selector: string): T {
  const element = component.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}

function itemIds(container: HTMLElement): readonly (string | null)[] {
  return [...container.querySelectorAll("[data-nodera-menu-item]")].map((element) =>
    element.getAttribute("data-nodera-menu-item"),
  );
}

function menuItem(container: HTMLElement, toolId: string): HTMLButtonElement {
  const element = container.querySelector<HTMLButtonElement>(
    `[data-nodera-menu-item="${toolId}"]`,
  );
  if (element === null) {
    throw new Error(`missing menu item: ${toolId}`);
  }
  return element;
}

describe("ContextMenu", () => {
  it("renders nothing while no menu is open", () => {
    const { container } = renderWithUi(<ContextMenu />, { editor: createActionEditor() });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelectorAll("[data-nodera-context-menu]")).toHaveLength(0);
  });

  it("renders the open menu at the pointer position of the ui state", () => {
    const { container } = renderMenu({ targetKind: "node", targetId: "node-1" });

    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    if (menu === null) {
      throw new Error("missing menu");
    }
    expect(menu.getAttribute("data-nodera-context-target")).toBe("node");
    expect(menu.getAttribute("data-nodera-context-id")).toBe("node-1");
    expect(menu.style.position).toBe("fixed");
    expect(menu.style.left).toBe("12px");
    expect(menu.style.top).toBe("34px");
    expect(menuItem(container, "tool.validate").getAttribute("role")).toBe("menuitem");
  });

  it("offers a node target the node and selection tools but not clipboard or undo tools", () => {
    const { container } = renderMenu({ targetKind: "node", tools: TARGET_TOOLS });

    expect(itemIds(container)).toEqual([
      "acme.always",
      "acme.selection",
      "acme.node-only",
    ]);
  });

  it("offers an edge target the edge and selection tools but not node tools", () => {
    const { container } = renderMenu({ targetKind: "edge", tools: TARGET_TOOLS });

    expect(itemIds(container)).toEqual([
      "acme.always",
      "acme.selection",
      "acme.edge-only",
    ]);
  });

  it("offers pane and canvas targets only the unconditional tools", () => {
    const pane = renderMenu({ targetKind: "pane", tools: TARGET_TOOLS });
    expect(itemIds(pane.container)).toEqual(["acme.always"]);
    expect(
      pane.container.querySelector("[data-nodera-context-menu]")?.getAttribute(
        "data-nodera-context-target",
      ),
    ).toBe("pane");
    cleanup();

    const canvas = renderMenu({ targetKind: "canvas", tools: TARGET_TOOLS });
    expect(itemIds(canvas.container)).toEqual(["acme.always"]);
  });

  it("renders unavailable items disabled instead of hiding them", () => {
    const { container } = renderMenu({ targetKind: "node", tools: TARGET_TOOLS });

    expect(menuItem(container, "acme.selection").disabled).toBe(true);
    expect(menuItem(container, "acme.node-only").disabled).toBe(true);
    expect(menuItem(container, "acme.always").disabled).toBe(false);
  });

  it("enables the tools the current selection satisfies", () => {
    const editor = createActionEditor();
    addActionNode(editor, { nodeId: "node-1" });
    selectActionNode(editor, "node-1");

    const { container } = renderMenu({ targetKind: "node", tools: TARGET_TOOLS, editor });

    expect(menuItem(container, "acme.selection").disabled).toBe(false);
    expect(menuItem(container, "acme.node-only").disabled).toBe(false);
    expect(container.querySelector('[data-nodera-menu-item="acme.edge-only"]')).toBeNull();
  });

  it("runs the item command and closes the menu", () => {
    const editor = createActionEditor();
    addActionNode(editor, { nodeId: "node-1" });
    selectActionNode(editor, "node-1");
    const { container, store } = renderMenu({
      targetKind: "node",
      targetId: "node-1",
      tools: DEFAULT_TOOLS,
      editor,
    });

    fireEvent.click(menuItem(container, "tool.delete"));

    expect(editor.getNode("node-1")).toBeUndefined();
    expect(store.getState().menu).toBeUndefined();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("closes on Escape", () => {
    const { container, store } = renderMenu({ targetKind: "pane" });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(store.getState().menu).toBeUndefined();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("closes on an outside pointerdown and stays open on an inside one", () => {
    const { container, store } = renderMenu({ targetKind: "pane" });

    fireEvent.pointerDown(menuItem(container, "tool.validate"));
    expect(store.getState().menu).not.toBeUndefined();

    fireEvent.pointerDown(document.body);
    expect(store.getState().menu).toBeUndefined();
  });

  it("stops listening after it closed or unmounted", () => {
    const store = createActionStore();
    const { container, unmount } = renderMenu({ targetKind: "pane", store });
    unmount();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.pointerDown(document.body);

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(store.getState().menu).not.toBeUndefined();
  });

  it("focuses the first enabled item when the menu opens", () => {
    const focusTools: readonly ToolDefinition[] = Object.freeze([
      {
        id: "acme.first",
        label: "First",
        availability: "selection",
        command: { kind: "copy-selection" },
      },
      { id: "acme.second", label: "Second", command: { kind: "validate" } },
    ]);

    const unavailable = renderMenu({ targetKind: "node", tools: focusTools });
    expect(menuItem(unavailable.container, "acme.first").disabled).toBe(true);
    expect(document.activeElement).toBe(menuItem(unavailable.container, "acme.second"));
    cleanup();

    const editor = createActionEditor();
    addActionNode(editor, { nodeId: "node-1" });
    selectActionNode(editor, "node-1");
    const available = renderMenu({ targetKind: "node", tools: focusTools, editor });
    expect(document.activeElement).toBe(menuItem(available.container, "acme.first"));
  });

  it("reports an empty menu when no tool fits the target", () => {
    const { container } = renderMenu({
      targetKind: "pane",
      tools: [
        {
          id: "acme.paste",
          label: "Paste",
          availability: "clipboard",
          command: { kind: "paste-selection" },
        },
      ],
    });

    expect(itemIds(container)).toEqual([]);
    expect(required(container, "[data-nodera-context-menu-empty]").textContent).toBe("No actions");
  });

  it("renders host-provided items without filtering them by target", () => {
    const { container } = renderMenu({
      targetKind: "pane",
      items: [
        {
          id: "acme.paste",
          label: "Paste",
          availability: "clipboard",
          command: { kind: "paste-selection" },
        },
      ],
    });

    expect(itemIds(container)).toEqual(["acme.paste"]);
  });
});
