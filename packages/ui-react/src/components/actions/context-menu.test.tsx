import { act, cleanup, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { EditorEngine } from "@nodera/application";
import type { MenuTargetKind, ToolDefinition, UiStateStore } from "@nodera/ui-core";

import { DEFAULT_TOOLS } from "../../defaults/default-tools.js";
import {
  createComponentRenderers,
  type ComponentRenderers,
  type MenuRendererProps,
} from "../../registries/component-registry.js";
import { ContextMenu, DEFAULT_MENU_RENDERER_ID } from "./context-menu.js";
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
  readonly renderers?: ComponentRenderers;
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
      ...(options.renderers === undefined ? {} : { renderers: options.renderers }),
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

/**
 * Host-authored menu renderer of this suite.
 *
 * It renders the props of `MenuRendererProps` as data attributes so the tests
 * can assert the complete contract, and exposes one button per action it needs:
 * a real command and a plain close.
 */
function BrandMenu(props: MenuRendererProps): ReactNode {
  return (
    <div
      data-testid="brand-menu"
      data-items={props.items.map((tool) => tool.id).join(",")}
      data-kind={props.kind}
      data-target-kind={props.targetKind}
      data-position={`${props.position.x},${props.position.y}`}
      data-can-undo={String(props.availability.canUndo)}
      data-selected-nodes={String(props.availability.selectedNodeCount)}
      data-selected-edges={String(props.availability.selectedEdgeCount)}
      data-clipboard={String(props.availability.clipboardSize)}
    >
      <button
        type="button"
        data-testid="brand-undo"
        onClick={() => {
          props.onCommand({ kind: "undo" });
        }}
      >
        Undo
      </button>
      <button type="button" data-testid="brand-close" onClick={props.onClose}>
        Close
      </button>
    </div>
  );
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

describe("ContextMenu menu renderer replacement", () => {
  it("keeps the built-in item list while no menu renderer is registered", () => {
    const renderers = createComponentRenderers();
    expect(renderers.menus.size).toBe(0);

    const { container } = renderMenu({ targetKind: "node", tools: TARGET_TOOLS, renderers });

    expect(itemIds(container)).toEqual(["acme.always", "acme.selection", "acme.node-only"]);
    expect(required(container, '[role="menu"]').getAttribute("data-nodera-context-target")).toBe(
      "node",
    );
    expect(menuItem(container, "acme.always").getAttribute("role")).toBe("menuitem");
  });

  it("renders the registered menu renderer inside the positioned menu root", () => {
    const renderers = createComponentRenderers();
    renderers.menus.replace(DEFAULT_MENU_RENDERER_ID, BrandMenu);

    const { container } = renderMenu({
      targetKind: "node",
      targetId: "node-1",
      tools: TARGET_TOOLS,
      renderers,
    });

    const custom = required(container, '[data-testid="brand-menu"]');
    expect(itemIds(container)).toEqual([]);
    const root = required<HTMLElement>(container, "[data-nodera-context-menu]");
    expect(root.contains(custom)).toBe(true);
    expect(root.getAttribute("role")).toBe("menu");
    expect(root.getAttribute("data-nodera-context-target")).toBe("node");
    expect(root.getAttribute("data-nodera-context-id")).toBe("node-1");
    expect(root.style.position).toBe("fixed");
    expect(root.style.left).toBe("12px");
    expect(root.style.top).toBe("34px");
  });

  it("hands the custom renderer the target-shaped items and the live menu state", () => {
    const editor = createActionEditor();
    addActionNode(editor, { nodeId: "node-1" });
    selectActionNode(editor, "node-1");
    const renderers = createComponentRenderers();
    renderers.menus.register(DEFAULT_MENU_RENDERER_ID, BrandMenu);

    const node = renderMenu({
      targetKind: "node",
      targetId: "node-1",
      tools: TARGET_TOOLS,
      editor,
      renderers,
    });
    const menu = required(node.container, '[data-testid="brand-menu"]');
    expect(menu.getAttribute("data-items")).toBe("acme.always,acme.selection,acme.node-only");
    expect(menu.getAttribute("data-kind")).toBe("context");
    expect(menu.getAttribute("data-target-kind")).toBe("node");
    expect(menu.getAttribute("data-position")).toBe("12,34");
    expect(menu.getAttribute("data-can-undo")).toBe("true");
    expect(menu.getAttribute("data-selected-nodes")).toBe("1");
    expect(menu.getAttribute("data-selected-edges")).toBe("0");
    expect(menu.getAttribute("data-clipboard")).toBe("0");
    cleanup();

    const edge = renderMenu({ targetKind: "edge", tools: TARGET_TOOLS, renderers });
    expect(
      required(edge.container, '[data-testid="brand-menu"]').getAttribute("data-items"),
    ).toBe("acme.always,acme.selection,acme.edge-only");
    expect(
      required(edge.container, '[data-testid="brand-menu"]').getAttribute("data-target-kind"),
    ).toBe("edge");
    cleanup();

    // The `items` option keeps overriding the registry tools on the custom path.
    const hostItems = renderMenu({
      targetKind: "pane",
      items: [{ id: "acme.host-item", label: "Host item", command: { kind: "validate" } }],
      renderers,
    });
    expect(
      required(hostItems.container, '[data-testid="brand-menu"]').getAttribute("data-items"),
    ).toBe("acme.host-item");
  });

  it("runs the command the custom renderer dispatches and closes the menu", () => {
    const editor = createActionEditor();
    addActionNode(editor, { nodeId: "node-1" });
    addActionNode(editor, { nodeId: "node-2" });
    const renderers = createComponentRenderers();
    renderers.menus.register(DEFAULT_MENU_RENDERER_ID, BrandMenu);

    const { container, store } = renderMenu({ targetKind: "pane", editor, renderers });
    expect(editor.graph.nodeCount).toBe(2);

    fireEvent.click(required(container, '[data-testid="brand-undo"]'));

    expect(editor.graph.getNodes().map((node) => node.id)).toEqual(["node-1"]);
    expect(store.getState().menu).toBeUndefined();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("closes without touching the editor when the custom renderer calls onClose", () => {
    const editor = createActionEditor();
    addActionNode(editor, { nodeId: "node-1" });
    const renderers = createComponentRenderers();
    renderers.menus.register(DEFAULT_MENU_RENDERER_ID, BrandMenu);

    const { container, store } = renderMenu({ targetKind: "pane", editor, renderers });
    const historySize = editor.history.size();

    fireEvent.click(required(container, '[data-testid="brand-close"]'));

    expect(store.getState().menu).toBeUndefined();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(editor.graph.nodeCount).toBe(1);
    expect(editor.history.size()).toBe(historySize);
  });

  it("closes on Escape and on an outside pointerdown with a custom renderer mounted", () => {
    const renderers = createComponentRenderers();
    renderers.menus.register(DEFAULT_MENU_RENDERER_ID, BrandMenu);

    const escape = renderMenu({ targetKind: "pane", renderers });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(escape.store.getState().menu).toBeUndefined();
    expect(escape.container.querySelector('[role="menu"]')).toBeNull();
    cleanup();

    const pointer = renderMenu({ targetKind: "pane", renderers });
    fireEvent.pointerDown(required(pointer.container, '[data-testid="brand-menu"]'));
    expect(pointer.store.getState().menu).not.toBeUndefined();
    fireEvent.pointerDown(document.body);
    expect(pointer.store.getState().menu).toBeUndefined();
  });

  it("honours the rendererId prop of the surface", () => {
    const renderers = createComponentRenderers();
    renderers.menus.register(DEFAULT_MENU_RENDERER_ID, BrandMenu);
    renderers.menus.register("acme.menu.other", function OtherMenu(): ReactNode {
      return <div data-testid="other-menu" />;
    });
    const store = createActionStore();

    const { container } = renderWithUi(<ContextMenu rendererId="acme.menu.other" />, {
      store,
      editor: createActionEditor(),
      renderers,
    });
    act(() => {
      store.openMenu({
        kind: "context",
        targetKind: "pane",
        targetId: "",
        position: { x: 1, y: 2 },
      });
    });

    expect(required(container, '[data-testid="other-menu"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="brand-menu"]')).toBeNull();
  });
});

describe("ContextMenu pointer interaction", () => {
  it("opts into pointer events so a menu rendered inside a pointer-transparent overlay stays clickable", () => {
    // Regression pin: CanvasContainer renders overlays with `pointer-events: none`
    // and overlay content must opt in; without this the menu is visible but blind.
    const { container } = renderMenu({ targetKind: "pane" });

    const root = container.querySelector<HTMLElement>("[data-nodera-context-menu]");
    expect(root).not.toBeNull();
    expect(root?.style.pointerEvents).toBe("auto");
  });

  it("highlights the hovered item and clears the highlight when the pointer leaves", () => {
    const tools: readonly ToolDefinition[] = [
      { id: "acme.first", label: "First", command: { kind: "validate" } },
      { id: "acme.second", label: "Second", command: { kind: "validate" } },
    ];
    const { container } = renderMenu({ targetKind: "pane", tools });

    const first = container.querySelector<HTMLButtonElement>('[data-nodera-menu-item="acme.first"]');
    const second = container.querySelector<HTMLButtonElement>('[data-nodera-menu-item="acme.second"]');
    expect(second).not.toBeNull();
    // The menu focuses its first enabled item on open, so only that one is
    // highlighted before any pointer movement.
    expect(first?.getAttribute("data-nodera-menu-item-hovered")).not.toBeNull();
    expect(second?.getAttribute("data-nodera-menu-item-hovered")).toBeNull();

    fireEvent.pointerEnter(second as HTMLButtonElement);
    expect(second?.getAttribute("data-nodera-menu-item-hovered")).not.toBeNull();
    expect((second as HTMLButtonElement).style.backgroundColor).toContain(
      "var(--ndr-colors-surface-alt",
    );

    fireEvent.pointerLeave(second as HTMLButtonElement);
    expect(second?.getAttribute("data-nodera-menu-item-hovered")).toBeNull();
  });

  it("highlights the focused item for keyboard users", () => {
    const { container } = renderMenu({ targetKind: "pane", tools: TARGET_TOOLS });

    const item = container.querySelector<HTMLButtonElement>('[data-nodera-menu-item="acme.always"]');

    fireEvent.focus(item as HTMLButtonElement);
    expect(item?.getAttribute("data-nodera-menu-item-hovered")).not.toBeNull();

    fireEvent.blur(item as HTMLButtonElement);
    expect(item?.getAttribute("data-nodera-menu-item-hovered")).toBeNull();
  });
});
