import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Position } from "@xyflow/react";
import type { CSSProperties } from "react";

import { DefaultEdgeRenderer, defaultEdgeOptionsFromVisual } from "./default-edge-renderer.js";
import { edgeStyleHints } from "./edge-options.js";
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

  /* Declared `width` key of the visual vocabulary. */

  it("declared width → strokeWidth", () => {
    const opts = defaultEdgeOptionsFromVisual({ width: 3 });
    expect(opts?.strokeWidth).toBe(3);
  });

  it("declared width wins over the metadata.style.strokeWidth hint", () => {
    const opts = defaultEdgeOptionsFromVisual({
      width: 3,
      metadata: { style: { strokeWidth: 1 } },
    });
    expect(opts?.strokeWidth).toBe(3);
  });

  it("edgeStyleHints merges declared width over the hint", () => {
    const hints = edgeStyleHints({
      width: 4,
      metadata: { style: { strokeWidth: 1, dashArray: "4 2" } },
    });
    expect(hints).toEqual({ strokeWidth: 4, dashArray: "4 2" });
  });

  it("a non-finite declared width is ignored, the hint still applies", () => {
    const opts = defaultEdgeOptionsFromVisual({
      // Non-finite values cannot reach the type through the SDK, but the
      // renderer reads definitions as data, so it must never coerce.
      width: Number.NaN,
      metadata: { style: { strokeWidth: 2 } },
    } as unknown as EdgeVisual);
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
  function renderEdge(data: Record<string, unknown> = {}, style?: CSSProperties) {
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
        {...(style === undefined ? {} : { style })}
      />,
    );
  }

  it("applies the mapped edge style over the token fallbacks", () => {
    // The mapper carries the definition's color and lineStyle as the edge's
    // React Flow style; a renderer that ignores it loses both.
    const path = renderEdge({}, { stroke: "#0a8f3c", strokeDasharray: "6 6" })
      .container.querySelector("path");
    expect((path as SVGPathElement).style.stroke).toBe("#0a8f3c");
    expect((path as SVGPathElement).style.strokeDasharray).toBe("6 6");
  });

  it("keeps a hint strokeWidth the mapped style does not set", () => {
    const path = renderEdge(
      { styleHints: { strokeWidth: 3 } },
      { stroke: "#0a8f3c" },
    ).container.querySelector("path");
    expect((path as SVGPathElement).style.strokeWidth).toBe("3");
    expect((path as SVGPathElement).style.stroke).toBe("#0a8f3c");
  });

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

/* ------------------------------------------------------------------ */
/*  Waypoint path building (T5, S2, S3, S7)                            */
/* ------------------------------------------------------------------ */

import { buildEdgePathThroughWaypoints } from "./default-edge-renderer.js";

describe("buildEdgePathThroughWaypoints", () => {
  it("returns a simple bezier when waypoints is empty", () => {
    const [path] = buildEdgePathThroughWaypoints(
      0, 0, 100, 100,
      Position.Bottom,
      Position.Top,
      [],
    );
    // Should contain the M and C commands (cubic bezier).
    expect(path).toContain("M");
    expect(path).toContain("C");
    // Should not contain extra segments.
    const cCount = (path.match(/C/g) || []).length;
    expect(cCount).toBe(1); // One cubic segment: source → target
  });

  it("includes a segment for each waypoint", () => {
    const waypoints = [
      { x: 40, y: 60 },
      { x: 80, y: 30 },
    ];
    const [path] = buildEdgePathThroughWaypoints(
      0, 0, 100, 100,
      Position.Bottom,
      Position.Top,
      waypoints,
    );

    // Path starts at source.
    expect(path).toMatch(/^M 0 0/);
    // Each segment is a cubic bezier (C command).
    // source→w1, w1→w2, w2→target = 3 segments.
    const cCount = (path.match(/C/g) || []).length;
    expect(cCount).toBe(3);
    // Path contains waypoint coordinates.
    expect(path).toContain("40");
    expect(path).toContain("60");
    expect(path).toContain("80");
    expect(path).toContain("30");
    // Path ends at target.
    // Path ends near the target coordinates (100, 100).
  });

  it("single waypoint produces one extra segment", () => {
    const waypoints = [{ x: 50, y: 50 }];
    const [path] = buildEdgePathThroughWaypoints(
      0, 0, 100, 100,
      Position.Bottom,
      Position.Top,
      waypoints,
    );

    const cCount = (path.match(/C/g) || []).length;
    expect(cCount).toBe(2); // source→wp, wp→target
  });

  it("label coordinates come from the last waypoint", () => {
    const waypoints = [{ x: 60, y: 70 }];
    const [, labelX, labelY] = buildEdgePathThroughWaypoints(
      0, 0, 100, 100,
      Position.Bottom,
      Position.Top,
      waypoints,
    );

    expect(labelX).toBe(60);
    expect(labelY).toBe(70);
  });

  it("label coordinates fall back to bezier middle when no waypoints", () => {
    const [, labelX, labelY] = buildEdgePathThroughWaypoints(
      0, 0, 100, 100,
      Position.Bottom,
      Position.Top,
      [],
    );

    // Should be approximately the middle.
    expect(labelX).toBeGreaterThan(0);
    expect(labelY).toBeGreaterThan(0);
  });
});

describe("DefaultEdgeRenderer with waypoints (T5, S2, S3, S7)", () => {
  it("renders a path through waypoints when data.waypoints is present", () => {
    const { container } = render(
      <DefaultEdgeRenderer
        id="e1"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        data={{
          waypoints: [
            { x: 40, y: 60 },
            { x: 80, y: 30 },
          ],
        }}
        source="n1"
        target="n2"
      />,
    );

    const path = container.querySelector("path");
    expect(path).not.toBeNull();

    const d = path!.getAttribute("d");
    // Path contains waypoints coordinates.
    expect(d).toContain("40");
    expect(d).toContain("60");
    expect(d).toContain("80");
    expect(d).toContain("30");
    // Should have 3 cubic segments (source→w1, w1→w2, w2→target).
    const cCount = (d?.match(/C/g) || []).length;
    expect(cCount).toBe(3);
  });

  it("renders a simple bezier when data.waypoints is absent", () => {
    const { container } = render(
      <DefaultEdgeRenderer
        id="e1"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        data={{}}
        source="n1"
        target="n2"
      />,
    );

    const path = container.querySelector("path");
    expect(path).not.toBeNull();

    const d = path!.getAttribute("d");
    // Should be a simple bezier with one C command.
    const cCount = (d?.match(/C/g) || []).length;
    expect(cCount).toBe(1);
  });

  it("renders waypoint handles when selected", () => {
    const { container } = render(
      <DefaultEdgeRenderer
        id="e1"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        data={{
          waypoints: [{ x: 50, y: 50 }],
        }}
        source="n1"
        target="n2"
        selected
      />,
    );

    // Waypoint handles are in the EdgeLabelRenderer layer.
    const handles = container.querySelectorAll("[data-nodera-waypoint-index]");
    expect(handles.length).toBe(1);
  });

  it("does not render waypoint handles when not selected", () => {
    const { container } = render(
      <DefaultEdgeRenderer
        id="e1"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        data={{
          waypoints: [{ x: 50, y: 50 }],
        }}
        source="n1"
        target="n2"
      />,
    );

    const handles = container.querySelectorAll("[data-nodera-waypoint-index]");
    expect(handles.length).toBe(0);
  });

  it("does not render waypoint handles when no waypoints", () => {
    const { container } = render(
      <DefaultEdgeRenderer
        id="e1"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        data={{}}
        source="n1"
        target="n2"
        selected
      />,
    );

    const handles = container.querySelectorAll("[data-nodera-waypoint-index]");
    expect(handles.length).toBe(0);
  });

  it("renders handles at waypoint coordinates", () => {
    const { container } = render(
      <DefaultEdgeRenderer
        id="e1"
        sourceX={0}
        sourceY={0}
        targetX={100}
        targetY={100}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        data={{
          waypoints: [{ x: 42, y: 58 }],
        }}
        source="n1"
        target="n2"
        selected
      />,
    );

    const handle = container.querySelector("[data-nodera-waypoint-index]") as HTMLElement;
    expect(handle.style.left).toBe("42px");
    expect(handle.style.top).toBe("58px");
  });
});
