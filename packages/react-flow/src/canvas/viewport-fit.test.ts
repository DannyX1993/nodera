import { describe, expect, it } from "vitest";

import type { ViewportConfiguration } from "@nodera/sdk";

import { selectionViewportPlan, startViewportPlan, viewportFitOptions } from "./viewport-fit.js";

/** The documented defaults: React Flow padding, animation length and ceiling. */
const DEFAULTS = { padding: 0.1, duration: 200, maxZoom: 1.5 } as const;

/** The whole-graph plan a configuration without a `start` group produces. */
const WHOLE_GRAPH = DEFAULTS;

describe("startViewportPlan", () => {
  // Rule (a): no configuration is today's behaviour.
  it("returns no plan at all without a configuration", () => {
    expect(startViewportPlan(undefined)).toBeUndefined();
  });

  // Rule (b): a declared `start` group with nothing in it frames the graph with
  // the documented defaults.
  it("frames the whole graph with the defaults for an empty start group", () => {
    const plan = startViewportPlan({ start: {} });

    expect(plan).toEqual(WHOLE_GRAPH);
    expect(plan?.zoom).toBeUndefined();
    expect(plan?.nodes).toBeUndefined();
  });

  // Rule (c): one node id frames exactly that node.
  it("frames the node the configuration names", () => {
    expect(startViewportPlan({ start: { node: "n1" } })).toEqual({
      nodes: ["n1"],
      ...DEFAULTS,
    });
  });

  // Rule (d): an absolute zoom pins the level and keeps the whole graph.
  it("pins an absolute zoom over the whole graph", () => {
    const plan = startViewportPlan({ start: { zoom: 1.25 } });

    expect(plan).toEqual({ zoom: 1.25, padding: 0.1, duration: 200 });
    expect(plan?.nodes).toBeUndefined();
    expect(plan?.maxZoom).toBeUndefined();
  });

  it("keeps every declared value over its default", () => {
    const plan = startViewportPlan({
      start: { node: "n1", maxZoom: 2, padding: 0.3, duration: 0 },
    });

    expect(plan).toEqual({ nodes: ["n1"], maxZoom: 2, padding: 0.3, duration: 0 });
  });
});

describe("selectionViewportPlan", () => {
  // Rule (e): a canvas that declares no `selection` group never moves.
  it("leaves the camera alone without a selection group", () => {
    const config: ViewportConfiguration = { start: { node: "n1" } };

    expect(selectionViewportPlan(config, { nodes: ["n1"], edges: [] })).toBeUndefined();
    expect(selectionViewportPlan(config, { nodes: [], edges: ["e1"] })).toBeUndefined();
    expect(selectionViewportPlan(config, { nodes: [], edges: [] })).toBeUndefined();
  });

  it("leaves the camera alone without a configuration", () => {
    expect(selectionViewportPlan(undefined, { nodes: ["n1"], edges: [] })).toBeUndefined();
  });

  // Rule (f): one selected node is framed with the documented defaults.
  it("frames a selected node with the defaults", () => {
    expect(selectionViewportPlan({ selection: {} }, { nodes: ["n1"], edges: [] })).toEqual({
      nodes: ["n1"],
      ...DEFAULTS,
    });
  });

  // Rule (g): the selection group has its own absolute zoom.
  it("pins the selection zoom", () => {
    const plan = selectionViewportPlan({ selection: { zoom: 2 } }, { nodes: ["n1"], edges: [] });

    expect(plan).toEqual({ nodes: ["n1"], zoom: 2, padding: 0.1, duration: 200 });
  });

  // Rule (h): edges are off by default, and an edge-only selection leaves the
  // camera alone; with `edges: true` the edge is framed.
  it("leaves an edge-only selection alone while edges are off", () => {
    expect(selectionViewportPlan({ selection: {} }, { nodes: [], edges: ["e1"] })).toBeUndefined();
  });

  it("frames a selected edge when the host turns edges on", () => {
    const plan = selectionViewportPlan(
      { selection: { edges: true } },
      { nodes: [], edges: ["e1"] },
    );

    expect(plan).toEqual({ nodes: ["e1"], ...DEFAULTS });
  });

  it("frames a selected edge with the graph-fit rule, never an absolute zoom", () => {
    const plan = selectionViewportPlan(
      { selection: { edges: true, zoom: 2 } },
      { nodes: [], edges: ["e1"] },
    );

    expect(plan).toEqual({ nodes: ["e1"], ...DEFAULTS });
    expect(plan?.zoom).toBeUndefined();
  });

  // Rule (i): clearing the selection returns to the start framing.
  it("restores the start framing when the selection is cleared", () => {
    expect(
      selectionViewportPlan(
        { start: { node: "n1", padding: 0.2 }, selection: {} },
        { nodes: [], edges: [] },
      ),
    ).toEqual({ nodes: ["n1"], maxZoom: 1.5, padding: 0.2, duration: 200 });
  });

  it("restores the start zoom when the selection is cleared", () => {
    expect(
      selectionViewportPlan({ start: { zoom: 1.25 }, selection: {} }, { nodes: [], edges: [] }),
    ).toEqual({ zoom: 1.25, padding: 0.1, duration: 200 });
  });

  it("restores the whole graph when the selection is cleared and no start is declared", () => {
    expect(selectionViewportPlan({ selection: {} }, { nodes: [], edges: [] })).toEqual(WHOLE_GRAPH);
  });

  // Rule (j): several selected nodes are framed together, in the order received.
  it("frames every selected node in the order received", () => {
    const plan = selectionViewportPlan(
      { selection: {} },
      { nodes: ["n3", "n1", "n2"], edges: [] },
    );

    expect(plan).toEqual({ nodes: ["n3", "n1", "n2"], ...DEFAULTS });
  });

  // Rule (k): a mixed selection frames only the nodes while edges are off.
  it("drops the selected edges while edges are off", () => {
    const plan = selectionViewportPlan(
      { selection: {} },
      { nodes: ["n1", "n2"], edges: ["e1"] },
    );

    expect(plan).toEqual({ nodes: ["n1", "n2"], ...DEFAULTS });
  });

  it("frames nodes and edges together when the host turns edges on", () => {
    const plan = selectionViewportPlan(
      { selection: { edges: true } },
      { nodes: ["n1"], edges: ["e1"] },
    );

    expect(plan).toEqual({ nodes: ["n1", "e1"], ...DEFAULTS });
  });

  it("honours the selection duration, padding and ceiling", () => {
    const plan = selectionViewportPlan(
      { selection: { maxZoom: 2, padding: 0.05, duration: 0 } },
      { nodes: ["n1"], edges: [] },
    );

    expect(plan).toEqual({ nodes: ["n1"], maxZoom: 2, padding: 0.05, duration: 0 });
  });
});

describe("viewportFitOptions", () => {
  it("frames no particular node for a whole-graph plan", () => {
    const options = viewportFitOptions(WHOLE_GRAPH);

    expect(options).toEqual({ maxZoom: 1.5, padding: 0.1, duration: 200 });
  });

  it("passes the framed node ids to React Flow", () => {
    const options = viewportFitOptions({ nodes: ["n1", "e1"], padding: 0.2, duration: 100 });

    expect(options.nodes).toEqual([{ id: "n1" }, { id: "e1" }]);
    expect(options.padding).toBe(0.2);
    expect(options.duration).toBe(100);
  });

  // Decision 1: the absolute level is enforced through React Flow's own clamp.
  it("pins an absolute zoom through React Flow's clamp", () => {
    const options = viewportFitOptions({ nodes: ["n1"], zoom: 1.25, padding: 0.1, duration: 0 });

    expect(options).toEqual({
      nodes: [{ id: "n1" }],
      minZoom: 1.25,
      maxZoom: 1.25,
      padding: 0.1,
      duration: 0,
    });
  });

  it("uses the ceiling instead of the clamp when no absolute zoom is pinned", () => {
    const options = viewportFitOptions({ maxZoom: 2, padding: 0.1, duration: 200 });

    expect(options).toEqual({ maxZoom: 2, padding: 0.1, duration: 200 });
  });
});
