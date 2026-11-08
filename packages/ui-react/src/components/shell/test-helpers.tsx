import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import { EDITOR_LAYOUT, createLayoutState } from "@nodera/layout-engine";
import { DEFAULT_THEME_ID } from "@nodera/theme-engine";
import { UiStateStore, type PanelRegistry } from "@nodera/ui-core";

import { createDefaultPanelRegistry } from "@nodera/ui-core";
import { NoderaUiProvider } from "../../providers/ui-provider.js";
import {
  createComponentRenderers,
  type ComponentRenderers,
} from "../../registries/component-registry.js";

/**
 * Store with the classic editor layout already applied.
 *
 * Shell tests need real panel state, not a hand-written stub: region sizes and
 * region visibility are derived from it (D9).
 */
export function createShellStore(): UiStateStore {
  const panelRegistry = createDefaultPanelRegistry();
  return new UiStateStore({
    themeId: DEFAULT_THEME_ID,
    layoutId: EDITOR_LAYOUT.id,
    layout: createLayoutState(EDITOR_LAYOUT, { panels: panelRegistry.all() }),
  });
}

/** Options accepted by {@link renderWithUi}. */
export interface RenderUiOptions {
  readonly store?: UiStateStore;
  readonly panelRegistry?: PanelRegistry;
  readonly renderers?: ComponentRenderers;
}

/** Renders a component inside a real provider with real registries. */
export function renderWithUi(
  element: ReactElement,
  options: RenderUiOptions = {},
): RenderResult {
  const store = options.store ?? createShellStore();
  const renderers = options.renderers ?? createComponentRenderers();
  const panelRegistry = options.panelRegistry;

  return render(
    <NoderaUiProvider
      store={store}
      renderers={renderers}
      {...(panelRegistry === undefined ? {} : { panelRegistry })}
    >
      {element}
    </NoderaUiProvider>,
  );
}
