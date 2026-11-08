import { cleanup, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ToolDefinition } from "@nodera/ui-core";

import { DEFAULT_TOOLS } from "@nodera/ui-core";
import {
  createComponentRenderers,
  type ToolbarRendererProps,
} from "../../registries/component-registry.js";
import { DEFAULT_TOOLBAR_RENDERER_ID, Toolbar } from "./toolbar.js";
import {
  PLAIN_DEFINITION_ID,
  addActionNode,
  createActionEditor,
  createActionStore,
  createToolRegistry,
  panelVisible,
  renderWithUi,
  selectActionNode,
} from "./test-helpers.js";

afterEach(cleanup);

function required<T extends Element>(component: HTMLElement, selector: string): T {
  const element = component.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}

function toolIds(component: HTMLElement): readonly (string | null)[] {
  return [...component.querySelectorAll("[data-nodera-tool]")].map((element) =>
    element.getAttribute("data-nodera-tool"),
  );
}

function groupIds(component: HTMLElement): readonly (string | null)[] {
  return [...component.querySelectorAll("[data-nodera-toolbar-group]")].map((element) =>
    element.getAttribute("data-nodera-toolbar-group"),
  );
}

function toolButton(component: HTMLElement, toolId: string): HTMLButtonElement {
  return required<HTMLButtonElement>(component, `[data-nodera-tool="${toolId}"]`);
}

const GROUPED_TOOLS: readonly ToolDefinition[] = Object.freeze([
  { id: "acme.first", label: "First", group: "edit", command: { kind: "validate" } },
  { id: "acme.second", label: "Second", group: "history", command: { kind: "validate" } },
  { id: "acme.third", label: "Third", command: { kind: "validate" } },
  { id: "acme.fourth", label: "Fourth", group: "edit", command: { kind: "validate" } },
]);

const UNGROUPED_TOOLS: readonly ToolDefinition[] = Object.freeze([
  { id: "acme.alpha", label: "Alpha", command: { kind: "validate" } },
  { id: "acme.beta", label: "Beta", command: { kind: "validate" } },
]);

describe("Toolbar", () => {
  it("renders every registered tool in registration order, grouped by its group", () => {
    const { container } = renderWithUi(<Toolbar />, { editor: createActionEditor() });

    expect(required(container, "[data-nodera-toolbar]")).not.toBeNull();
    expect(toolIds(container)).toEqual(DEFAULT_TOOLS.map((tool) => tool.id));
    expect(groupIds(container)).toEqual(["history", "edit", "graph", "view"]);
    expect(container.querySelectorAll("[data-nodera-toolbar-separator]")).toHaveLength(3);
  });

  it("keeps group order of first appearance and moves ungrouped tools after them", () => {
    const { container } = renderWithUi(<Toolbar />, {
      editor: createActionEditor(),
      toolRegistry: createToolRegistry(GROUPED_TOOLS),
    });

    expect(groupIds(container)).toEqual(["edit", "history"]);
    expect(toolIds(container)).toEqual(["acme.first", "acme.fourth", "acme.second", "acme.third"]);
    expect(container.querySelectorAll("[data-nodera-toolbar-separator]")).toHaveLength(2);

    const ungrouped = required(container, "[data-nodera-toolbar-ungrouped]");
    expect(
      [...ungrouped.querySelectorAll("[data-nodera-tool]")].map((element) =>
        element.getAttribute("data-nodera-tool"),
      ),
    ).toEqual(["acme.third"]);
  });

  it("renders a flat list when no tool declares a group", () => {
    const { container } = renderWithUi(<Toolbar />, {
      editor: createActionEditor(),
      toolRegistry: createToolRegistry(UNGROUPED_TOOLS),
    });

    expect(toolIds(container)).toEqual(["acme.alpha", "acme.beta"]);
    expect(container.querySelectorAll("[data-nodera-toolbar-group]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-nodera-toolbar-separator]")).toHaveLength(0);
  });

  it("gates tools with the editor facts of an empty editor", () => {
    const { container } = renderWithUi(<Toolbar />, { editor: createActionEditor() });

    expect(toolButton(container, "tool.undo").disabled).toBe(true);
    expect(toolButton(container, "tool.redo").disabled).toBe(true);
    expect(toolButton(container, "tool.delete").disabled).toBe(true);
    expect(toolButton(container, "tool.copy").disabled).toBe(true);
    expect(toolButton(container, "tool.cut").disabled).toBe(true);
    expect(toolButton(container, "tool.paste").disabled).toBe(true);
    expect(toolButton(container, "tool.validate").disabled).toBe(false);
    expect(toolButton(container, "tool.fit-view").disabled).toBe(false);
  });

  it("enables tools from the selection and history of a populated editor", () => {
    const editor = createActionEditor();
    addActionNode(editor, { nodeId: "node-1" });
    selectActionNode(editor, "node-1");

    const { container } = renderWithUi(<Toolbar />, { editor });

    expect(toolButton(container, "tool.undo").disabled).toBe(false);
    expect(toolButton(container, "tool.delete").disabled).toBe(false);
    expect(toolButton(container, "tool.cut").disabled).toBe(false);
    expect(toolButton(container, "tool.paste").disabled).toBe(true);
    expect(toolButton(container, "tool.redo").disabled).toBe(true);
  });

  it("labels tools and flags destructive ones", () => {
    const tools: readonly ToolDefinition[] = Object.freeze([
      {
        id: "acme.delete",
        label: "Delete everything",
        description: "Removes the selected elements.",
        icon: "trash",
        danger: true,
        command: { kind: "delete-selection" },
      },
    ]);
    const { container } = renderWithUi(<Toolbar />, {
      editor: createActionEditor(),
      toolRegistry: createToolRegistry(tools),
    });

    const button = toolButton(container, "acme.delete");
    expect(button.getAttribute("aria-label")).toBe("Delete everything");
    expect(button.getAttribute("title")).toBe("Removes the selected elements.");
    expect(button.className).toContain("nodera-toolbar-danger");
    expect(required(button, "[data-nodera-tool-icon]").textContent).toBe("trash");
  });

  it("falls back to the label as the title and renders no icon span", () => {
    const { container } = renderWithUi(<Toolbar />, {
      editor: createActionEditor(),
      toolRegistry: createToolRegistry(UNGROUPED_TOOLS),
    });

    const button = toolButton(container, "acme.alpha");
    expect(button.getAttribute("title")).toBe("Alpha");
    expect(button.className).not.toContain("nodera-toolbar-danger");
    expect(button.querySelector("[data-nodera-tool-icon]")).toBeNull();
  });

  it("runs the undo use case when the undo tool is activated", () => {
    const editor = createActionEditor();
    addActionNode(editor, { nodeId: "node-1" });
    addActionNode(editor, { nodeId: "node-2" });
    const { container } = renderWithUi(<Toolbar />, { editor });

    fireEvent.click(toolButton(container, "tool.undo"));

    expect(editor.graph.nodeCount).toBe(1);
    expect(editor.getNode("node-2")).toBeUndefined();
  });

  it("adds a node through the add-node command", () => {
    const editor = createActionEditor();
    const { container } = renderWithUi(<Toolbar />, {
      editor,
      toolRegistry: createToolRegistry([
        {
          id: "acme.add-node",
          label: "Add node",
          command: { kind: "add-node", definitionId: PLAIN_DEFINITION_ID },
        },
      ]),
    });

    fireEvent.click(toolButton(container, "acme.add-node"));

    expect(editor.graph.nodeCount).toBe(1);
  });

  it("toggles a panel through the layout actions", () => {
    const store = createActionStore();
    const { container } = renderWithUi(<Toolbar />, {
      editor: createActionEditor(),
      store,
      toolRegistry: createToolRegistry([
        {
          id: "acme.toggle-validation",
          label: "Toggle validation",
          command: { kind: "toggle-panel", panelId: "validation" },
        },
      ]),
    });

    expect(panelVisible(store, "validation")).toBe(true);

    fireEvent.click(toolButton(container, "acme.toggle-validation"));

    expect(panelVisible(store, "validation")).toBe(false);
  });

  it("renders the toolbar renderer registered for its renderer id", () => {
    const renderers = createComponentRenderers();
    function CustomToolbar(props: ToolbarRendererProps): ReactNode {
      return (
        <div
          data-testid="acme-toolbar"
          data-tools={props.tools.map((tool) => tool.id).join(",")}
          data-can-undo={String(props.availability.canUndo)}
        >
          <button
            type="button"
            data-testid="acme-undo"
            onClick={() => {
              props.onCommand({ kind: "undo" });
            }}
          >
            Undo
          </button>
        </div>
      );
    }
    renderers.toolbars.register(DEFAULT_TOOLBAR_RENDERER_ID, CustomToolbar);
    const editor = createActionEditor();
    addActionNode(editor, { nodeId: "node-1" });

    const { container } = renderWithUi(<Toolbar />, { editor, renderers });

    expect(toolIds(container)).toEqual([]);
    const custom = required(container, '[data-testid="acme-toolbar"]');
    expect(required(container, "[data-nodera-toolbar]").contains(custom)).toBe(true);
    expect(custom.getAttribute("data-tools")).toBe(DEFAULT_TOOLS.map((tool) => tool.id).join(","));
    expect(custom.getAttribute("data-can-undo")).toBe("true");

    fireEvent.click(required(container, '[data-testid="acme-undo"]'));

    expect(editor.graph.nodeCount).toBe(0);
  });

  it("resolves the renderer replacement from the rendererId prop", () => {
    const renderers = createComponentRenderers();
    function HostToolbar(): ReactNode {
      return <div data-testid="host-toolbar" />;
    }
    renderers.toolbars.register("acme.toolbar", HostToolbar);

    const { container } = renderWithUi(
      <Toolbar rendererId="acme.toolbar" tools={UNGROUPED_TOOLS} />,
      { editor: createActionEditor(), renderers },
    );

    expect(container.querySelector('[data-testid="host-toolbar"]')).not.toBeNull();
    expect(toolIds(container)).toEqual([]);
  });

  it("renders the orientation and the optional group labels", () => {
    const horizontal = renderWithUi(<Toolbar />, { editor: createActionEditor() });
    expect(
      required(horizontal.container, "[data-nodera-toolbar]").getAttribute(
        "data-nodera-toolbar-orientation",
      ),
    ).toBe("horizontal");
    expect(horizontal.container.querySelectorAll("[data-nodera-toolbar-group-label]")).toHaveLength(
      0,
    );
    cleanup();

    const vertical = renderWithUi(<Toolbar orientation="vertical" showGroupLabels />, {
      editor: createActionEditor(),
    });
    expect(
      required(vertical.container, "[data-nodera-toolbar]").getAttribute(
        "data-nodera-toolbar-orientation",
      ),
    ).toBe("vertical");
    expect(
      [...vertical.container.querySelectorAll("[data-nodera-toolbar-group-label]")].map(
        (element) => element.textContent,
      ),
    ).toEqual(["history", "edit", "graph", "view"]);
  });

  it("hands a command to the host hook only when nothing else handles it", () => {
    const onCommand = vi.fn();
    const { container } = renderWithUi(<Toolbar onCommand={onCommand} />, {
      editor: createActionEditor(),
      toolRegistry: createToolRegistry([
        ...DEFAULT_TOOLS,
        { id: "acme.custom", label: "Send", command: { kind: "custom", id: "hello" } },
      ]),
    });

    fireEvent.click(toolButton(container, "tool.validate"));
    expect(onCommand).not.toHaveBeenCalled();

    fireEvent.click(toolButton(container, "acme.custom"));
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith({ kind: "custom", id: "hello" });
  });

  it("keeps layout tools usable when the provider has no editor", () => {
    const store = createActionStore();
    const { container } = renderWithUi(<Toolbar />, {
      store,
      toolRegistry: createToolRegistry([
        ...DEFAULT_TOOLS,
        {
          id: "acme.dock",
          label: "Dock validation",
          command: { kind: "dock-panel", panelId: "validation", region: "right" },
        },
      ]),
    });

    expect(toolButton(container, "tool.undo").disabled).toBe(true);
    expect(toolButton(container, "tool.validate").disabled).toBe(false);

    fireEvent.click(toolButton(container, "acme.dock"));

    expect(
      store.getState().layout?.panels.find((panel) => panel.panelId === "validation")?.region,
    ).toBe("right");
  });
});
