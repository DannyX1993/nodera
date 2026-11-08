import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PROPERTY_TYPES } from "@nodera/property-system";
import type { PanelDefinition } from "@nodera/ui-core";

import { createShellStore } from "../components/shell/test-helpers.js";
import { createComponentRenderers } from "../registries/component-registry.js";
import { createTestEditor } from "../test/fixtures.js";
import { NoderaUiProvider } from "../providers/ui-provider.js";
import { DEFAULT_PANELS } from "./default-panels.js";
import { defaultPropertyRenderer } from "../components/inspector/property-renderers/defaults.js";
import { createDefaultComponentRenderers } from "./default-renderers.js";

afterEach(cleanup);

function panelDefinition(id: string): PanelDefinition {
  const definition = DEFAULT_PANELS.find((panel) => panel.id === id);
  if (definition === undefined) {
    throw new Error(`missing preset panel: ${id}`);
  }
  return definition;
}

describe("createDefaultComponentRenderers", () => {
  it("registers a built-in renderer for every preset panel", () => {
    const renderers = createDefaultComponentRenderers();

    expect(renderers.panels.listIds()).toEqual([
      "nodera.panel.header",
      "nodera.panel.footer",
      "nodera.panel.palette",
      "nodera.panel.navigator",
      "nodera.panel.search",
      "nodera.panel.minimap",
      "nodera.panel.properties",
      "nodera.panel.inspector",
      "nodera.panel.validation",
      "nodera.panel.history",
      "nodera.panel.metadata",
    ]);

    const presetRendererIds = DEFAULT_PANELS.map((panel) => panel.renderer ?? panel.id);
    expect([...renderers.panels.listIds()].sort()).toEqual([...presetRendererIds].sort());
  });

  it("keeps the toolbar registry empty so the built-in toolbar stays the default", () => {
    const renderers = createDefaultComponentRenderers();

    expect(renderers.toolbars.size).toBe(0);
  });

  it("merges the built-in property renderers for every property type", () => {
    const renderers = createDefaultComponentRenderers();

    expect(renderers.properties.listIds()).toEqual([...PROPERTY_TYPES]);
    for (const type of PROPERTY_TYPES) {
      expect(renderers.properties.get(type)).toBe(defaultPropertyRenderer(type));
    }
  });

  it("renders the existing component of a built-in panel renderer", () => {
    const renderers = createDefaultComponentRenderers();
    const store = createShellStore();
    const editor = createTestEditor();
    const PaletteRenderer = renderers.panels.get("nodera.panel.palette");

    const { container } = render(
      <NoderaUiProvider store={store} editor={editor}>
        <PaletteRenderer panel={panelDefinition("palette")} />
      </NoderaUiProvider>,
    );

    expect(container.querySelector("[data-nodera-palette]")).not.toBeNull();
  });

  it("renders a built-in panel renderer that needs no provider state", () => {
    const Renderer = createDefaultComponentRenderers().panels.get("nodera.panel.header");
    const { container } = render(<Renderer panel={panelDefinition("header")} />);

    expect(
      container.querySelector('[data-nodera-region-content="header"]'),
    ).not.toBeNull();
  });

  it("returns independent registries on every call", () => {
    const first = createDefaultComponentRenderers();
    const second = createDefaultComponentRenderers();

    first.panels.unregister("nodera.panel.palette");

    expect(second.panels.has("nodera.panel.palette")).toBe(true);
    expect(createComponentRenderers().panels.size).toBe(0);
  });
});
