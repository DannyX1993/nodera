import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { selectNode } from "@nodera/application";

import { MinimapPanel, projectNodes } from "./minimap-panel.js";
import { addTestNode, createDiscoveryEditor, renderWithEditor } from "./test-helpers.js";

afterEach(cleanup);

const AREA = { width: 220, height: 140, padding: 12 } as const;

function required<T extends Element>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}

describe("projectNodes", () => {
  it("reports an empty projection for an empty graph", () => {
    const projection = projectNodes([], AREA);

    expect(projection.nodes).toEqual([]);
    expect(projection.empty).toBe(true);
  });

  it("fits a single node into the padded area, preserving its aspect", () => {
    const projection = projectNodes([{ id: "n1", x: 500, y: 500 }], AREA);

    expect(projection.empty).toBe(false);
    const [box] = projection.nodes;
    expect(box?.id).toBe("n1");
    expect(box?.x).toBeCloseTo(12, 6);
    expect(box?.y).toBeCloseTo(21, 6);
    expect(box?.width).toBeCloseTo(196, 6);
    expect(box?.height).toBeCloseTo(98, 6);
  });

  it("scales every node by the same factor, so relative positions hold", () => {
    const projection = projectNodes(
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 500, y: 0 },
      ],
      AREA,
    );

    const [first, second] = projection.nodes;
    expect(first?.id).toBe("a");
    expect(second?.id).toBe("b");
    const distance = (second?.x ?? 0) - (first?.x ?? 0);
    expect(distance).toBeCloseTo(500 * ((first?.width ?? 0) / 120), 6);
    expect(first?.width).toBeCloseTo(second?.width ?? 0, 6);
    expect((first?.width ?? 0) / (first?.height ?? 1)).toBeCloseTo(2, 6);
  });

  it("keeps every box inside the padded area", () => {
    const projection = projectNodes(
      [
        { id: "a", x: -400, y: -300, width: 200, height: 100 },
        { id: "b", x: 900, y: 700 },
      ],
      AREA,
    );

    for (const box of projection.nodes) {
      expect(box.x).toBeGreaterThanOrEqual(AREA.padding);
      expect(box.y).toBeGreaterThanOrEqual(AREA.padding);
      expect(box.x + box.width).toBeLessThanOrEqual(AREA.width - AREA.padding + 1e-6);
      expect(box.y + box.height).toBeLessThanOrEqual(AREA.height - AREA.padding + 1e-6);
      expect(box.width).toBeGreaterThanOrEqual(0);
      expect(box.height).toBeGreaterThanOrEqual(0);
    }
  });

  it("never produces negative or NaN sizes for degenerate input", () => {
    const tiny = projectNodes([{ id: "a", x: 0, y: 0 }], { width: 10, height: 10, padding: 12 });
    const collapsed = projectNodes(
      [{ id: "b", x: 0, y: 0, width: 0, height: 0 }],
      AREA,
    );

    for (const box of [...tiny.nodes, ...collapsed.nodes]) {
      expect(Number.isFinite(box.x)).toBe(true);
      expect(Number.isFinite(box.y)).toBe(true);
      expect(Number.isFinite(box.width)).toBe(true);
      expect(Number.isFinite(box.height)).toBe(true);
      expect(box.width).toBeGreaterThanOrEqual(0);
      expect(box.height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("MinimapPanel", () => {
  it("renders one labelled rect per node inside an svg", () => {
    const editor = createDiscoveryEditor();
    addTestNode(editor, {
      nodeId: "node-alpha",
      name: "Alpha",
      position: { x: 0, y: 0 },
    });
    addTestNode(editor, {
      nodeId: "node-beta",
      name: "Beta",
      position: { x: 400, y: 200 },
    });

    const { container } = renderWithEditor(<MinimapPanel />, { editor });

    const svg = required(container, "[data-nodera-minimap]");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    const rects = [...container.querySelectorAll("[data-nodera-minimap-node]")];
    expect(rects.map((rect) => rect.getAttribute("data-nodera-minimap-node"))).toEqual([
      "node-alpha",
      "node-beta",
    ]);
    expect(
      required(container, '[data-nodera-minimap-node="node-alpha"]').getAttribute("aria-label"),
    ).toBe("Alpha");
  });

  it("reports the configured panel size", () => {
    const editor = createDiscoveryEditor();
    const { container } = renderWithEditor(<MinimapPanel width={300} height={200} />, { editor });

    const svg = required(container, "[data-nodera-minimap]");
    expect(svg.getAttribute("width")).toBe("300");
    expect(svg.getAttribute("height")).toBe("200");
  });

  it("renders the empty message for a graph without nodes", () => {
    const { container } = renderWithEditor(<MinimapPanel />, { editor: createDiscoveryEditor() });

    expect(required(container, "[data-nodera-minimap-empty]").textContent).toBe("No nodes to show");
    expect(container.querySelector("[data-nodera-minimap-node]")).toBeNull();
  });

  it("marks the selected node distinctly", () => {
    const editor = createDiscoveryEditor();
    addTestNode(editor, { nodeId: "node-alpha", name: "Alpha", position: { x: 0, y: 0 } });
    addTestNode(editor, { nodeId: "node-beta", name: "Beta", position: { x: 400, y: 200 } });
    const { container } = renderWithEditor(<MinimapPanel />, { editor });

    act(() => {
      selectNode(editor, { nodeId: "node-beta" });
    });

    const selected = required(container, '[data-nodera-minimap-node="node-beta"]');
    const other = required(container, '[data-nodera-minimap-node="node-alpha"]');
    expect(selected.getAttribute("class")).toContain("nodera-minimap-selected");
    expect(selected.getAttribute("stroke")).toBe("var(--ndr-selection-outline-color, #2563eb)");
    expect(other.getAttribute("class") ?? "").not.toContain("nodera-minimap-selected");
    expect(other.getAttribute("stroke")).not.toBe(selected.getAttribute("stroke"));
  });

  it("selects the clicked node through the editor commands", () => {
    const editor = createDiscoveryEditor();
    addTestNode(editor, { nodeId: "node-alpha", name: "Alpha", position: { x: 0, y: 0 } });
    const { container } = renderWithEditor(<MinimapPanel />, { editor });

    fireEvent.click(required(container, '[data-nodera-minimap-node="node-alpha"]'));

    expect(editor.getSelectedNodes()).toEqual(["node-alpha"]);
  });
});
