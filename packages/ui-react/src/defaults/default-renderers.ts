import { createElement, type ComponentType } from "react";

import { Navigator } from "../components/discovery/navigator.js";
import { NodePalette } from "../components/discovery/node-palette.js";
import { MinimapPanel } from "../components/discovery/minimap-panel.js";
import { SearchPanel } from "../components/discovery/search-panel.js";
import { InspectorPanel } from "../components/inspector/inspector-panel.js";
import { MetadataPanel } from "../components/inspector/metadata-panel.js";
import { PropertiesPanel } from "../components/inspector/properties-panel.js";
import { createDefaultPropertyRenderers } from "../components/inspector/property-renderers/defaults.js";
import { HistoryPanel } from "../components/reports/history-panel.js";
import { ValidationPanel } from "../components/reports/validation-panel.js";
import { Footer } from "../components/shell/footer.js";
import { Header } from "../components/shell/header.js";
import {
  createComponentRenderers,
  type ComponentRenderers,
  type PanelRendererProps,
} from "../registries/component-registry.js";

/**
 * Stable renderer id of one preset panel.
 *
 * The ids mirror `DEFAULT_PANELS[].renderer` (`nodera.panel.<panel id>`), so a
 * host replaces one panel by registering a component under the same id it
 * already sees on the definition.
 */
type PanelRenderer = readonly [id: string, component: ComponentType<PanelRendererProps>];

/**
 * Built-in panel renderers, one thin wrapper per preset panel.
 *
 * Each wrapper is the `PanelRendererProps` adapter of an existing component: it
 * ignores the contract and renders the component with no extra props, because a
 * preset panel is self-sufficient (it reads the editor and the UI state through
 * the provider). The table lives here instead of in the components so the
 * renderer ids stay presentation configuration and the components keep no
 * knowledge of the registry.
 */
const BUILT_IN_PANEL_RENDERERS: readonly PanelRenderer[] = [
  ["nodera.panel.header", () => createElement(Header)],
  ["nodera.panel.footer", () => createElement(Footer)],
  ["nodera.panel.palette", () => createElement(NodePalette)],
  ["nodera.panel.navigator", () => createElement(Navigator)],
  ["nodera.panel.search", () => createElement(SearchPanel)],
  ["nodera.panel.minimap", () => createElement(MinimapPanel)],
  ["nodera.panel.properties", () => createElement(PropertiesPanel)],
  ["nodera.panel.inspector", () => createElement(InspectorPanel)],
  ["nodera.panel.validation", () => createElement(ValidationPanel)],
  ["nodera.panel.history", () => createElement(HistoryPanel)],
  ["nodera.panel.metadata", () => createElement(MetadataPanel)],
];

/**
 * Creates the renderer registries of one UI instance, preset by the framework.
 *
 * The panels and the property renderers a host gets are the ones the package
 * ships, so composing a `NoderaUiProvider` is enough to see a working editor;
 * replacing any of them is still a single `unregister` plus `register` on the
 * matching registry (S3 Level 2). Registrations never overwrite: an id that is
 * already taken keeps its owner, and the `toolbars` registry is left empty
 * because the built-in toolbar is the default path — a host replaces it by
 * registering a component under a renderer id of its own and passing it to
 * `Toolbar.rendererId`.
 */
export function createDefaultComponentRenderers(): ComponentRenderers {
  const renderers = createComponentRenderers();

  for (const [id, component] of BUILT_IN_PANEL_RENDERERS) {
    if (!renderers.panels.has(id)) {
      renderers.panels.register(id, component);
    }
  }

  const builtInProperties = createDefaultPropertyRenderers();
  for (const id of builtInProperties.listIds()) {
    if (!renderers.properties.has(id)) {
      renderers.properties.register(id, builtInProperties.get(id));
    }
  }

  return renderers;
}
