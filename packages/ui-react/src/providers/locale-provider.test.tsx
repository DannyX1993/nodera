import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EDITOR_LAYOUT_ID } from "@nodera/layout-engine";
import { DEFAULT_THEME_ID } from "@nodera/theme-engine";
import { DEFAULT_LOCALE, UiStateStore, type Locale } from "@nodera/ui-core";

import { NodePalette } from "../components/discovery/node-palette.js";
import { PanelChrome } from "../components/shell/panel-chrome.js";
import { createTestEditor } from "../test/fixtures.js";
import { LocaleProvider, useLocale, useTranslate } from "./locale-provider.js";
import { NoderaUiProvider } from "./ui-provider.js";

afterEach(cleanup);

/** Host catalog that translates one message per surface and leaves the rest out. */
const SPANISH: Locale = {
  code: "es",
  messages: {
    "palette.empty": "Sin definiciones de nodo",
    "panel.hide": "Ocultar {title}",
  },
};

function createStore(): UiStateStore {
  return new UiStateStore({ themeId: DEFAULT_THEME_ID, layoutId: EDITOR_LAYOUT_ID });
}

function renderPalette(options: {
  readonly locale?: Locale;
  readonly emptyMessage?: string;
}): ReturnType<typeof render> {
  return render(
    <NoderaUiProvider
      store={createStore()}
      editor={createTestEditor()}
      {...(options.locale === undefined ? {} : { locale: options.locale })}
    >
      <NodePalette
        definitions={[]}
        {...(options.emptyMessage === undefined ? {} : { emptyMessage: options.emptyMessage })}
      />
    </NoderaUiProvider>,
  );
}

describe("useLocale", () => {
  it("falls back to the default en locale outside a provider", () => {
    const { result } = renderHook(() => useLocale());
    expect(result.current).toBe(DEFAULT_LOCALE);
  });

  it("returns the locale of the nearest provider", () => {
    const { result } = renderHook(() => useLocale(), {
      wrapper: ({ children }) => <LocaleProvider locale={SPANISH}>{children}</LocaleProvider>,
    });
    expect(result.current).toBe(SPANISH);
  });
});

describe("useTranslate", () => {
  it("resolves the default en catalog outside a provider instead of throwing", () => {
    const { result } = renderHook(() => useTranslate());

    expect(result.current("history.undo")).toBe("Undo");
    expect(result.current("palette.addNode", { name: "Datasource" })).toBe("Add Datasource");
  });

  it("resolves the provider catalog, then the en default, then the key", () => {
    const { result } = renderHook(() => useTranslate(), {
      wrapper: ({ children }) => <LocaleProvider locale={SPANISH}>{children}</LocaleProvider>,
    });

    expect(result.current("palette.empty")).toBe("Sin definiciones de nodo");
    expect(result.current("history.redo")).toBe("Redo");
    expect(result.current("surface.unknownKey")).toBe("surface.unknownKey");
  });
});

describe("NoderaUiProvider locale", () => {
  it("renders the en catalog when the host supplies no locale", () => {
    const { container } = renderPalette({});

    expect(container.querySelector("[data-nodera-palette-empty]")?.textContent).toBe(
      "No node definitions",
    );
  });

  it("renders the host catalog when the host supplies a locale", () => {
    const { container } = renderPalette({ locale: SPANISH });

    expect(container.querySelector("[data-nodera-palette-empty]")?.textContent).toBe(
      "Sin definiciones de nodo",
    );
  });

  it("interpolates the parameters of a translated message", () => {
    render(
      <NoderaUiProvider store={createStore()} locale={SPANISH}>
        <PanelChrome panelId="inspector" title="Properties" hideable onHide={() => {}}>
          <span>body</span>
        </PanelChrome>
      </NoderaUiProvider>,
    );

    expect(screen.getByRole("button", { name: "Ocultar Properties" })).toBeDefined();
  });

  it("keeps the host prop ahead of the catalog", () => {
    const { container } = renderPalette({
      locale: SPANISH,
      emptyMessage: "Nothing here",
    });

    expect(container.querySelector("[data-nodera-palette-empty]")?.textContent).toBe(
      "Nothing here",
    );
  });
});
