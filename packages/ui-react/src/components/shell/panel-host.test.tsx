import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EditorEngine } from "@nodera/application";
import type { PanelDefinition } from "@nodera/ui-core";

import { createDefaultPanelRegistry } from "@nodera/ui-core";
import { createDefaultComponentRenderers } from "../../defaults/default-renderers.js";
import { NoderaUiProvider } from "../../providers/ui-provider.js";
import {
  createComponentRenderers,
  type PanelRendererProps,
} from "../../registries/component-registry.js";
import { PanelHost } from "./panel-host.js";
import { createShellStore, renderWithUi } from "./test-helpers.js";

afterEach(cleanup);

function CustomPanel({ panel }: PanelRendererProps) {
  return <span data-testid="custom-panel">{panel.title}</span>;
}

function panelState(store: ReturnType<typeof createShellStore>, panelId: string) {
  return store.getState().layout?.panels.find((panel) => panel.panelId === panelId);
}

describe("PanelHost", () => {
  it("renders nothing for a panel the host does not register", () => {
    const { container } = renderWithUi(<PanelHost panelId="acme.unknown-panel" />);

    expect(container.querySelector("[data-nodera-panel-id]")).toBeNull();
    expect(container.querySelector("[data-nodera-panel-unregistered]")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("renders an explicit placeholder for a panel without a registered renderer", () => {
    const { container } = renderWithUi(<PanelHost panelId="palette" />);

    const placeholder = container.querySelector<HTMLElement>(
      '[data-nodera-panel-unregistered="palette"]',
    );
    expect(placeholder).not.toBeNull();
    expect(placeholder?.textContent).toContain("Node palette");
  });

  it("renders the registered renderer inside the panel chrome", () => {
    const renderers = createComponentRenderers();
    renderers.panels.register("nodera.panel.palette", CustomPanel);

    const { container } = renderWithUi(<PanelHost panelId="palette" />, { renderers });

    const chrome = container.querySelector<HTMLElement>('[data-nodera-panel-id="palette"]');
    expect(chrome).not.toBeNull();
    expect(screen.getByTestId("custom-panel").textContent).toBe("Node palette");
    expect(chrome?.textContent).toContain("Node palette");
  });

  it("resolves the renderer from the panel id when the panel declares none", () => {
    const panelRegistry = createDefaultPanelRegistry();
    const panel: PanelDefinition = {
      id: "acme.panel.custom",
      title: "Custom panel",
      region: "left",
      size: 200,
    };
    panelRegistry.register(panel);

    const renderers = createComponentRenderers();
    renderers.panels.register("acme.panel.custom", CustomPanel);

    renderWithUi(<PanelHost panelId="acme.panel.custom" />, { renderers, panelRegistry });

    expect(screen.getByTestId("custom-panel").textContent).toBe("Custom panel");
  });

  it("toggles a hideable panel in the layout state when the chrome hides it", () => {
    const store = createShellStore();
    const renderers = createComponentRenderers();
    renderers.panels.register("nodera.panel.palette", CustomPanel);

    renderWithUi(<PanelHost panelId="palette" />, { store, renderers });
    expect(panelState(store, "palette")?.visible).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Hide Node palette" }));

    expect(panelState(store, "palette")?.visible).toBe(false);
  });

  it("renders a built-in external panel that no layout region places", () => {
    const store = createShellStore();
    const renderers = createDefaultComponentRenderers();
    const editor = new EditorEngine({ graphId: "graph-external-panel" });

    // The external panel is deliberately absent from the applied layout: an
    // external panel is mounted by the host wherever it wants, and its region
    // only keeps it out of the shell geometry (S4 "paneles externos al canvas").
    expect(
      store.getState().layout?.panels.some((panel) => panel.panelId === "metadata"),
    ).toBe(false);

    // `MetadataPanel` is editor-bound, so the host provides the editor it needs;
    // no region, slot or extra chrome prop is required to mount it.
    const { container } = render(
      <NoderaUiProvider store={store} editor={editor} renderers={renderers}>
        <PanelHost panelId="metadata" />
      </NoderaUiProvider>,
    );

    const chrome = container.querySelector<HTMLElement>('[data-nodera-panel-id="metadata"]');
    expect(chrome).not.toBeNull();
    expect(chrome?.textContent).toContain("Metadata");
    expect(container.querySelector("[data-nodera-metadata-panel]")).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>('[data-nodera-metadata="graph-id"]')?.textContent,
    ).toBe("graph-external-panel");
    expect(container.querySelector("[data-nodera-panel-unregistered]")).toBeNull();
  });

  it("offers no hide action for a panel the definition marks as not hideable", () => {
    const renderers = createComponentRenderers();
    renderers.panels.register("nodera.panel.header", CustomPanel);

    renderWithUi(<PanelHost panelId="header" />, { renderers });

    expect(screen.queryByRole("button", { name: "Hide Header" })).toBeNull();
  });
});

describe("PanelHost pointer interaction", () => {
  it("opts into pointer events so a panel mounted in a pointer-transparent overlay stays interactive", () => {
    // Regression pin: CanvasContainer overlays are `pointer-events: none`; a panel
    // placed there (search, floating panels) must opt in or it cannot be used.
    const renderers = createComponentRenderers();
    renderers.panels.register("nodera.panel.palette", CustomPanel);
    const { container } = renderWithUi(<PanelHost panelId="palette" />, { renderers });

    const chrome = container.querySelector<HTMLElement>('[data-nodera-panel-id="palette"]');
    expect(chrome).not.toBeNull();
    expect(chrome?.style.pointerEvents).toBe("auto");
  });
});
