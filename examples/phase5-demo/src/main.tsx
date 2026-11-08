/**
 * Bootstrap of the Phase 5 demo host.
 *
 * It creates the editor session through the application layer, builds the
 * registries the UI exposes, applies the initial theme and layout and mounts the
 * composed editor. Everything is host-owned: the framework reads these
 * registries, it never creates them behind the host's back.
 */

import "@xyflow/react/dist/style.css";

import { createRoot } from "react-dom/client";

import {
  EDITOR_LAYOUT,
  EDITOR_LAYOUT_ID,
  LayoutRegistry,
  PREDEFINED_LAYOUTS,
  createLayoutState,
} from "@nodera/layout-engine";
import { DEFAULT_THEME_ID, ThemeRegistry } from "@nodera/theme-engine";
import { UiStateStore } from "@nodera/ui-core";
import {
  createDefaultComponentRenderers,
  createDefaultPanelRegistry,
  createDefaultToolRegistry,
} from "@nodera/ui-react";

import { DemoValidationPanel, VALIDATION_RENDERER_ID } from "./brand.js";
import { DEMO_WORKSPACE_LAYOUT, createDemoEditor } from "./definitions.js";
import { DemoApp } from "./demo.js";

/* ------------------------------------------------------------------ */
/*  1. Editor session: definitions, registries and the seeded graph    */
/* ------------------------------------------------------------------ */

const editor = createDemoEditor();

/* ------------------------------------------------------------------ */
/*  2. Registries the host offers to the UI                            */
/* ------------------------------------------------------------------ */

const panelRegistry = createDefaultPanelRegistry();

// The host declares its own layout next to the predefined ones (S4).
const layoutRegistry = new LayoutRegistry({
  layouts: [...PREDEFINED_LAYOUTS, DEMO_WORKSPACE_LAYOUT],
});

const themeRegistry = new ThemeRegistry();
const toolRegistry = createDefaultToolRegistry();

// Component replacement (S3 Level 2): the demo keeps the framework palette and
// property renderers but swaps the validation panel for a host composition that
// adds its own action. The `brand` toggle in the header swaps two more at
// runtime.
const renderers = createDefaultComponentRenderers();
renderers.panels.replace(VALIDATION_RENDERER_ID, DemoValidationPanel);
// The toolbar keeps the built-in path: no renderer is registered for its id.

/* ------------------------------------------------------------------ */
/*  3. UI state: theme + initial layout                                */
/* ------------------------------------------------------------------ */

const store = new UiStateStore({
  themeId: DEFAULT_THEME_ID,
  layoutId: EDITOR_LAYOUT_ID,
  layout: createLayoutState(EDITOR_LAYOUT, { panels: panelRegistry.all() }),
});

/* ------------------------------------------------------------------ */
/*  4. Mount                                                           */
/* ------------------------------------------------------------------ */

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root mount point");
}

createRoot(root).render(
  <DemoApp
    editor={editor}
    store={store}
    themeRegistry={themeRegistry}
    layoutRegistry={layoutRegistry}
    panelRegistry={panelRegistry}
    toolRegistry={toolRegistry}
    renderers={renderers}
  />,
);
