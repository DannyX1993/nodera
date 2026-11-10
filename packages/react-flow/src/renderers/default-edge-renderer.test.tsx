import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Position } from "@xyflow/react";

import { DefaultEdgeRenderer, defaultEdgeOptionsFromVisual } from "./default-edge-renderer.js";
import type { EdgeVisual } from "@nodera/edge-registry";

/* ------------------------------------------------------------------ */
/*  defaultEdgeOptionsFromVisual tests                                 */
/* ------------------------------------------------------------------ */

describe("defaultEdgeOptionsFromVisual", () => {
  it("returns undefined when visual is absent", () => {
    expect(defaultEdgeOptionsFromVisual(undefined)).toBeUndefined();
  });

  it("solid → strokeDasharray undefined", () => {
    const opts = defaultEdgeOptionsFromVisual({ lineStyle: "solid" });
    expect(opts?.strokeDasharray).toBeUndefined();
  });

  it("dashed → strokeDasharray '6 6'", () => {
    const opts = defaultEdgeOptionsFromVisual({ lineStyle: "dashed" });
    expect(opts?.strokeDasharray).toBe("6 6");
  });

  it("dotted → strokeDasharray '2 4'", () => {
    const opts = defaultEdgeOptionsFromVisual({ lineStyle: "dotted" });
    expect(opts?.strokeDasharray).toBe("2 4");
  });

  it("color → stroke", () => {
    const opts = defaultEdgeOptionsFromVisual({ color: "#ff0000" });
    expect(opts?.stroke).toBe("#ff0000");
  });

  it("no color → no stroke in options", () => {
    const opts = defaultEdgeOptionsFromVisual({});
    expect(opts?.stroke).toBeUndefined();
  });

  it("animation 'flow' → animated true", () => {
    const opts = defaultEdgeOptionsFromVisual({ animation: "flow" });
    expect(opts?.animated).toBe(true);
  });

  it("animation 'none' → animated undefined", () => {
    const opts = defaultEdgeOptionsFromVisual({ animation: "none" });
    expect(opts?.animated).toBeUndefined();
  });

  it("arrowStart → markerStart", () => {
    const opts = defaultEdgeOptionsFromVisual({ arrowStart: true });
    expect(opts?.markerStart).toBeDefined();
  });

  it("arrowEnd → markerEnd", () => {
    const opts = defaultEdgeOptionsFromVisual({ arrowEnd: true });
    expect(opts?.markerEnd).toBeDefined();
  });

  it("arrowStart false → no markerStart", () => {
    const opts = defaultEdgeOptionsFromVisual({ arrowStart: false });
    expect(opts?.markerStart).toBeUndefined();
  });

  it("arrowEnd false → no markerEnd", () => {
    const opts = defaultEdgeOptionsFromVisual({ arrowEnd: false });
    expect(opts?.markerEnd).toBeUndefined();
  });

  it("combines lineStyle + color + animation + arrows", () => {
    const visual: EdgeVisual = {
      lineStyle: "dashed",
      color: "#00f",
      animation: "dash",
      arrowStart: true,
      arrowEnd: true,
    };
    const opts = defaultEdgeOptionsFromVisual(visual);
    expect(opts).toMatchObject({
      strokeDasharray: "6 6",
      stroke: "#00f",
      animated: true,
      markerStart: expect.anything(),
      markerEnd: expect.anything(),
    });
  });

  /* Renderer-only style hints, stored by the SDK under `metadata.style`. */

  it("metadata.style.strokeWidth → strokeWidth", () => {
    const opts = defaultEdgeOptionsFromVisual({
      metadata: { style: { strokeWidth: 2 } },
    });
    expect(opts?.strokeWidth).toBe(2);
  });

  it("metadata.style.dashArray as string → strokeDasharray", () => {
    const opts = defaultEdgeOptionsFromVisual({
      metadata: { style: { dashArray: "4 2" } },
    });
    expect(opts?.strokeDasharray).toBe("4 2");
  });

  it("metadata.style.dashArray as number[] → strokeDasharray", () => {
    const opts = defaultEdgeOptionsFromVisual({
      metadata: { style: { dashArray: [4, 2] } },
    });
    expect(opts?.strokeDasharray).toBe("4 2");
  });

  it("ignores an unknown metadata.style key", () => {
    const opts = defaultEdgeOptionsFromVisual({
      metadata: { style: { glow: "strong", strokeWidth: 2 } },
    });
    expect(opts).toEqual({ strokeWidth: 2 });
  });

  it("ignores a wrong-typed metadata.style.strokeWidth instead of coercing it", () => {
    const opts = defaultEdgeOptionsFromVisual({
      metadata: { style: { strokeWidth: "4", dashArray: 4 } },
    });
    expect(opts).toBeUndefined();
  });

  it("ignores a metadata.style that is not an object", () => {
    const opts = defaultEdgeOptionsFromVisual({ metadata: { style: "stroke:2" } });
    expect(opts).toBeUndefined();
  });

  it("keeps the lineStyle shorthand when a style hint is absent", () => {
    const opts = defaultEdgeOptionsFromVisual({ lineStyle: "dashed", metadata: {} });
    expect(opts?.strokeDasharray).toBe("6 6");
    expect(opts?.strokeWidth).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/*  DefaultEdgeRenderer style hints                                    */
/* ------------------------------------------------------------------ */

/**
 * The definition's renderer-only style hints reach a renderer as
 * `data.styleHints`, mapped by `toReactFlowEdges` from `visual.metadata.style`.
 * The renderer applies a hint when it is present and keeps the token fallback
 * (`var(--ndr-edge-*)`) otherwise.
 */
describe("DefaultEdgeRenderer renderer-only style hints", () => {
  function renderEdge(data: Record<string, unknown> = {}) {
    return render(
      <DefaultEdgeRenderer
        id="e1"
        source="n1"
        target="n2"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        data={data}
      />,
    );
  }

  it("keeps the token fallbacks when the definition declares no hints", () => {
    const path = renderEdge().container.querySelector("path");
    expect((path as SVGPathElement).style.strokeWidth).toBe(
      "var(--ndr-edge-stroke-width, 1.5)",
    );
    expect((path as SVGPathElement).style.strokeDasharray).toBe("");
  });

  it("draws with a strokeWidth hint from the edge data", () => {
    const path = renderEdge({ styleHints: { strokeWidth: 3 } }).container.querySelector("path");
    expect((path as SVGPathElement).style.strokeWidth).toBe("3");
  });

  it("draws with a dashArray hint from the edge data", () => {
    const path = renderEdge({ styleHints: { dashArray: "4 2" } }).container.querySelector("path");
    expect((path as SVGPathElement).style.strokeDasharray).toBe("4 2");
  });

  it("ignores a wrong-typed hint and keeps the token fallbacks", () => {
    const path = renderEdge({ styleHints: { strokeWidth: "3", dashArray: 4 } }).container.querySelector(
      "path",
    );
    expect((path as SVGPathElement).style.strokeWidth).toBe(
      "var(--ndr-edge-stroke-width, 1.5)",
    );
    expect((path as SVGPathElement).style.strokeDasharray).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/*  DefaultEdgeRenderer as a React Flow custom edge                    */
/* ------------------------------------------------------------------ */

describe("DefaultEdgeRenderer (React Flow EdgeProps)", () => {
  it("renders a computed path from edge coordinates", () => {
    const { container } = render(
      <DefaultEdgeRenderer
        id="e1"
        source="n1"
        target="n2"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        data={{}}
      />,
    );
    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    expect(path?.getAttribute("d")).toBeTruthy();
  });

  // Note: the EdgeLabelRenderer label branch is not unit-testable in jsdom
  // (React Flow needs real viewport dimensions to mount the label portal).
  // It follows the standard React Flow custom-edge pattern and is verified
  // visually in examples/phase4-demo.

  it("marks the path as selected for non-color-only selection", () => {
    const { container } = render(
      <DefaultEdgeRenderer
        id="e1"
        source="n1"
        target="n2"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        data={{}}
        selected
      />,
    );
    expect(container.querySelector(".nodera-edge-selected")).not.toBeNull();
  });

  /* ---------------------------------------------------------------- */
  /*  Token-driven edge styles (S3 Edge Styles, D8)                    */
  /* ---------------------------------------------------------------- */

  function renderEdgePath(selected = false) {
    const { container } = render(
      <DefaultEdgeRenderer
        id="e1"
        source="n1"
        target="n2"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        data={{}}
        selected={selected}
      />,
    );
    return container.querySelector(".react-flow__edge-path") as SVGPathElement;
  }

  it("styles the edge path from the edge tokens", () => {
    const path = renderEdgePath();

    expect(path.style.getPropertyValue("stroke")).toBe(
      "var(--ndr-edge-stroke-color, #7c8896)",
    );
    expect(path.style.getPropertyValue("stroke-width")).toBe(
      "var(--ndr-edge-stroke-width, 1.5)",
    );
  });

  it("styles a selected edge path from the selected edge tokens", () => {
    const path = renderEdgePath(true);

    expect(path.style.getPropertyValue("stroke")).toBe(
      "var(--ndr-edge-stroke-color-selected, #2563eb)",
    );
    expect(path.style.getPropertyValue("stroke-width")).toBe(
      "var(--ndr-edge-stroke-width-selected, 2.5)",
    );
  });

  it("forwards markerStart and markerEnd to the rendered path", () => {
    // React Flow hands the edge component the resolved `url(#…)` marker
    // references it derived from the edge object; the renderer must pass them
    // through to `BaseEdge` or the arrows never paint (the mapper sets them,
    // the path renders, and no arrow appears at either end).
    const { container } = render(
      <DefaultEdgeRenderer
        id="e1"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={0}
        sourcePosition={Position.Right}
        targetPosition={Position.Left}
        data={{}}
        source="n1"
        target="n2"
        markerStart="url(#a)"
        markerEnd="url(#b)"
      />,
    );

    const path = container.querySelector(".react-flow__edge-path");
    expect(path?.getAttribute("marker-start")).toBe("url(#a)");
    expect(path?.getAttribute("marker-end")).toBe("url(#b)");
  });
});
