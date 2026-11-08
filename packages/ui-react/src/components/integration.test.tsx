import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EditorEngine, addNode, exportDocument, selectNode } from "@nodera/application";
import {
  EDITOR_LAYOUT,
  EDITOR_LAYOUT_ID,
  createLayoutState,
  createMemoryLayoutPreferenceStore,
} from "@nodera/layout-engine";
import type { NodeDefinition } from "@nodera/node-registry";
import { DARK_THEME_ID, DEFAULT_THEME_ID } from "@nodera/theme-engine";
import { UiStateStore } from "@nodera/ui-core";

import { useLayoutActions } from "../bindings/layout-actions.js";
import { CanvasContainer } from "./shell/canvas-container.js";
import { EditorShell } from "./shell/editor-shell.js";
import { Header } from "./shell/header.js";
import { PanelHost } from "./shell/panel-host.js";
import { panelIdForRegion } from "./shell/shell-sizes.js";
import { Toolbar } from "./actions/toolbar.js";
import { ContextMenu, DEFAULT_MENU_RENDERER_ID } from "./actions/context-menu.js";
import { createDefaultComponentRenderers } from "../defaults/default-renderers.js";
import { createDefaultPanelRegistry } from "../defaults/default-panels.js";
import { NoderaUiProvider } from "../providers/ui-provider.js";
import {
  type ComponentRenderers,
  type MenuRendererProps,
  type PanelRendererProps,
  type PropertyRendererProps,
} from "../registries/component-registry.js";

/**
 * jsdom 26 ships no `PointerEvent`, so `fireEvent.pointer*` would drop the
 * coordinates the shell maths reads. The suite supplies the `MouseEvent`-based
 * stand-in the shell tests use, so a splitter drag is reproducible here too.
 */
if (typeof window.PointerEvent !== "function") {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    writable: true,
    value: class TestPointerEvent extends MouseEvent {},
  });
}

afterEach(cleanup);

const SOURCE_DEFINITION: NodeDefinition = {
  id: "test.source",
  name: "Source",
  category: "sources",
  version: "1.0.0",
  ports: [{ id: "out", direction: "output" }],
  properties: [
    { id: "endpoint", type: "string", label: "Endpoint" },
    { id: "retries", type: "number", label: "Retries" },
  ],
};

/** Definition whose required property the seeded graph leaves unset. */
const SINK_DEFINITION: NodeDefinition = {
  id: "test.sink",
  name: "Sink",
  category: "sinks",
  version: "1.0.0",
  ports: [{ id: "in", direction: "input" }],
  properties: [{ id: "target", type: "string", label: "Target", required: true }],
};

function seedNode(
  editor: EditorEngine,
  options: {
    readonly nodeId: string;
    readonly definitionId: string;
    readonly properties?: Readonly<Record<string, unknown>>;
    readonly position: { readonly x: number; readonly y: number };
  },
): void {
  const added = addNode(editor, {
    nodeId: options.nodeId,
    definitionId: options.definitionId,
    position: options.position,
    ...(options.properties === undefined ? {} : { properties: options.properties }),
  });
  if (!added.ok) {
    throw new Error(added.error.message);
  }
}

/** Editor with two registered definitions and a graph that has one invalid node. */
function createIntegrationEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "graph-integration" });
  editor.domain.nodes.register(SOURCE_DEFINITION);
  editor.domain.nodes.register(SINK_DEFINITION);
  seedNode(editor, {
    nodeId: "node-source",
    definitionId: SOURCE_DEFINITION.id,
    properties: { endpoint: "https://source.test", retries: 2 },
    position: { x: 0, y: 0 },
  });
  seedNode(editor, {
    nodeId: "node-sink",
    definitionId: SINK_DEFINITION.id,
    position: { x: 220, y: 120 },
  });
  return editor;
}

/** UI store with the classic editor layout already applied. */
function createIntegrationStore(): UiStateStore {
  const panelRegistry = createDefaultPanelRegistry();
  return new UiStateStore({
    themeId: DEFAULT_THEME_ID,
    layoutId: EDITOR_LAYOUT_ID,
    layout: createLayoutState(EDITOR_LAYOUT, { panels: panelRegistry.all() }),
  });
}

/**
 * Composed editor of the integration suite.
 *
 * It is a host composition, not a framework layout: the slots place registered
 * panels through `PanelHost`, the canvas slot holds a stub div (never React
 * Flow), and the splitters are wired to the layout actions through
 * `panelIdForRegion`, which is exactly the wiring a real host writes.
 */
function Workspace(props: { readonly store: UiStateStore }): ReactNode {
  const layout = useLayoutActions();

  return (
    <EditorShell
      onResizeRegion={(region, size) => {
        const panelId = panelIdForRegion(props.store.getState().layout, region);
        if (panelId !== undefined) {
          layout.resizePanel(panelId, size);
        }
      }}
      slots={{
        header: (
          <>
            <Header title="Nodera" />
            <Toolbar />
          </>
        ),
        left: (
          <>
            <PanelHost panelId="palette" />
            <PanelHost panelId="navigator" />
          </>
        ),
        right: <PanelHost panelId="properties" />,
        bottom: (
          <>
            <PanelHost panelId="validation" />
            <PanelHost panelId="history" />
          </>
        ),
        canvas: (
          <CanvasContainer>
            <div data-nodera-canvas-stub="" />
          </CanvasContainer>
        ),
      }}
    />
  );
}

interface WorkspaceOptions {
  readonly store?: UiStateStore;
  readonly editor?: EditorEngine;
  readonly renderers?: ComponentRenderers;
}

/** Renders the composed editor inside a real provider with real registries. */
function renderWorkspace(options: WorkspaceOptions = {}) {
  const store = options.store ?? createIntegrationStore();
  const editor = options.editor ?? createIntegrationEditor();
  const renderers = options.renderers ?? createDefaultComponentRenderers();
  const result = render(
    <NoderaUiProvider store={store} editor={editor} renderers={renderers}>
      <Workspace store={store} />
    </NoderaUiProvider>,
  );
  return { ...result, store, editor };
}

function required<T extends Element>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}

function panelState(store: UiStateStore, panelId: string) {
  return store.getState().layout?.panels.find((panel) => panel.panelId === panelId);
}

/**
 * Composed editor plus the menu surface, placed by the host next to the shell.
 *
 * `ContextMenu` is mounted directly — no `PanelHost`, no panel registry entry —
 * which is how a host adds an overlay: the component reads the UI store itself
 * and renders whatever the store says.
 */
function renderWorkspaceWithMenu(options: WorkspaceOptions = {}) {
  const store = options.store ?? createIntegrationStore();
  const editor = options.editor ?? createIntegrationEditor();
  const renderers = options.renderers ?? createDefaultComponentRenderers();
  const result = render(
    <NoderaUiProvider store={store} editor={editor} renderers={renderers}>
      <Workspace store={store} />
      <ContextMenu />
    </NoderaUiProvider>,
  );
  return { ...result, store, editor };
}

function historyEntries(container: HTMLElement, state: "undoable" | "redoable"): readonly Element[] {
  return [...container.querySelectorAll(`[data-nodera-history-entry-state="${state}"]`)];
}

function entryLabels(container: HTMLElement, state: "undoable" | "redoable"): readonly string[] {
  return historyEntries(container, state).map((element) => element.textContent ?? "");
}

function validationCount(
  container: HTMLElement,
  severity: "error" | "warning" | "info",
): string | null {
  return (
    container
      .querySelector(`[data-nodera-validation-count="${severity}"]`)
      ?.textContent?.trim() ?? null
  );
}

describe("1. composed editor renders the built-in panels", () => {
  it("renders every panel through its built-in renderer inside the shell", () => {
    const { container } = renderWorkspace();

    expect(required(container, "[data-nodera-canvas-stub]")).toBeTruthy();
    expect(required(container, "[data-nodera-toolbar]")).toBeTruthy();
    expect(required(container, "[data-nodera-palette]")).toBeTruthy();
    expect(required(container, "[data-nodera-navigator]")).toBeTruthy();
    expect(required(container, "[data-nodera-properties-panel]")).toBeTruthy();
    expect(required(container, "[data-nodera-validation-panel]")).toBeTruthy();
    expect(required(container, "[data-nodera-history-panel]")).toBeTruthy();
    expect(container.querySelector("[data-nodera-panel-unregistered]")).toBeNull();
  });

  it("places each panel in the region the applied layout docks it", () => {
    const { container } = renderWorkspace();

    expect(
      required(container, '[data-nodera-region="left"]').querySelector("[data-nodera-palette]"),
    ).not.toBeNull();
    expect(
      required(container, '[data-nodera-region="right"]').querySelector(
        "[data-nodera-properties-panel]",
      ),
    ).not.toBeNull();
    expect(
      required(container, '[data-nodera-region="bottom"]').querySelector(
        "[data-nodera-validation-panel]",
      ),
    ).not.toBeNull();
    expect(required(container, '[data-nodera-region="header"]').textContent).toContain(
      "Nodera",
    );
  });
});

describe("2. palette, history and toolbar", () => {
  it("adds a node from the palette and undoes it from the toolbar", () => {
    const { container, editor } = renderWorkspace();

    expect(editor.graph.getNodes()).toHaveLength(2);
    expect(entryLabels(container, "undoable")).toEqual(["add-node", "add-node"]);

    fireEvent.click(required(container, '[data-nodera-palette-item="test.source"]'));

    expect(editor.graph.getNodes()).toHaveLength(3);
    expect(container.querySelectorAll("[data-nodera-navigator-node]")).toHaveLength(3);
    expect(entryLabels(container, "undoable")).toEqual([
      "add-node",
      "add-node",
      "add-node",
    ]);

    fireEvent.click(required(container, '[data-nodera-tool="tool.undo"]'));

    expect(editor.graph.getNodes()).toHaveLength(2);
    expect(entryLabels(container, "undoable")).toHaveLength(2);
    expect(entryLabels(container, "redoable")).toEqual(["add-node"]);
    expect(container.querySelectorAll("[data-nodera-navigator-node]")).toHaveLength(2);
  });
});

describe("3. properties editing of the selected node", () => {
  it("edits a property as one history entry and writes it to the engine", () => {
    const { container, editor } = renderWorkspace();

    fireEvent.click(required(container, '[data-nodera-navigator-node="node-source"]'));

    const endpoint = screen.getByLabelText<HTMLInputElement>("Endpoint");
    expect(endpoint.value).toBe("https://source.test");
    const entries = editor.history.size();

    fireEvent.change(endpoint, { target: { value: "https://edited.test" } });

    expect(editor.getNode("node-source")?.getProperties().endpoint).toBe(
      "https://edited.test",
    );
    expect(editor.history.size()).toBe(entries + 1);
    expect(entryLabels(container, "undoable")).toContain("update-node-properties");
  });

  it("selects the node from the engine when the host does it itself", () => {
    const { container, editor } = renderWorkspace();

    act(() => {
      selectNode(editor, { nodeId: "node-source" });
    });

    expect(
      required(container, "[data-nodera-properties-panel]").getAttribute(
        "data-nodera-properties-target",
      ),
    ).toBe("node");
    expect(screen.getByLabelText("Endpoint")).toBeTruthy();
  });
});

describe("4. validation report", () => {
  it("reports the invalid element of the seeded graph", () => {
    const { container } = renderWorkspace();

    expect(required(container, "[data-nodera-validation-status]").textContent).toBe(
      "Not validated yet",
    );
    expect(validationCount(container, "error")).toBe("0");

    fireEvent.click(required(container, '[data-nodera-validation-action="validate"]'));

    expect(container.querySelector("[data-nodera-validation-status]")).toBeNull();
    expect(validationCount(container, "error")).toBe("1");
    expect(container.querySelectorAll("[data-nodera-validation-issue]")).toHaveLength(1);
    expect(required(container, "[data-nodera-validation-code]").textContent).toBe(
      "domain.property.required",
    );
    expect(required(container, '[data-nodera-validation-element="node-sink"]')).toBeTruthy();
  });
});

describe("5. layout through the composed shell", () => {
  it("removes the region of a panel hidden through its chrome", () => {
    const { container, store } = renderWorkspace();
    expect(required(container, '[data-nodera-region="bottom"]')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide Validation" }));

    expect(container.querySelector('[data-nodera-region="bottom"]')).toBeNull();
    expect(container.querySelector("[data-nodera-validation-panel]")).toBeNull();
    expect(panelState(store, "validation")?.visible).toBe(false);
  });

  it("resizes the panel of a dragged region through panelIdForRegion", () => {
    const { container, store } = renderWorkspace();
    expect(panelState(store, "palette")?.size).toBe(240);

    const splitter = required(container, '[data-nodera-splitter="left"]');
    fireEvent.pointerDown(splitter, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 260, pointerId: 1 });

    expect(panelState(store, "palette")?.size).toBe(300);
    fireEvent.pointerUp(document, { pointerId: 1 });

    fireEvent.pointerMove(document, { clientX: 400, pointerId: 1 });
    expect(panelState(store, "palette")?.size).toBe(300);
  });

  it("round-trips the layout preferences into a second store", () => {
    const preferences = createMemoryLayoutPreferenceStore();
    const firstStore = createIntegrationStore();
    const first = renderHook(() => useLayoutActions(), {
      wrapper: providerWrapper(firstStore),
    });

    act(() => {
      first.result.current.resizePanel("palette", 360);
    });
    act(() => {
      first.result.current.setPanelVisible("properties", false);
    });
    act(() => {
      first.result.current.savePreferences(preferences);
    });
    first.unmount();

    const secondStore = createIntegrationStore();
    const second = renderHook(() => useLayoutActions(), {
      wrapper: providerWrapper(secondStore),
    });
    expect(panelState(secondStore, "palette")?.size).toBe(240);

    act(() => {
      second.result.current.restorePreferences(preferences);
    });

    expect(secondStore.getState().layoutId).toBe(EDITOR_LAYOUT_ID);
    expect(panelState(secondStore, "palette")?.size).toBe(360);
    expect(panelState(secondStore, "properties")?.visible).toBe(false);
  });
});

describe("6. theme of the composed provider", () => {
  it("rewrites the theme custom properties when the store theme changes", () => {
    const { container, store } = renderWorkspace();
    const initial = required<HTMLElement>(container, "[data-nodera-theme]");
    expect(initial.getAttribute("data-nodera-theme")).toBe(DEFAULT_THEME_ID);
    expect(initial.style.getPropertyValue("--ndr-colors-background")).toBe("#f8fafc");

    act(() => {
      store.setTheme(DARK_THEME_ID);
    });

    const themed = required<HTMLElement>(container, "[data-nodera-theme]");
    expect(themed.getAttribute("data-nodera-theme")).toBe(DARK_THEME_ID);
    expect(themed.style.getPropertyValue("--ndr-colors-background")).toBe("#111827");
  });
});

describe("7. component replacement", () => {
  it("renders the host panel renderer instead of the built-in palette", () => {
    const renderers = createDefaultComponentRenderers();
    renderers.panels.unregister("nodera.panel.palette");
    renderers.panels.register("nodera.panel.palette", function HostPalette(
      _props: PanelRendererProps,
    ) {
      return <div data-testid="host-palette">Host palette</div>;
    });

    const { container } = renderWorkspace({ renderers });

    expect(screen.getByTestId("host-palette").textContent).toBe("Host palette");
    expect(container.querySelector("[data-nodera-palette]")).toBeNull();
    expect(required(container, '[data-nodera-panel-id="palette"]').textContent).toContain(
      "Host palette",
    );
    expect(container.querySelector("[data-nodera-panel-unregistered]")).toBeNull();
  });

  it("renders the host property renderer for a numeric property", () => {
    const renderers = createDefaultComponentRenderers();
    renderers.properties.unregister("number");
    renderers.properties.register("number", function HostNumber(
      props: PropertyRendererProps,
    ) {
      return <span data-testid="host-number">{props.definition.id}</span>;
    });

    const { container } = renderWorkspace({ renderers });
    fireEvent.click(required(container, '[data-nodera-navigator-node="node-source"]'));

    expect(screen.getByTestId("host-number").textContent).toBe("retries");
    expect(container.querySelector('input[type="number"]')).toBeNull();
    expect(screen.getByLabelText("Endpoint")).toBeTruthy();
  });

  it("keeps the built-in toolbar path when no toolbar renderer is registered", () => {
    const renderers = createDefaultComponentRenderers();
    expect(renderers.toolbars.size).toBe(0);

    const { container } = renderWorkspace({ renderers });

    expect(container.querySelector("[data-nodera-toolbar] [data-nodera-tool]")).not.toBeNull();
  });
});

describe("8. presentation state never reaches the portable document", () => {
  /** Keys of a serialized document, at every depth. */
  function documentKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
    if (Array.isArray(value)) {
      for (const item of value) {
        documentKeys(item, keys);
      }
      return keys;
    }
    if (typeof value === "object" && value !== null) {
      for (const [key, nested] of Object.entries(value)) {
        keys.add(key);
        documentKeys(nested, keys);
      }
    }
    return keys;
  }

  it("exports the graph without theme, layout, menu, search or selection state", () => {
    const { store, editor } = renderWorkspace();

    // Mutate every kind of presentation state the UI layer owns: theme, search
    // query, an open menu, the interaction mode, a node selection and a layout
    // change (a different layout plus a resized panel).
    act(() => {
      store.setTheme(DARK_THEME_ID);
      store.setSearchQuery("zzz-search-query");
      store.openMenu({
        kind: "context",
        targetKind: "node",
        targetId: "node-source",
        position: { x: 9876, y: 5432 },
      });
      store.setInteractionMode("pan");
      store.updateLayout((layout) => ({
        panels: layout.panels.map((panel) =>
          panel.panelId === "palette" ? { ...panel, size: 361 } : panel,
        ),
      }));
    });
    act(() => {
      selectNode(editor, { nodeId: "node-source" });
    });

    // Precondition: the presentation state really changed.
    const ui = store.getState();
    expect(ui.themeId).toBe(DARK_THEME_ID);
    expect(ui.menu).toBeDefined();
    expect(ui.interactionMode).toBe("pan");
    expect(ui.layout?.panels.find((panel) => panel.panelId === "palette")?.size).toBe(361);
    expect(editor.getSelectedNodes()).toEqual(["node-source"]);

    // `exportDocument` emits a `graph.exported` event the mounted panels
    // subscribe to, so the export runs inside `act` like any other mutation.
    let exported: ReturnType<typeof exportDocument> | undefined;
    act(() => {
      exported = exportDocument(editor, { format: "json" });
    });
    if (exported === undefined || !exported.ok) {
      throw new Error(`export failed: ${JSON.stringify(exported?.error)}`);
    }

    const keys = documentKeys(JSON.parse(exported.value) as unknown);
    expect(
      [...keys].filter((key) =>
        [
          "themeId",
          "layoutId",
          "layout",
          "panels",
          "searchQuery",
          "menu",
          "menus",
          "selectedNodes",
          "selectedEdges",
          "selected",
          "interactionMode",
          "activePanelId",
        ].includes(key),
      ),
    ).toEqual([]);

    // Nor do the values of that state reach the document.
    expect(exported.value).not.toContain(DARK_THEME_ID);
    expect(exported.value).not.toContain(EDITOR_LAYOUT_ID);
    expect(exported.value).not.toContain("zzz-search-query");
    expect(exported.value).not.toContain("9876");
    expect(exported.value).not.toContain("361");

    // The graph itself is still exported, unharmed.
    expect(keys).toContain("nodes");
    expect(exported.value).toContain("node-source");
    expect(exported.value).toContain("node-sink");
    expect(exported.value).toContain("https://source.test");
  });
});

describe("9. menu presentation replacement", () => {
  it("renders the host menu of the composed editor and dispatches its command", () => {
    const renderers = createDefaultComponentRenderers();
    renderers.menus.replace(
      DEFAULT_MENU_RENDERER_ID,
      function HostMenu(props: MenuRendererProps) {
        return (
          <div
            data-testid="host-menu"
            data-target-kind={props.targetKind}
            data-items={props.items.map((tool) => tool.id).join(",")}
          >
            {props.items.map((tool) => (
              <button
                key={tool.id}
                type="button"
                data-host-menu-item={tool.id}
                onClick={() => {
                  props.onCommand(tool.command);
                }}
              >
                {tool.label}
              </button>
            ))}
          </div>
        );
      },
    );

    const { container, editor, store } = renderWorkspaceWithMenu({ renderers });
    act(() => {
      selectNode(editor, { nodeId: "node-source" });
    });
    act(() => {
      store.openMenu({
        kind: "context",
        targetKind: "node",
        targetId: "node-source",
        position: { x: 320, y: 180 },
      });
    });

    // The positioned root is still the framework's; only its children are host markup.
    const root = required<HTMLElement>(container, "[data-nodera-context-menu]");
    expect(root.getAttribute("data-nodera-context-target")).toBe("node");
    expect(root.style.position).toBe("fixed");
    expect(root.style.left).toBe("320px");
    expect(root.style.top).toBe("180px");
    expect(container.querySelectorAll("[data-nodera-menu-item]")).toHaveLength(0);

    const menu = required(container, '[data-testid="host-menu"]');
    expect(menu.getAttribute("data-target-kind")).toBe("node");
    expect(menu.getAttribute("data-items")).toBe(
      "tool.delete,tool.copy,tool.cut,tool.validate,tool.fit-view",
    );
    expect(container.querySelectorAll("[data-nodera-navigator-node]")).toHaveLength(2);

    fireEvent.click(required(container, '[data-host-menu-item="tool.delete"]'));

    // The command ran through the same dispatcher as the toolbar, and the menu closed.
    expect(editor.getNode("node-source")).toBeUndefined();
    expect(container.querySelectorAll("[data-nodera-navigator-node]")).toHaveLength(1);
    expect(store.getState().menu).toBeUndefined();
    expect(container.querySelector("[data-nodera-context-menu]")).toBeNull();
  });

  it("keeps the built-in menu path of the composed editor when no renderer is registered", () => {
    const renderers = createDefaultComponentRenderers();
    const { container, store } = renderWorkspaceWithMenu({ renderers });

    act(() => {
      store.openMenu({
        kind: "context",
        targetKind: "pane",
        targetId: "",
        position: { x: 10, y: 20 },
      });
    });

    expect(
      [...container.querySelectorAll("[data-nodera-menu-item]")].map((element) =>
        element.getAttribute("data-nodera-menu-item"),
      ),
    ).toEqual(["tool.validate", "tool.fit-view"]);
    expect(container.querySelector('[data-testid="host-menu"]')).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(store.getState().menu).toBeUndefined();
  });
});

/** Provider wrapper of the layout-preference round-trip. */
function providerWrapper(store: UiStateStore) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <NoderaUiProvider store={store}>{children}</NoderaUiProvider>;
  };
}
