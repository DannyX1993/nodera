import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement, ReactNode } from "react";

import { assertOk, createBuilder, type Builder } from "@nodera/sdk";
import { PanelHost, useNoderaUi, usePanelRegistry, useTheme } from "@nodera/ui-react";

import {
  NoderaBuilderProvider,
  useBuilder,
  useBuilderRenderers,
  type NoderaBuilderProviderProps,
} from "./builder-provider.js";
import type { RendererSet } from "../renderers/renderer-set.js";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const DARK_THEME_ID = "nodera.dark";

const NotesPanel = (): ReactNode => (
  <p data-testid="host-notes-panel">Host notes panel</p>
);

const HostPalette = (): ReactNode => (
  <p data-testid="host-palette">Host palette</p>
);

function createTestBuilder(): Builder {
  return assertOk(createBuilder({}));
}

function provider(
  builder: Builder,
  children: ReactNode,
  base?: NoderaBuilderProviderProps["base"],
): ReactElement {
  return (
    <NoderaBuilderProvider builder={builder} {...(base === undefined ? {} : { base })}>
      {children}
    </NoderaBuilderProvider>
  );
}

afterEach(cleanup);

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

describe("NoderaBuilderProvider", () => {
  it("renders its children", () => {
    render(provider(createTestBuilder(), <p data-testid="child">Child</p>));
    expect(screen.getByTestId("child").textContent).toBe("Child");
  });

  it("exposes the very same builder through useBuilder()", () => {
    const builder = createTestBuilder();
    const seen: Builder[] = [];
    function Probe(): ReactNode {
      seen.push(useBuilder());
      return null;
    }

    render(provider(builder, <Probe />));
    expect(seen).toEqual([builder]);
  });

  it("throws a clear error for useBuilder() outside the provider", () => {
    function Probe(): ReactNode {
      useBuilder();
      return null;
    }

    expect(() => render(<Probe />)).toThrow(/useBuilder must be used inside <NoderaBuilderProvider>/);
  });
});

/* ------------------------------------------------------------------ */
/*  Builder contributions reach the UI (D11)                           */
/* ------------------------------------------------------------------ */

describe("NoderaBuilderProvider builder contributions", () => {
  it("renders a panel registered through the builder", () => {
    const builder = createTestBuilder();
    const panel = assertOk(
      builder.registerPanel({
        id: "acme.panel.notes",
        title: "Notes",
        region: "left",
        renderer: "acme.panel.notes",
      }),
    );
    assertOk(builder.bindRenderer("panels", panel.renderer ?? panel.id, NotesPanel));

    render(provider(builder, <PanelHost panelId="acme.panel.notes" />));

    expect(screen.getByTestId("host-notes-panel").textContent).toBe("Host notes panel");
    expect(screen.getByText("Notes")).toBeDefined();
  });

  it("replaces the built-in renderer of an existing panel", () => {
    const builder = createTestBuilder();
    assertOk(builder.bindRenderer("panels", "nodera.panel.palette", HostPalette));

    const { container } = render(provider(builder, <PanelHost panelId="palette" />));

    expect(screen.getByTestId("host-palette")).toBeDefined();
    // The built-in palette never renders when a host binding owns its id.
    expect(container.querySelector("[data-nodera-palette]")).toBeNull();
  });

  it("wires the builder's own state and registries into the UI", () => {
    const builder = createTestBuilder();
    let store: unknown;
    let panels: unknown;

    function Probe(): ReactNode {
      const ui = useNoderaUi();
      store = ui.store;
      panels = usePanelRegistry();
      return <span data-testid="theme">{useTheme().id}</span>;
    }

    const { rerender } = render(provider(builder, <Probe />));

    expect(store).toBe(builder.store);
    expect(panels).toBe(builder.registries.panels);
    expect(screen.getByTestId("theme").textContent).toBe(builder.theme.active().id);

    act(() => {
      assertOk(builder.theme.setDefault(DARK_THEME_ID));
    });
    rerender(provider(builder, <Probe />));

    expect(screen.getByTestId("theme").textContent).toBe(DARK_THEME_ID);
    expect(builder.store.getState().themeId).toBe(DARK_THEME_ID);
  });
});

/* ------------------------------------------------------------------ */
/*  Renderer set memoization                                           */
/* ------------------------------------------------------------------ */

describe("NoderaBuilderProvider renderer set", () => {
  it("keeps one renderer set until the builder bindings change", () => {
    const builder = createTestBuilder();
    const seen: RendererSet[] = [];

    function Probe(): ReactNode {
      seen.push(useBuilderRenderers());
      return null;
    }

    const { rerender } = render(provider(builder, <Probe />));
    rerender(provider(builder, <Probe />));

    expect(seen.length).toBeGreaterThanOrEqual(2);
    const first = seen[0];
    expect(seen[seen.length - 1]).toBe(first);

    assertOk(builder.bindRenderer("panels", "acme.panel.notes", NotesPanel));
    rerender(provider(builder, <Probe />));

    const latest = seen[seen.length - 1];
    expect(latest).not.toBe(first);
    expect(latest?.components.panels.tryGet("acme.panel.notes")).toBe(NotesPanel);
  });
});
