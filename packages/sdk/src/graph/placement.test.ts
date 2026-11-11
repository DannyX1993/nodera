/**
 * The anchored placement rule, as a pure function.
 *
 * These tests pin the geometry the add-node boundary decides with, without a
 * builder: `nextFreeSlot` and `placeUnpositionedNode` read the occupied
 * positions, the resolved layout and the anchor's position, and answer one
 * slot. The behaviour through `builder.graph.addNode` is pinned in
 * `graph-layout.test.ts`; here the rule is isolated so its edges (the extent,
 * the ties, the forward-only step) can be stated directly.
 *
 * The step is measured in **boxes**, exactly like the ranked layout: the gap the
 * host declares is the space *between* two neighbouring boxes, so consecutive
 * slots are `box extent along the axis + spacing` apart.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT_NODE_SIZE } from "@nodera/graph-layout";
import type { NodePosition } from "@nodera/graph-model";
import type { ResolvedGraphLayout } from "./placement.js";
import { nextFreeSlot, placeUnpositionedNode, resolveGraphLayout } from "./placement.js";

/**
 * The strategy's default box, written as a literal on purpose: it and the step
 * it produces are the shared default, so a changed default must fail here
 * instead of being recomputed from the implementation.
 */
const DEFAULT_BOX = { width: 140, height: 40 };

const HORIZONTAL: ResolvedGraphLayout = {
  mode: "auto",
  direction: "horizontal",
  spacing: 240,
  nodeSize: DEFAULT_BOX,
};
const VERTICAL: ResolvedGraphLayout = { ...HORIZONTAL, direction: "vertical" };

function at(x: number, y: number): NodePosition {
  return { x, y };
}

describe("graph placement: the add-node rule", () => {
  it("places nothing in free mode, whatever anchor the host passes", () => {
    const free: ResolvedGraphLayout = { ...HORIZONTAL, mode: "free" };
    expect(placeUnpositionedNode([], free)).toBeUndefined();
    expect(placeUnpositionedNode([at(0, 0)], free, at(0, 0))).toBeUndefined();
  });

  it("starts an empty graph at the origin", () => {
    expect(placeUnpositionedNode([], HORIZONTAL)).toEqual(at(0, 0));
    expect(placeUnpositionedNode([], VERTICAL)).toEqual(at(0, 0));
  });

  it("steps forward of the anchor by the box plus the spacing", () => {
    // 140-wide box + 240 gap = 380 horizontally, 40-tall box + 240 = 280
    // vertically: the host's `spacing` is the gap between two boxes.
    expect(nextFreeSlot([at(0, 0)], HORIZONTAL, at(0, 0))).toEqual(at(380, 0));
    expect(nextFreeSlot([at(0, 240)], VERTICAL, at(0, 240))).toEqual(at(0, 520));
  });

  it("steps by the box extent of the axis it advances, per direction", () => {
    // One declared box, two directions: the step reads the width along `x` and
    // the height along `y`, never the same extent twice.
    const boxed: ResolvedGraphLayout = {
      mode: "auto",
      direction: "horizontal",
      spacing: 100,
      nodeSize: { width: 60, height: 20 },
    };
    expect(placeUnpositionedNode([], boxed)).toEqual(at(0, 0));
    expect(nextFreeSlot([at(0, 0)], boxed)).toEqual(at(160, 0));
    expect(nextFreeSlot([at(0, 0), at(160, 0)], boxed)).toEqual(at(320, 0));

    const vertical: ResolvedGraphLayout = { ...boxed, direction: "vertical" };
    expect(placeUnpositionedNode([], vertical)).toEqual(at(0, 0));
    expect(nextFreeSlot([at(0, 0)], vertical)).toEqual(at(0, 120));
    expect(nextFreeSlot([at(0, 0), at(0, 120)], vertical)).toEqual(at(0, 240));
  });

  it("leaves room for the box even when the spacing is smaller than it", () => {
    // 200-wide box + 10 gap = 210: a host that declares a spacing below its node
    // size no longer gets overlapping slots.
    const tight: ResolvedGraphLayout = {
      mode: "auto",
      direction: "horizontal",
      spacing: 10,
      nodeSize: { width: 200, height: 40 },
    };
    expect(nextFreeSlot([at(0, 0)], tight)).toEqual(at(210, 0));
    expect(nextFreeSlot([at(0, 0), at(210, 0)], tight)).toEqual(at(420, 0));
  });

  it("resolves the strategy's default box when the host declares none", () => {
    const resolved = resolveGraphLayout({ mode: "auto", spacing: 100 });
    expect(resolved.nodeSize).toEqual({ width: 140, height: 40 });
    // The very object the strategy resolves, not an equal copy of it: one
    // source for "declared box or default" across both grids.
    expect(resolved.nodeSize).toBe(DEFAULT_LAYOUT_NODE_SIZE);
    // 140-wide default box + the declared 100 = 240.
    expect(nextFreeSlot([at(0, 0)], resolved)).toEqual(at(240, 0));
    expect(nextFreeSlot([at(0, 0)], { ...resolved, direction: "vertical" })).toEqual(at(0, 140));

    expect(resolveGraphLayout(undefined).nodeSize).toEqual({ width: 140, height: 40 });
    expect(resolveGraphLayout(undefined).nodeSize).toBe(DEFAULT_LAYOUT_NODE_SIZE);
  });

  it("keeps the box the host declared", () => {
    expect(
      resolveGraphLayout({ mode: "auto", nodeSize: { width: 60, height: 20 } }).nodeSize,
    ).toEqual({ width: 60, height: 20 });
  });

  it("skips an occupied slot forward", () => {
    expect(nextFreeSlot([at(0, 0), at(380, 0)], HORIZONTAL, at(0, 0))).toEqual(at(760, 0));
  });

  it("never steps backward, even with an empty slot behind the anchor", () => {
    expect(nextFreeSlot([at(240, 0), at(480, 0)], HORIZONTAL, at(480, 0))).toEqual(at(860, 0));
  });

  it("keeps the anchor's row and steps by the configured spacing", () => {
    const wide: ResolvedGraphLayout = { ...HORIZONTAL, spacing: 100 };
    expect(nextFreeSlot([at(50, 300)], wide, at(50, 300))).toEqual(at(290, 300));
  });

  it("lands after the graph's extent when no anchor carries a position", () => {
    expect(nextFreeSlot([at(0, 0), at(240, 0)], HORIZONTAL)).toEqual(at(620, 0));
    expect(nextFreeSlot([at(0, 0), at(0, 240)], VERTICAL)).toEqual(at(0, 520));
  });

  it("keeps the farthest slot's own row", () => {
    expect(nextFreeSlot([at(0, 240), at(240, 480)], HORIZONTAL)).toEqual(at(620, 480));
  });

  it("breaks a tie on the axis with the first row, whatever the storage order", () => {
    expect(nextFreeSlot([at(240, 480), at(240, 0)], HORIZONTAL)).toEqual(at(620, 0));
    expect(nextFreeSlot([at(240, 0), at(240, 480)], HORIZONTAL)).toEqual(at(620, 0));
  });

  it("skips a taken slot of the farthest row and keeps that row", () => {
    expect(nextFreeSlot([at(480, 0), at(0, 0), at(720, 0)], HORIZONTAL)).toEqual(at(1100, 0));
  });
});
