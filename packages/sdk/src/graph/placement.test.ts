/**
 * The anchored placement rule, as a pure function.
 *
 * These tests pin the geometry the add-node boundary decides with, without a
 * builder: `nextFreeSlot` and `placeUnpositionedNode` read the occupied
 * positions, the resolved layout and the anchor's position, and answer one
 * slot. The behaviour through `builder.graph.addNode` is pinned in
 * `graph-layout.test.ts`; here the rule is isolated so its edges (the extent,
 * the ties, the forward-only step) can be stated directly.
 */

import { describe, expect, it } from "vitest";
import type { NodePosition } from "@nodera/graph-model";
import type { ResolvedGraphLayout } from "./placement.js";
import { nextFreeSlot, placeUnpositionedNode } from "./placement.js";

const HORIZONTAL: ResolvedGraphLayout = { mode: "auto", direction: "horizontal", spacing: 240 };
const VERTICAL: ResolvedGraphLayout = { mode: "auto", direction: "vertical", spacing: 240 };

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

  it("steps forward of the anchor by the spacing", () => {
    expect(nextFreeSlot([at(0, 0)], HORIZONTAL, at(0, 0))).toEqual(at(240, 0));
    expect(nextFreeSlot([at(0, 240)], VERTICAL, at(0, 240))).toEqual(at(0, 480));
  });

  it("skips an occupied slot forward", () => {
    expect(nextFreeSlot([at(0, 0), at(240, 0)], HORIZONTAL, at(0, 0))).toEqual(at(480, 0));
  });

  it("never steps backward, even with an empty slot behind the anchor", () => {
    expect(nextFreeSlot([at(240, 0), at(480, 0)], HORIZONTAL, at(480, 0))).toEqual(at(720, 0));
  });

  it("keeps the anchor's row and steps by the configured spacing", () => {
    const wide: ResolvedGraphLayout = { ...HORIZONTAL, spacing: 100 };
    expect(nextFreeSlot([at(50, 300)], wide, at(50, 300))).toEqual(at(150, 300));
  });

  it("lands after the graph's extent when no anchor carries a position", () => {
    expect(nextFreeSlot([at(0, 0), at(480, 0)], HORIZONTAL)).toEqual(at(720, 0));
    expect(nextFreeSlot([at(0, 0), at(0, 480)], VERTICAL)).toEqual(at(0, 720));
  });

  it("keeps the farthest slot's own row", () => {
    expect(nextFreeSlot([at(0, 240), at(240, 480)], HORIZONTAL)).toEqual(at(480, 480));
  });

  it("breaks a tie on the axis with the first row, whatever the storage order", () => {
    expect(nextFreeSlot([at(240, 480), at(240, 0)], HORIZONTAL)).toEqual(at(480, 0));
    expect(nextFreeSlot([at(240, 0), at(240, 480)], HORIZONTAL)).toEqual(at(480, 0));
  });

  it("skips a taken slot of the farthest row and keeps that row", () => {
    expect(nextFreeSlot([at(480, 0), at(0, 0), at(720, 0)], HORIZONTAL)).toEqual(at(960, 0));
  });
});
