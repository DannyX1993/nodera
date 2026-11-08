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

import { EditorEngine, addNode, selectNode } from "@nodera/application";
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
import { createDefaultComponentRenderers } from "../defaults/default-renderers.js";
import { createDefaultPanelRegistry } from "../defaults/default-panels.js";
import { NoderaUiProvider } from "../providers/ui-provider.js";
import {
  type ComponentRenderers,
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

/** Provider wrapper of the layout-preference round-trip. */
function providerWrapper(store: UiStateStore) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <NoderaUiProvider store={store}>{children}</NoderaUiProvider>;
  };
}
