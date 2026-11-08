import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CanvasContainer } from "./canvas-container.js";

afterEach(cleanup);

describe("CanvasContainer", () => {
  it("renders the canvas children and fills the available space", () => {
    const { container } = render(
      <CanvasContainer>
        <span>canvas-content</span>
      </CanvasContainer>,
    );

    const root = container.querySelector<HTMLElement>("[data-nodera-canvas-container]");
    expect(root).not.toBeNull();
    expect(root?.textContent).toBe("canvas-content");
    expect(root?.style.position).toBe("relative");
    expect(root?.style.flexGrow).toBe("1");
    expect(root?.style.minWidth).toBe("0");
    expect(root?.style.minHeight).toBe("0");
  });

  it("renders the overlays in an absolutely positioned layer above the canvas", () => {
    const { container } = render(
      <CanvasContainer overlays={<span>overlay-content</span>}>
        <span>canvas-content</span>
      </CanvasContainer>,
    );

    const root = container.querySelector<HTMLElement>("[data-nodera-canvas-container]");
    const content = container.querySelector<HTMLElement>("[data-nodera-canvas-content]");
    const overlays = container.querySelector<HTMLElement>("[data-nodera-canvas-overlays]");

    expect(root?.textContent).toContain("canvas-content");
    expect(root?.textContent).toContain("overlay-content");
    expect(overlays?.textContent).toBe("overlay-content");
    expect(overlays?.style.position).toBe("absolute");
    expect(Number(overlays?.style.zIndex)).toBeGreaterThan(0);

    expect(content).not.toBeNull();
    expect(overlays).not.toBeNull();
    if (content !== null && overlays !== null) {
      // The overlay layer paints above the canvas content: it comes later in
      // document order and is positioned out of the flow.
      expect(
        content.compareDocumentPosition(overlays) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("renders no overlay layer when the host provides none", () => {
    const { container } = render(
      <CanvasContainer>
        <span>canvas-content</span>
      </CanvasContainer>,
    );

    expect(container.querySelector("[data-nodera-canvas-overlays]")).toBeNull();
  });
});
