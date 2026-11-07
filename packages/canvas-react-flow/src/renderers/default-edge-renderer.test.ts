import { describe, expect, it } from "vitest";

import { defaultEdgeOptionsFromVisual } from "./default-edge-renderer.js";
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
});