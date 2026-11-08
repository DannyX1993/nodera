import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  EDITOR_LAYOUT_ID,
  IDE_LAYOUT_ID,
  createMemoryLayoutPreferenceStore,
} from "@nodera/layout-engine";
import { DEFAULT_THEME_ID } from "@nodera/theme-engine";
import { UiStateStore } from "@nodera/ui-core";

import { NoderaUiProvider } from "../providers/ui-provider.js";
import { useLayoutActions } from "./layout-actions.js";

afterEach(cleanup);

function createStore(): UiStateStore {
  return new UiStateStore({ themeId: DEFAULT_THEME_ID, layoutId: "" });
}

function renderLayoutActions(store: UiStateStore) {
  return renderHook(() => useLayoutActions(), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <NoderaUiProvider store={store}>{children}</NoderaUiProvider>
    ),
  });
}

function panelState(store: UiStateStore, panelId: string) {
  return store.getState().layout?.panels.find((panel) => panel.panelId === panelId);
}

describe("useLayoutActions", () => {
  it("applies a declared layout and its panel state", () => {
    const store = createStore();
    const { result } = renderLayoutActions(store);

    act(() => {
      result.current.applyLayout(EDITOR_LAYOUT_ID);
    });

    expect(store.getState().layoutId).toBe(EDITOR_LAYOUT_ID);
    expect(panelState(store, "palette")).toMatchObject({ region: "left", visible: true, size: 240 });
    expect(panelState(store, "properties")).toMatchObject({ region: "right", size: 300 });
  });

  it("ignores an unknown layout id instead of throwing", () => {
    const store = createStore();
    const { result } = renderLayoutActions(store);

    act(() => {
      result.current.applyLayout(EDITOR_LAYOUT_ID);
    });
    expect(() => {
      act(() => {
        result.current.applyLayout("acme.unknown-layout");
      });
    }).not.toThrow();

    expect(store.getState().layoutId).toBe(EDITOR_LAYOUT_ID);
    expect(panelState(store, "palette")).toMatchObject({ size: 240 });
  });

  it("clamps a resize to the panel bounds", () => {
    const store = createStore();
    const { result } = renderLayoutActions(store);
    act(() => {
      result.current.applyLayout(EDITOR_LAYOUT_ID);
    });

    act(() => {
      result.current.resizePanel("palette", 5000);
    });
    expect(panelState(store, "palette")?.size).toBe(800);

    act(() => {
      result.current.resizePanel("palette", 10);
    });
    expect(panelState(store, "palette")?.size).toBe(120);

    act(() => {
      result.current.resizePanel("palette", 260);
    });
    expect(panelState(store, "palette")?.size).toBe(260);
  });

  it("hides and shows a panel", () => {
    const store = createStore();
    const { result } = renderLayoutActions(store);
    act(() => {
      result.current.applyLayout(EDITOR_LAYOUT_ID);
    });

    act(() => {
      result.current.togglePanel("palette");
    });
    expect(panelState(store, "palette")?.visible).toBe(false);

    act(() => {
      result.current.togglePanel("palette");
    });
    expect(panelState(store, "palette")?.visible).toBe(true);

    act(() => {
      result.current.setPanelVisible("properties", false);
    });
    expect(panelState(store, "properties")?.visible).toBe(false);
  });

  it("moves a panel into another dock region", () => {
    const store = createStore();
    const { result } = renderLayoutActions(store);
    act(() => {
      result.current.applyLayout(EDITOR_LAYOUT_ID);
    });

    act(() => {
      result.current.dockPanel("palette", "right");
    });

    expect(panelState(store, "palette")?.region).toBe("right");
  });

  it("floats a panel at the given rectangle", () => {
    const store = createStore();
    const { result } = renderLayoutActions(store);
    act(() => {
      result.current.applyLayout(EDITOR_LAYOUT_ID);
    });

    act(() => {
      result.current.floatPanel("palette", { x: 40, y: 60, width: 280, height: 220 });
    });

    expect(panelState(store, "palette")).toMatchObject({
      region: "floating",
      visible: true,
      rect: { x: 40, y: 60, width: 280, height: 220 },
    });
  });

  it("resets the layout to the registry default", () => {
    const store = createStore();
    const { result } = renderLayoutActions(store);
    act(() => {
      result.current.applyLayout(IDE_LAYOUT_ID);
    });
    act(() => {
      result.current.togglePanel("navigator");
    });

    act(() => {
      result.current.resetLayout();
    });

    expect(store.getState().layoutId).toBe(EDITOR_LAYOUT_ID);
    expect(panelState(store, "navigator")).toBeUndefined();
    expect(panelState(store, "palette")?.visible).toBe(true);
  });

  it("round-trips preferences through a preference store", () => {
    const store = createStore();
    const preferences = createMemoryLayoutPreferenceStore();
    const { result } = renderLayoutActions(store);

    act(() => {
      result.current.applyLayout(EDITOR_LAYOUT_ID);
    });
    act(() => {
      result.current.resizePanel("palette", 300);
    });
    act(() => {
      result.current.setPanelVisible("properties", false);
    });
    act(() => {
      result.current.savePreferences(preferences);
    });

    act(() => {
      result.current.applyLayout(IDE_LAYOUT_ID);
    });
    expect(store.getState().layoutId).toBe(IDE_LAYOUT_ID);

    act(() => {
      result.current.restorePreferences(preferences);
    });

    expect(store.getState().layoutId).toBe(EDITOR_LAYOUT_ID);
    expect(panelState(store, "palette")?.size).toBe(300);
    expect(panelState(store, "properties")?.visible).toBe(false);
  });
});
