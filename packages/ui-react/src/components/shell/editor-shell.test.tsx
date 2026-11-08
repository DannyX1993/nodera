import { cleanup, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EDITOR_LAYOUT } from "@nodera/layout-engine";
import { DEFAULT_THEME_ID } from "@nodera/theme-engine";
import { UiStateStore, type LayoutState } from "@nodera/ui-core";

import { EditorShell } from "./editor-shell.js";
import { renderWithUi } from "./test-helpers.js";

/**
 * jsdom 26 does not implement `PointerEvent`, so `fireEvent.pointer*` would
 * build a plain `Event` and drop `clientX`/`clientY`. The shell maths reads the
 * pointer coordinate, so the suite supplies a `MouseEvent`-based stand-in that
 * carries those coordinates (the same shape browsers expose).
 */
if (typeof window.PointerEvent !== "function") {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    writable: true,
    value: class TestPointerEvent extends MouseEvent {},
  });
}

afterEach(cleanup);

function region(container: HTMLElement, name: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-nodera-region="${name}"]`);
}

function requiredRegion(container: HTMLElement, name: string): HTMLElement {
  const element = region(container, name);
  if (element === null) {
    throw new Error(`region '${name}' is not rendered`);
  }
  return element;
}

function splitterIds(container: HTMLElement): readonly string[] {
  return [...container.querySelectorAll<HTMLElement>("[data-nodera-splitter]")].map(
    (element) => element.getAttribute("data-nodera-splitter") ?? "",
  );
}

function requiredSplitter(container: HTMLElement, id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-nodera-splitter="${id}"]`);
  if (element === null) {
    throw new Error(`splitter '${id}' is not rendered`);
  }
  return element;
}

function allSlots(): ReactElement {
  return (
    <EditorShell
      slots={{
        header: <span>header-slot</span>,
        footer: <span>footer-slot</span>,
        left: <span>left-slot</span>,
        right: <span>right-slot</span>,
        bottom: <span>bottom-slot</span>,
        canvas: <span>canvas-slot</span>,
        floating: <span>floating-slot</span>,
      }}
    />
  );
}

describe("EditorShell", () => {
  it("renders every provided slot in its own region", () => {
    const layout: LayoutState = {
      panels: [
        { panelId: "header", region: "header", visible: true, size: 44 },
        { panelId: "footer", region: "footer", visible: true, size: 28 },
        { panelId: "palette", region: "left", visible: true, size: 240 },
        { panelId: "properties", region: "right", visible: true, size: 300 },
        { panelId: "validation", region: "bottom", visible: true, size: 160 },
      ],
    };
    const withFooter = new UiStateStore({
      themeId: DEFAULT_THEME_ID,
      layoutId: EDITOR_LAYOUT.id,
      layout,
    });

    const { container } = renderWithUi(allSlots(), { store: withFooter });

    expect(requiredRegion(container, "header").textContent).toBe("header-slot");
    expect(requiredRegion(container, "footer").textContent).toBe("footer-slot");
    expect(requiredRegion(container, "left").textContent).toBe("left-slot");
    expect(requiredRegion(container, "right").textContent).toBe("right-slot");
    expect(requiredRegion(container, "bottom").textContent).toBe("bottom-slot");
    expect(requiredRegion(container, "canvas").textContent).toBe("canvas-slot");
    expect(requiredRegion(container, "floating").textContent).toBe("floating-slot");

    expect(requiredRegion(container, "header").style.height).toBe("44px");
    expect(requiredRegion(container, "left").style.width).toBe("240px");
    expect(requiredRegion(container, "right").style.width).toBe("300px");
    expect(requiredRegion(container, "bottom").style.height).toBe("160px");
  });

  it("omits a region whose slot the host does not provide", () => {
    const { container } = renderWithUi(
      <EditorShell slots={{ canvas: <span>canvas-slot</span> }} />,
    );

    expect(region(container, "canvas")).not.toBeNull();
    expect(region(container, "header")).toBeNull();
    expect(region(container, "footer")).toBeNull();
    expect(region(container, "left")).toBeNull();
    expect(region(container, "right")).toBeNull();
    expect(region(container, "bottom")).toBeNull();
  });

  it("omits a region the applied layout hides or does not place", () => {
    const store = new UiStateStore({
      themeId: DEFAULT_THEME_ID,
      layoutId: EDITOR_LAYOUT.id,
      layout: {
        panels: [
          { panelId: "header", region: "header", visible: true, size: 44 },
          { panelId: "palette", region: "left", visible: false, size: 240 },
        ],
      },
    });

    const { container } = renderWithUi(
      <EditorShell
        slots={{
          header: <span>header-slot</span>,
          left: <span>left-slot</span>,
          footer: <span>footer-slot</span>,
          canvas: <span>canvas-slot</span>,
        }}
      />,
      { store },
    );

    expect(region(container, "header")).not.toBeNull();
    expect(region(container, "left")).toBeNull();
    expect(region(container, "footer")).toBeNull();
  });

  it("lets the canvas fill the remaining space of a full-size column shell", () => {
    const { container } = renderWithUi(
      <EditorShell
        slots={{
          header: <span>header-slot</span>,
          left: <span>left-slot</span>,
          canvas: <span>canvas-slot</span>,
        }}
      />,
    );

    const shell = container.querySelector<HTMLElement>("[data-nodera-shell]");
    expect(shell).not.toBeNull();
    expect(shell?.style.display).toBe("flex");
    expect(shell?.style.flexDirection).toBe("column");
    expect(shell?.style.width).toBe("100%");
    expect(shell?.style.height).toBe("100%");

    const canvas = requiredRegion(container, "canvas");
    expect(canvas.style.flexGrow).toBe("1");
    expect(canvas.style.minWidth).toBe("0");
    expect(canvas.style.minHeight).toBe("0");
  });

  it("renders the floating slot in an absolutely positioned overlay", () => {
    const { container } = renderWithUi(
      <EditorShell
        slots={{ canvas: <span>canvas-slot</span>, floating: <span>floating-slot</span> }}
      />,
    );

    const floating = requiredRegion(container, "floating");
    expect(floating.textContent).toBe("floating-slot");
    expect(floating.style.position).toBe("absolute");
  });

  it("renders no splitter unless the host asks for resize notifications", () => {
    const { container } = renderWithUi(
      <EditorShell
        slots={{ header: <span>h</span>, left: <span>l</span>, canvas: <span>c</span> }}
      />,
    );

    expect(splitterIds(container)).toEqual([]);
  });

  it("renders one separator per visible region when a resize handler is given", () => {
    const { container } = renderWithUi(
      <EditorShell
        slots={{
          header: <span>h</span>,
          left: <span>l</span>,
          bottom: <span>b</span>,
          canvas: <span>c</span>,
        }}
        onResizeRegion={() => {}}
      />,
    );

    expect(splitterIds(container)).toEqual(["header", "left", "bottom"]);

    const left = requiredSplitter(container, "left");
    expect(left.getAttribute("role")).toBe("separator");
    expect(left.getAttribute("aria-orientation")).toBe("vertical");

    const header = requiredSplitter(container, "header");
    expect(header.getAttribute("role")).toBe("separator");
    expect(header.getAttribute("aria-orientation")).toBe("horizontal");
  });

  it("reports the dragged left region size and never goes below 0", () => {
    const onResizeRegion = vi.fn();
    const { container } = renderWithUi(
      <EditorShell
        slots={{ left: <span>l</span>, canvas: <span>c</span> }}
        onResizeRegion={onResizeRegion}
      />,
    );

    const splitter = requiredSplitter(container, "left");
    fireEvent.pointerDown(splitter, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 260, pointerId: 1 });
    expect(onResizeRegion).toHaveBeenLastCalledWith("left", 300);

    fireEvent.pointerMove(document, { clientX: 100, pointerId: 1 });
    expect(onResizeRegion).toHaveBeenLastCalledWith("left", 140);

    fireEvent.pointerMove(document, { clientX: -400, pointerId: 1 });
    expect(onResizeRegion).toHaveBeenLastCalledWith("left", 0);

    fireEvent.pointerUp(document, { pointerId: 1 });
    const callsAfterRelease = onResizeRegion.mock.calls.length;
    fireEvent.pointerMove(document, { clientX: 500, pointerId: 1 });
    expect(onResizeRegion.mock.calls.length).toBe(callsAfterRelease);
  });

  it("moves each region along its own axis and direction", () => {
    const onRight = vi.fn();
    const right = renderWithUi(
      <EditorShell
        slots={{ right: <span>r</span>, canvas: <span>c</span> }}
        onResizeRegion={onRight}
      />,
    );
    const rightSplitter = requiredSplitter(right.container, "right");
    fireEvent.pointerDown(rightSplitter, { clientX: 800, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 760, pointerId: 1 });
    expect(onRight).toHaveBeenLastCalledWith("right", 340);
    fireEvent.pointerUp(document, { pointerId: 1 });
    right.unmount();

    const onBottom = vi.fn();
    const bottom = renderWithUi(
      <EditorShell
        slots={{ bottom: <span>b</span>, canvas: <span>c</span> }}
        onResizeRegion={onBottom}
      />,
    );
    const bottomSplitter = requiredSplitter(bottom.container, "bottom");
    fireEvent.pointerDown(bottomSplitter, { clientY: 700, pointerId: 1 });
    fireEvent.pointerMove(document, { clientY: 660, pointerId: 1 });
    expect(onBottom).toHaveBeenLastCalledWith("bottom", 200);
    fireEvent.pointerUp(document, { pointerId: 1 });
    bottom.unmount();

    const onHeader = vi.fn();
    const header = renderWithUi(
      <EditorShell
        slots={{ header: <span>h</span>, canvas: <span>c</span> }}
        onResizeRegion={onHeader}
      />,
    );
    const headerSplitter = requiredSplitter(header.container, "header");
    fireEvent.pointerDown(headerSplitter, { clientY: 44, pointerId: 1 });
    fireEvent.pointerMove(document, { clientY: 64, pointerId: 1 });
    expect(onHeader).toHaveBeenLastCalledWith("header", 64);
    fireEvent.pointerUp(document, { pointerId: 1 });
  });
});
