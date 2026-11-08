import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PanelDefinition } from "@nodera/ui-core";

import { createDefaultPanelRegistry } from "../../defaults/default-panels.js";
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

  it("offers no hide action for a panel the definition marks as not hideable", () => {
    const renderers = createComponentRenderers();
    renderers.panels.register("nodera.panel.header", CustomPanel);

    renderWithUi(<PanelHost panelId="header" />, { renderers });

    expect(screen.queryByRole("button", { name: "Hide Header" })).toBeNull();
  });
});
