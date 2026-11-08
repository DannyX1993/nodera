import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EDITOR_LAYOUT, EDITOR_LAYOUT_ID, LayoutRegistry, createLayoutState } from "@nodera/layout-engine";
import { DARK_THEME_ID, DEFAULT_THEME_ID, ThemeRegistry } from "@nodera/theme-engine";
import { UiStateStore } from "@nodera/ui-core";
import { PROPERTY_TYPES } from "@nodera/property-system";

import { createDefaultPanelRegistry } from "@nodera/ui-core";
import { PanelHost } from "../components/shell/panel-host.js";
import { createTestEditor } from "../test/fixtures.js";
import {
  NoderaUiProvider,
  useComponentRenderers,
  useEditorEngine,
  useLayoutRegistry,
  useNoderaUi,
  usePanelRegistry,
  useTheme,
  useToolRegistry,
  useUiState,
} from "./ui-provider.js";

afterEach(cleanup);

function createStore(themeId: string = DEFAULT_THEME_ID): UiStateStore {
  return new UiStateStore({ themeId, layoutId: EDITOR_LAYOUT_ID });
}

function wrapperFor(store: UiStateStore) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <NoderaUiProvider store={store}>{children}</NoderaUiProvider>;
  };
}

describe("NoderaUiProvider", () => {
  it("throws the documented error outside the provider", () => {
    expect(() => renderHook(() => useNoderaUi())).toThrow(
      "useNoderaUi must be used inside <NoderaUiProvider>",
    );
  });

  it("supplies the default registries when the host provides none", () => {
    function RegistriesProbe() {
      const ui = useNoderaUi();
      return (
        <>
          <span data-testid="theme-registry">{String(ui.themeRegistry instanceof ThemeRegistry)}</span>
          <span data-testid="layout-registry">{String(ui.layoutRegistry instanceof LayoutRegistry)}</span>
          <span data-testid="panel-size">{ui.panelRegistry.size}</span>
          <span data-testid="tool-size">{ui.toolRegistry.size}</span>
          <span data-testid="panel-renderers">{ui.renderers.panels.size}</span>
          <span data-testid="property-renderers">{ui.renderers.properties.size}</span>
          <span data-testid="toolbar-renderers">{ui.renderers.toolbars.size}</span>
        </>
      );
    }

    render(
      <NoderaUiProvider store={createStore()}>
        <RegistriesProbe />
      </NoderaUiProvider>,
    );

    expect(screen.getByTestId("theme-registry").textContent).toBe("true");
    expect(screen.getByTestId("layout-registry").textContent).toBe("true");
    expect(screen.getByTestId("panel-size").textContent).toBe("11");
    expect(screen.getByTestId("tool-size").textContent).toBe("8");
    expect(screen.getByTestId("panel-renderers").textContent).toBe("11");
    expect(screen.getByTestId("property-renderers").textContent).toBe(
      String(PROPERTY_TYPES.length),
    );
    expect(screen.getByTestId("toolbar-renderers").textContent).toBe("0");
  });

  it("renders a preset panel through its built-in renderer by default", () => {
    const panelRegistry = createDefaultPanelRegistry();
    const store = new UiStateStore({
      themeId: DEFAULT_THEME_ID,
      layoutId: EDITOR_LAYOUT_ID,
      layout: createLayoutState(EDITOR_LAYOUT, { panels: panelRegistry.all() }),
    });

    const { container } = render(
      <NoderaUiProvider store={store} editor={createTestEditor()}>
        <PanelHost panelId="palette" />
      </NoderaUiProvider>,
    );

    expect(container.querySelector("[data-nodera-palette]")).not.toBeNull();
    expect(container.querySelector("[data-nodera-panel-unregistered]")).toBeNull();
  });

  it("exposes the registries through dedicated hooks", () => {
    const store = createStore();

    const { result } = renderHook(
      () => ({
        panels: usePanelRegistry(),
        tools: useToolRegistry(),
        layouts: useLayoutRegistry(),
        renderers: useComponentRenderers(),
      }),
      { wrapper: wrapperFor(store) },
    );

    expect(result.current.panels.size).toBe(11);
    expect(result.current.tools.size).toBe(8);
    expect(result.current.layouts.size).toBeGreaterThan(0);
    expect(result.current.renderers.panels.size).toBe(11);
    expect(result.current.renderers.toolbars.size).toBe(0);
  });

  it("uses the registries the host provides instead of the defaults", () => {
    const panelRegistry = createDefaultPanelRegistry();
    panelRegistry.unregister("minimap");

    const { result } = renderHook(() => usePanelRegistry(), {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <NoderaUiProvider store={createStore()} panelRegistry={panelRegistry}>
          {children}
        </NoderaUiProvider>
      ),
    });

    expect(result.current.size).toBe(10);
    expect(result.current.has("minimap")).toBe(false);
  });
});

describe("useTheme", () => {
  it("resolves the theme selected by the store", () => {
    function ThemeProbe() {
      const theme = useTheme();
      return <span data-testid="theme">{theme.id}</span>;
    }

    render(
      <NoderaUiProvider store={createStore(DARK_THEME_ID)}>
        <ThemeProbe />
      </NoderaUiProvider>,
    );

    expect(screen.getByTestId("theme").textContent).toBe(DARK_THEME_ID);
  });

  it("falls back to the registry default for an unknown theme id", () => {
    function ThemeProbe() {
      const theme = useTheme();
      return <span data-testid="theme">{theme.id}</span>;
    }

    render(
      <NoderaUiProvider store={createStore("acme.missing-theme")}>
        <ThemeProbe />
      </NoderaUiProvider>,
    );

    expect(screen.getByTestId("theme").textContent).toBe(DEFAULT_THEME_ID);
  });
});

describe("theme variables", () => {
  it("writes the theme css custom properties on the wrapper element", () => {
    const { container } = render(
      <NoderaUiProvider store={createStore()}>
        <span>content</span>
      </NoderaUiProvider>,
    );

    const root = container.querySelector<HTMLElement>("[data-nodera-theme]");
    expect(root).not.toBeNull();
    expect(root?.getAttribute("data-nodera-theme")).toBe(DEFAULT_THEME_ID);
    expect(root?.style.getPropertyValue("--ndr-colors-background")).toBe("#f8fafc");
    expect(root?.style.getPropertyValue("--ndr-spacing-md")).toBe("8px");
  });

  it("updates the wrapper variables when the store theme changes", () => {
    const store = createStore();
    const { container } = render(
      <NoderaUiProvider store={store}>
        <span>content</span>
      </NoderaUiProvider>,
    );

    act(() => {
      store.setTheme(DARK_THEME_ID);
    });

    const root = container.querySelector<HTMLElement>("[data-nodera-theme]");
    expect(root?.getAttribute("data-nodera-theme")).toBe(DARK_THEME_ID);
    expect(root?.style.getPropertyValue("--ndr-colors-background")).toBe("#111827");
  });

  it("re-renders state consumers when the store changes", () => {
    const store = createStore();

    function StateProbe() {
      const state = useUiState();
      return <span data-testid="query">{state.searchQuery}</span>;
    }

    render(
      <NoderaUiProvider store={store}>
        <StateProbe />
      </NoderaUiProvider>,
    );

    act(() => {
      store.setSearchQuery("needle");
    });

    expect(screen.getByTestId("query").textContent).toBe("needle");
  });
});

describe("useEditorEngine", () => {
  it("returns the editor the host supplied", () => {
    const editor = createTestEditor();

    const { result } = renderHook(() => useEditorEngine(), {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <NoderaUiProvider store={createStore()} editor={editor}>
          {children}
        </NoderaUiProvider>
      ),
    });

    expect(result.current).toBe(editor);
  });

  it("exposes the editor through useNoderaUi", () => {
    const editor = createTestEditor();

    const { result } = renderHook(() => useNoderaUi().editor, {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <NoderaUiProvider store={createStore()} editor={editor}>
          {children}
        </NoderaUiProvider>
      ),
    });

    expect(result.current).toBe(editor);
  });

  it("reports the editor as undefined through useNoderaUi when the host supplies none", () => {
    const { result } = renderHook(() => useNoderaUi().editor, {
      wrapper: wrapperFor(createStore()),
    });

    expect(result.current).toBeUndefined();
  });

  it("throws the documented error when the provider has no editor", () => {
    expect(() =>
      renderHook(() => useEditorEngine(), { wrapper: wrapperFor(createStore()) }),
    ).toThrow("useEditorEngine requires an editor on <NoderaUiProvider>");
  });

  it("throws the documented error outside the provider", () => {
    expect(() => renderHook(() => useEditorEngine())).toThrow(
      "useEditorEngine requires an editor on <NoderaUiProvider>",
    );
  });
});
