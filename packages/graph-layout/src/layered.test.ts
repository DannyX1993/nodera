import { describe, expect, it } from "vitest";
import { createNodeId } from "@nodera/contracts";
import type { NodePosition } from "@nodera/graph-model";

import {
  createLayeredStrategy,
  type GraphLayoutDiagnostic,
  type GraphLayoutEdgeInput,
  type GraphLayoutNodeInput,
  type GraphLayoutOptions,
  type GraphLayoutResult,
} from "./index.js";

const layered = createLayeredStrategy();

function node(id: string, position?: NodePosition): GraphLayoutNodeInput {
  return { id: createNodeId(id), position };
}

/** A node with the box the host knows for it, in flow units. */
function sized(id: string, width: number, height: number): GraphLayoutNodeInput {
  return { id: createNodeId(id), width, height };
}

function edge(source: string, target: string): GraphLayoutEdgeInput {
  return { source: createNodeId(source), target: createNodeId(target) };
}

function options(overrides: Partial<GraphLayoutOptions> = {}): GraphLayoutOptions {
  return { direction: "horizontal", nodeSpacing: 40, rankSpacing: 100, scope: "all", ...overrides };
}

/** The placement as readable rows; fails the test when the call did not place. */
function placed(result: ReturnType<typeof layered.place>) {
  if (!result.ok) {
    throw new Error(`expected a placement, got the diagnostic ${result.error.code}`);
  }
  return result.value.positions.map((entry) => ({
    nodeId: entry.nodeId,
    x: entry.position.x,
    y: entry.position.y,
  }));
}

/** One placed node by id; fails the test when the answer does not carry it. */
function positionOf(
  entries: ReturnType<typeof placed>,
  nodeId: string,
): ReturnType<typeof placed>[number] {
  const found = entries.find((entry) => entry.nodeId === nodeId);
  if (found === undefined) {
    throw new Error(`expected a position for the node ${nodeId}`);
  }
  return found;
}

/** The diagnostic of a failed call, pinning that a failure carries no geometry. */
function failed(result: ReturnType<typeof layered.place>): GraphLayoutDiagnostic {
  if (result.ok) {
    throw new Error("expected a diagnostic, got a placement");
  }
  expect(Object.hasOwn(result, "value")).toBe(false);
  return result.error;
}

/** One placed node as the box its size describes. */
function box(
  entry: { readonly x: number; readonly y: number },
  width: number,
  height: number,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: entry.x, y: entry.y, width, height };
}

/** Whether two boxes share any area at all. */
function overlaps(
  left: ReturnType<typeof box>,
  right: ReturnType<typeof box>,
): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

/**
 * The pairs of placed boxes that share a rank and overlap, as `left/right` ids.
 *
 * The flow coordinate is the rank line, so two entries with the same one are
 * neighbours of one rank — the only pair a placement may ever push together.
 */
function rankCollisions(
  entries: ReturnType<typeof placed>,
  size: { readonly width: number; readonly height: number },
  flowAxis: "x" | "y",
): readonly string[] {
  const collisions: string[] = [];
  for (const [index, entry] of entries.entries()) {
    for (const other of entries.slice(index + 1)) {
      if (entry[flowAxis] !== other[flowAxis]) {
        continue;
      }
      if (overlaps(box(entry, size.width, size.height), box(other, size.width, size.height))) {
        collisions.push(`${entry.nodeId}/${other.nodeId}`);
      }
    }
  }
  return collisions;
}

describe("createLayeredStrategy", () => {
  it("ranks a linear chain from the source and separates consecutive ranks by rankSpacing", () => {
    const result = layered.place({
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b"), edge("b", "c")],
      options: options({ nodeSpacing: 40, rankSpacing: 250 }),
    });

    expect(placed(result)).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "b", x: 250, y: 0 },
      { nodeId: "c", x: 500, y: 0 },
    ]);
  });

  it("swaps the axes when the direction is vertical", () => {
    const result = layered.place({
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("a", "b"), edge("a", "c")],
      options: options({ direction: "vertical" }),
    });

    // `a` is alone in its rank and its two children are not: on the cross axis
    // (now `x`) a node with several children sits over their mean, so `a` sits at
    // 90 — the mean of its children's columns — instead of over `b`'s column.
    // Each step is the default 140-wide box plus the 40 gap, so the columns are
    // 180 apart and the half-step is 90.
    expect(placed(result)).toEqual([
      { nodeId: "a", x: 90, y: 0 },
      { nodeId: "b", x: 0, y: 100 },
      { nodeId: "c", x: 180, y: 100 },
    ]);
  });

  it("keeps a tie in the barycenter in node-id order, never in input order", () => {
    // Retargeted: in-rank order by node id is now the *tie-breaker* of the
    // barycenter rule (S10's "order by id" clause is superseded), and the
    // expectation is unchanged because both children share the same mean.
    const result = layered.place({
      nodes: [node("c"), node("b"), node("a")],
      edges: [edge("a", "c"), edge("a", "b")],
      options: options(),
    });

    // Retargeted again by the alignment rule: `a` forks into the two children, so
    // its cross coordinate is the mean of theirs. Box-based since the width-aware
    // pitch: the default 40-tall box plus the 40 gap is a pitch of 80, so the
    // children are at 0 and 80 and `a` at 40.
    expect(placed(result)).toEqual([
      { nodeId: "a", x: 0, y: 40 },
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 100, y: 80 },
    ]);
  });

  it("orders a rank by the mean position of its parents, removing the sibling crossing", () => {
    // `a` forks into `b` and `c`; `b` feeds `e` and `c` feeds `d`. In id order the
    // last rank is `[d, e]`, so `c -> d` and `b -> e` cross. The barycenter of
    // `d` is 1 (its parent `c` sits second) and the one of `e` is 0, so the
    // crossing disappears.
    const result = placed(
      layered.place({
        nodes: [node("a"), node("b"), node("c"), node("d"), node("e")],
        edges: [edge("a", "b"), edge("a", "c"), edge("b", "e"), edge("c", "d")],
        options: options(),
      }),
    );

    // Retargeted by the alignment rule: `a` forks, so it sits over the mean of
    // its children's columns (`y: 40`, the mean of 0 and 80).
    expect(result).toEqual([
      { nodeId: "a", x: 0, y: 40 },
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 100, y: 80 },
      // Crossed as [d, e]; the barycenter keeps each child under its own parent.
      { nodeId: "e", x: 200, y: 0 },
      { nodeId: "d", x: 200, y: 80 },
    ]);
  });

  it("leaves the ranks themselves untouched and only permutes inside them", () => {
    const result = placed(
      layered.place({
        nodes: [node("a"), node("b"), node("c"), node("d"), node("e")],
        edges: [edge("a", "b"), edge("a", "c"), edge("b", "e"), edge("c", "d")],
        options: options({ rankSpacing: 250, nodeSpacing: 40 }),
      }),
    );

    // The ordering chooses an in-rank index; it never moves a node's rank.
    // (The rank axis is untouched by the alignment rule: it only moves the
    // cross coordinate, below.)
    expect(new Map(result.map((entry) => [entry.nodeId, entry.x]))).toEqual(
      new Map([
        ["a", 0],
        ["b", 250],
        ["c", 250],
        ["d", 500],
        ["e", 500],
      ]),
    );
    // Alignment: `a` forks, so it sits over the mean of `b` and `c` — half of a
    // pitch of 80 (the default 40-tall box plus the 40 gap), so 40 — and every
    // other node keeps its base slot.
    expect(new Map(result.map((entry) => [entry.nodeId, entry.y]))).toEqual(
      new Map([
        ["a", 40],
        ["b", 0],
        ["c", 80],
        ["e", 0],
        ["d", 80],
      ]),
    );
  });

  it("orders by the barycenter independently of the input order", () => {
    const nodes = [node("a"), node("b"), node("c"), node("d"), node("e")];
    const edges = [edge("a", "b"), edge("a", "c"), edge("b", "e"), edge("c", "d")];

    const forward = placed(layered.place({ nodes, edges, options: options() }));
    const reversed = placed(
      layered.place({
        nodes: [...nodes].reverse(),
        edges: [...edges].reverse(),
        options: options(),
      }),
    );
    const shuffled = placed(
      layered.place({
        nodes: [node("c"), node("e"), node("a"), node("d"), node("b")],
        edges: [edge("c", "d"), edge("b", "e"), edge("a", "c"), edge("a", "b")],
        options: options(),
      }),
    );

    expect(reversed).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });

  it("places cycle-locked nodes after every resolved rank", () => {
    const cycleOnly = layered.place({
      nodes: [node("d"), node("a"), node("c"), node("b")],
      edges: [edge("d", "c"), edge("a", "b"), edge("c", "d")],
      options: options(),
    });

    // Rewritten by the alignment rule. Old expectation: `a` and `b` at `y: 40`,
    // because the one-node ranks were centred over the two-node rank of the
    // cycle-locked bucket ([c, d]). New expectation: `b` takes its parent's
    // column `0` — no rank gets the half pitch of 80 any more — and the bucket,
    // which has no placed parent and no child in a later rank, keeps the base
    // coordinates 0 and 80. Rank order, ids and the rank axis are unchanged.
    expect(placed(cycleOnly)).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 200, y: 0 },
      { nodeId: "d", x: 200, y: 80 },
    ]);

    const reachableCycle = placed(
      layered.place({
        nodes: [node("c"), node("a"), node("b")],
        edges: [edge("c", "b"), edge("a", "b"), edge("b", "c")],
        options: options(),
      }),
    );

    expect(reachableCycle.map((entry) => entry.nodeId)).toEqual(["a", "c", "b"]);
    expect(reachableCycle[0]).toEqual({ nodeId: "a", x: 0, y: 0 });
    for (const entry of reachableCycle.slice(1)) {
      expect(entry.x).toBeGreaterThan(0);
    }
  });

  it("places a node with no edge after every resolved rank, in the id-ordered bucket", () => {
    // A source (`s`, outgoing only) keeps rank 0; `alpha` and `zeta` have no
    // incoming and no outgoing edge, so they join the bucket the cycle-locked
    // nodes already use — after the last resolved rank, ordered by node id and
    // never first.
    const nodes = [node("zeta"), node("alpha"), node("c"), node("a"), node("s"), node("b")];
    const edges = [edge("a", "b"), edge("b", "c"), edge("s", "c")];

    // Retargeted by the alignment rule: `b` takes its only parent's column `0`,
    // `c` takes the mean of its two parents (0 and 80, so 40), and the isolated
    // bucket keeps its base slots 0 and 80. One pitch is the default 40-tall box
    // plus the 40 gap.
    expect(
      placed(layered.place({ nodes, edges, options: options({ nodeSpacing: 40, rankSpacing: 100 }) })),
    ).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "s", x: 0, y: 80 },
      { nodeId: "b", x: 100, y: 40 },
      { nodeId: "c", x: 200, y: 40 },
      { nodeId: "alpha", x: 300, y: 0 },
      { nodeId: "zeta", x: 300, y: 80 },
    ]);

    expect(
      placed(layered.place({ nodes, edges, options: options({ direction: "vertical" }) })),
    ).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "s", x: 180, y: 0 },
      { nodeId: "b", x: 90, y: 100 },
      { nodeId: "c", x: 90, y: 200 },
      { nodeId: "alpha", x: 0, y: 300 },
      { nodeId: "zeta", x: 180, y: 300 },
    ]);
  });

  it("keeps every node of an edgeless graph in one rank ordered by node id", () => {
    expect(
      placed(
        layered.place({
          nodes: [node("c"), node("a"), node("b")],
          edges: [],
          options: options(),
        }),
      ),
    ).toEqual([
      // One rank, so the pitch is the default 40-tall box plus the 40 gap.
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "b", x: 0, y: 80 },
      { nodeId: "c", x: 0, y: 160 },
    ]);
  });

  it("sits a branching node over the mean of its children when the direction is vertical", () => {
    // The first half of the rule: a node several branches depart from sits over
    // the centre of those branches. `a` forks into `b` and `c`, so `a` lands at
    // the mean of their columns instead of over `b`'s. The rank axis is
    // untouched. The cross axis reads the box width here, so one pitch is the
    // default 140 plus the 40 gap.
    const result = placed(
      layered.place({
        nodes: [node("a"), node("b"), node("c")],
        edges: [edge("a", "b"), edge("a", "c")],
        options: options({ direction: "vertical", nodeSpacing: 40, rankSpacing: 100 }),
      }),
    );

    const parent = positionOf(result, "a");
    const left = positionOf(result, "b");
    const right = positionOf(result, "c");

    expect(left).toEqual({ nodeId: "b", x: 0, y: 100 });
    expect(right).toEqual({ nodeId: "c", x: 180, y: 100 });
    expect(parent.x).toBe((left.x + right.x) / 2);
    expect(parent).toEqual({ nodeId: "a", x: 90, y: 0 });
  });

  it("sits a branching node over the mean of its children when the direction is horizontal", () => {
    // The same rule on the other axis: `y` carries the alignment, the pitch reads
    // the default 40-tall box plus the 40 gap, and the rank axis (`x`) is exactly
    // `rank * rankSpacing`, unchanged.
    const result = placed(
      layered.place({
        nodes: [node("a"), node("b"), node("c")],
        edges: [edge("a", "b"), edge("a", "c")],
        options: options({ direction: "horizontal", nodeSpacing: 40, rankSpacing: 100 }),
      }),
    );

    const parent = positionOf(result, "a");
    const left = positionOf(result, "b");
    const right = positionOf(result, "c");

    expect(left).toEqual({ nodeId: "b", x: 100, y: 0 });
    expect(right).toEqual({ nodeId: "c", x: 100, y: 80 });
    expect(parent.x).toBe(0);
    expect(left.x).toBe(right.x);
    expect(left.x).toBe(100);
    expect(parent.y).toBe((left.y + right.y) / 2);
    expect(parent).toEqual({ nodeId: "a", x: 0, y: 40 });
  });

  it("keeps every node of a one-node-per-rank chain on cross coordinate 0", () => {
    // Preserved geometry: with exactly one node per rank every resident is both
    // its parent's only child and its child's only parent, so every pass agrees
    // on one column and a linear chain is still a straight line on both
    // directions.
    const vertical = placed(
      layered.place({
        nodes: [node("a"), node("b"), node("c")],
        edges: [edge("a", "b"), edge("b", "c")],
        options: options({ direction: "vertical", nodeSpacing: 40, rankSpacing: 100 }),
      }),
    );

    expect(vertical).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "b", x: 0, y: 100 },
      { nodeId: "c", x: 0, y: 200 },
    ]);

    const horizontal = placed(
      layered.place({
        nodes: [node("a"), node("b"), node("c")],
        edges: [edge("a", "b"), edge("b", "c")],
        options: options({ direction: "horizontal", nodeSpacing: 40, rankSpacing: 100 }),
      }),
    );

    expect(horizontal).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 200, y: 0 },
    ]);

    // The same chain with measured boxes: there is nothing to align a one-node
    // rank against, so the cross coordinate stays `0` whatever the boxes are.
    const boxed = placed(
      layered.place({
        nodes: [sized("a", 158, 34), sized("b", 158, 34), sized("c", 158, 34)],
        edges: [edge("a", "b"), edge("b", "c")],
        options: options({
          direction: "horizontal",
          nodeSpacing: 240,
          rankSpacing: 280,
          nodeSize: { width: 158, height: 34 },
        }),
      }),
    );

    expect(boxed).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "b", x: 280, y: 0 },
      { nodeId: "c", x: 560, y: 0 },
    ]);
  });

  it("sits a shared child under the mean of its parents", () => {
    // `a -> c` and `b -> c`: the parents share the wide rank and the child is
    // alone in its own, so the child takes the mean of the two columns.
    const result = placed(
      layered.place({
        nodes: [node("a"), node("b"), node("c")],
        edges: [edge("a", "c"), edge("b", "c")],
        options: options({ direction: "horizontal", nodeSpacing: 40, rankSpacing: 100 }),
      }),
    );

    const first = positionOf(result, "a");
    const second = positionOf(result, "b");
    const child = positionOf(result, "c");

    expect(first).toEqual({ nodeId: "a", x: 0, y: 0 });
    expect(second).toEqual({ nodeId: "b", x: 0, y: 80 });
    expect(child).toEqual({ nodeId: "c", x: 100, y: 40 });
    expect((first.y + second.y) / 2).toBe(child.y);
  });

  describe("alignment on the cross axis", () => {
    /**
     * The demo seed graph: `ingest` forks into two branches, and the left one runs
     * one rank longer than the right one. The last rank holds `publish` alone.
     */
    const demoEdges = [
      edge("ingest", "enrich"),
      edge("ingest", "parse"),
      edge("enrich", "score"),
      edge("parse", "audit"),
      edge("score", "publish"),
    ];

    /** The demo's 158 x 34 boxes, in the order the ranks are emitted. */
    function demoNodes(): GraphLayoutNodeInput[] {
      return ["ingest", "enrich", "parse", "score", "audit", "publish"].map((id) =>
        sized(id, 158, 34),
      );
    }

    /** The demo host's grid: 158 x 34 boxes, a 240 gap and 280 between ranks. */
    function demoOptions(direction: "horizontal" | "vertical"): GraphLayoutOptions {
      return options({
        direction,
        nodeSpacing: 240,
        rankSpacing: 280,
        nodeSize: { width: 158, height: 34 },
      });
    }

    const demoBox = { width: 158, height: 34 };

    it("keeps a branch's last node in its parent's column when the direction is vertical", () => {
      const result = placed(
        layered.place({ nodes: demoNodes(), edges: demoEdges, options: demoOptions("vertical") }),
      );

      // One pitch is the 158-wide box plus the 240 gap; ranks are 280 apart.
      expect(result).toEqual([
        { nodeId: "ingest", x: 199, y: 0 },
        { nodeId: "enrich", x: 0, y: 280 },
        { nodeId: "parse", x: 398, y: 280 },
        { nodeId: "score", x: 0, y: 560 },
        { nodeId: "audit", x: 398, y: 560 },
        { nodeId: "publish", x: 0, y: 840 },
      ]);
      // The defect: `publish` has one parent, so it takes that parent's column.
      // The centring rule put it at 199, the midpoint of the two branches.
      expect(positionOf(result, "publish").x).toBe(positionOf(result, "score").x);
      // The half of the rule that stays: a node with several children sits over
      // the mean of them.
      expect(positionOf(result, "ingest").x).toBe(
        (positionOf(result, "enrich").x + positionOf(result, "parse").x) / 2,
      );
      expect(rankCollisions(result, demoBox, "y")).toEqual([]);
    });

    it("keeps a branch's last node in its parent's column when the direction is horizontal", () => {
      // The same graph on the other axis: `y` carries the alignment and reads the
      // 34-tall box, so one pitch is 34 + 240 = 274, while `x` stays
      // `rank * rankSpacing`.
      const result = placed(
        layered.place({ nodes: demoNodes(), edges: demoEdges, options: demoOptions("horizontal") }),
      );

      expect(result).toEqual([
        { nodeId: "ingest", x: 0, y: 137 },
        { nodeId: "enrich", x: 280, y: 0 },
        { nodeId: "parse", x: 280, y: 274 },
        { nodeId: "score", x: 560, y: 0 },
        { nodeId: "audit", x: 560, y: 274 },
        { nodeId: "publish", x: 840, y: 0 },
      ]);
      expect(positionOf(result, "publish").y).toBe(positionOf(result, "score").y);
      expect(positionOf(result, "ingest").y).toBe(
        (positionOf(result, "enrich").y + positionOf(result, "parse").y) / 2,
      );
      expect(rankCollisions(result, demoBox, "x")).toEqual([]);
    });

    it("keeps a chain of four nodes on cross coordinate 0 at every rank", () => {
      const nodes = ["a", "b", "c", "d"].map((id) => sized(id, 158, 34));
      const edges = [edge("a", "b"), edge("b", "c"), edge("c", "d")];

      expect(placed(layered.place({ nodes, edges, options: demoOptions("vertical") }))).toEqual([
        { nodeId: "a", x: 0, y: 0 },
        { nodeId: "b", x: 0, y: 280 },
        { nodeId: "c", x: 0, y: 560 },
        { nodeId: "d", x: 0, y: 840 },
      ]);
      expect(placed(layered.place({ nodes, edges, options: demoOptions("horizontal") }))).toEqual([
        { nodeId: "a", x: 0, y: 0 },
        { nodeId: "b", x: 280, y: 0 },
        { nodeId: "c", x: 560, y: 0 },
        { nodeId: "d", x: 840, y: 0 },
      ]);
    });

    it("sits a fork and a join on the mean of the rank between them", () => {
      const result = placed(
        layered.place({
          nodes: [node("a"), node("b"), node("c"), node("d")],
          edges: [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")],
          options: options({ direction: "horizontal", nodeSpacing: 40, rankSpacing: 100 }),
        }),
      );

      // One pitch is the default 40-tall box plus the 40 gap.
      expect(result).toEqual([
        { nodeId: "a", x: 0, y: 40 },
        { nodeId: "b", x: 100, y: 0 },
        { nodeId: "c", x: 100, y: 80 },
        { nodeId: "d", x: 200, y: 40 },
      ]);
      // The fork and the join both sit on the mean of the rank they share, so the
      // diamond is symmetric on the cross axis.
      expect(positionOf(result, "a").y).toBe(
        (positionOf(result, "b").y + positionOf(result, "c").y) / 2,
      );
      expect(positionOf(result, "d").y).toBe(positionOf(result, "a").y);
      // Separation still holds inside the shared rank.
      expect(positionOf(result, "c").y - positionOf(result, "b").y).toBe(80);
      expect(rankCollisions(result, { width: 140, height: 40 }, "x")).toEqual([]);
    });

    it("spreads only the sibling of a chain that continues through a mixed rank", () => {
      // `p` forks into `m` and `s`, and only `m` continues (into `t`). The rank
      // that holds `m` and `s` therefore mixes a chain node with a leaf: `m` keeps
      // the column its own chain defines `0` — the column of `t` — while `s` takes
      // the free one, and `p` sits over the mean of the two.
      const result = placed(
        layered.place({
          nodes: [node("p"), node("m"), node("s"), node("t")],
          edges: [edge("p", "m"), edge("p", "s"), edge("m", "t")],
          options: options({ direction: "horizontal", nodeSpacing: 40, rankSpacing: 100 }),
        }),
      );

      expect(result).toEqual([
        { nodeId: "p", x: 0, y: 40 },
        { nodeId: "m", x: 100, y: 0 },
        { nodeId: "s", x: 100, y: 80 },
        { nodeId: "t", x: 200, y: 0 },
      ]);
      // The chain `m -> t` is one column, one pitch away from the sibling, and
      // the fork above them sits on their mean.
      expect(positionOf(result, "t").y).toBe(positionOf(result, "m").y);
      expect(positionOf(result, "s").y - positionOf(result, "m").y).toBe(80);
      expect(rankCollisions(result, { width: 140, height: 40 }, "x")).toEqual([]);
    });

    it("depends only on the set of nodes and edges and reserves every slot for scope unpositioned", () => {
      const forward = placed(
        layered.place({ nodes: demoNodes(), edges: demoEdges, options: demoOptions("vertical") }),
      );
      const reversed = placed(
        layered.place({
          nodes: [...demoNodes()].reverse(),
          edges: [...demoEdges].reverse(),
          options: demoOptions("vertical"),
        }),
      );
      const shuffled = placed(
        layered.place({
          nodes: ["score", "audit", "ingest", "publish", "parse", "enrich"].map((id) =>
            sized(id, 158, 34),
          ),
          edges: [
            edge("score", "publish"),
            edge("parse", "audit"),
            edge("enrich", "score"),
            edge("ingest", "parse"),
            edge("ingest", "enrich"),
          ],
          options: demoOptions("vertical"),
        }),
      );

      expect(reversed).toEqual(forward);
      expect(shuffled).toEqual(forward);

      // A node the document already positions keeps its slot: the alignment runs
      // over the full ranks and only the emission is filtered.
      const partlyPositioned: GraphLayoutNodeInput[] = [
        sized("ingest", 158, 34),
        { id: createNodeId("enrich"), position: { x: 700, y: 900 }, width: 158, height: 34 },
        sized("parse", 158, 34),
        sized("score", 158, 34),
        sized("audit", 158, 34),
        sized("publish", 158, 34),
      ];
      expect(
        placed(
          layered.place({
            nodes: partlyPositioned,
            edges: demoEdges,
            options: { ...demoOptions("vertical"), scope: "unpositioned" },
          }),
        ),
      ).toEqual([
        { nodeId: "ingest", x: 199, y: 0 },
        { nodeId: "parse", x: 398, y: 280 },
        { nodeId: "score", x: 0, y: 560 },
        { nodeId: "audit", x: 398, y: 560 },
        { nodeId: "publish", x: 0, y: 840 },
      ]);
    });
  });

  describe("box-based cross geometry", () => {
    it("keeps a lone rank clear of the two columns beside it", () => {
      // The reported intrusion: two columns of 158-wide boxes with a gap of 240
      // between them, and one node alone in the next rank that both columns feed.
      // `nodeSpacing` is the **gap** between two boxes, so the pitch is
      // 158 + 240 = 398, and a child with two parents sits on their mean (199),
      // between the columns, instead of over the left one (the old pitch-based
      // geometry put it at 120, straight into 0..158).
      const result = placed(
        layered.place({
          nodes: [sized("a", 158, 34), sized("b", 158, 34), sized("c", 158, 34)],
          edges: [edge("a", "c"), edge("b", "c")],
          options: options({ direction: "vertical", nodeSpacing: 240, rankSpacing: 280 }),
        }),
      );

      const left = positionOf(result, "a");
      const right = positionOf(result, "b");
      const lone = positionOf(result, "c");

      expect(left).toEqual({ nodeId: "a", x: 0, y: 0 });
      expect(right).toEqual({ nodeId: "b", x: 398, y: 0 });
      expect(lone).toEqual({ nodeId: "c", x: 199, y: 280 });
      // 41 units of clearance on each side: neither neighbour's box is touched.
      expect(overlaps(box(left, 158, 34), box(lone, 158, 34))).toBe(false);
      expect(overlaps(box(right, 158, 34), box(lone, 158, 34))).toBe(false);
      expect(lone.x - (left.x + 158)).toBe(41);
      expect(right.x - (lone.x + 158)).toBe(41);
    });

    it("pitches a rank by its widest box, so the boxes of one rank never overlap", () => {
      // Mixed sizes: a rank steps by its **widest** box plus the gap, so the
      // narrow nodes keep the distance the widest one needs.
      const vertical = placed(
        layered.place({
          nodes: [sized("a", 400, 40), sized("b", 100, 40), sized("c", 60, 40)],
          edges: [],
          options: options({ direction: "vertical", nodeSpacing: 60 }),
        }),
      );

      const first = positionOf(vertical, "a");
      const second = positionOf(vertical, "b");
      const third = positionOf(vertical, "c");

      expect(first).toEqual({ nodeId: "a", x: 0, y: 0 });
      expect(second).toEqual({ nodeId: "b", x: 460, y: 0 });
      expect(third).toEqual({ nodeId: "c", x: 920, y: 0 });
      // One pitch for the whole rank: 400 + 60. The gap a narrow box leaves is
      // therefore larger than `nodeSpacing`, never smaller.
      expect(second.x - (first.x + 400)).toBe(60);
      expect(third.x - (second.x + 100)).toBe(360);
      expect(overlaps(box(first, 400, 40), box(second, 100, 40))).toBe(false);
      expect(overlaps(box(second, 100, 40), box(third, 60, 40))).toBe(false);

      // The same rule on the other axis: `horizontal` stacks the rank on `y`, so
      // the heights drive the pitch (120 + 80 = 200).
      const horizontal = placed(
        layered.place({
          nodes: [sized("a", 158, 120), sized("b", 158, 40)],
          edges: [],
          options: options({ direction: "horizontal", nodeSpacing: 80 }),
        }),
      );

      expect(horizontal).toEqual([
        { nodeId: "a", x: 0, y: 0 },
        { nodeId: "b", x: 0, y: 200 },
      ]);
      expect(
        overlaps(
          box(positionOf(horizontal, "a"), 158, 120),
          box(positionOf(horizontal, "b"), 158, 40),
        ),
      ).toBe(false);
    });

    it("falls back to nodeSize for a node that declares no size", () => {
      // `b` carries no box, so the host's default is what the pitch uses: the
      // widest box of the rank is `nodeSize.width` 140 plus the gap 60. Without
      // the fallback the widest box would be 100 and `b` would sit at 160.
      const result = placed(
        layered.place({
          nodes: [sized("a", 100, 20), node("b")],
          edges: [],
          options: options({
            direction: "vertical",
            nodeSpacing: 60,
            nodeSize: { width: 140, height: 40 },
          }),
        }),
      );

      const first = positionOf(result, "a");
      const second = positionOf(result, "b");

      expect(first).toEqual({ nodeId: "a", x: 0, y: 0 });
      expect(second).toEqual({ nodeId: "b", x: 200, y: 0 });
      expect(overlaps(box(first, 100, 20), box(second, 140, 40))).toBe(false);
    });

    it("keeps determinism and the full-rank slot reservation in box units", () => {
      // The invariants the geometry change must not touch: the answer depends on
      // the set of nodes and edges only, and `scope: "unpositioned"` drops a
      // positioned node without moving the others, because the alignment runs
      // over the full ranks and only the emission is filtered.
      const nodes = [sized("a", 158, 34), sized("b", 158, 34), sized("c", 158, 34)];
      const edges = [edge("a", "c"), edge("b", "c")];
      const positioned = [
        { id: createNodeId("a"), position: { x: 700, y: 900 }, width: 158, height: 34 },
        sized("b", 158, 34),
        sized("c", 158, 34),
      ];
      const geometry = options({ direction: "vertical", nodeSpacing: 240, rankSpacing: 280 });

      expect(placed(layered.place({ nodes, edges, options: geometry }))).toEqual([
        { nodeId: "a", x: 0, y: 0 },
        { nodeId: "b", x: 398, y: 0 },
        { nodeId: "c", x: 199, y: 280 },
      ]);
      expect(
        placed(
          layered.place({ nodes: [...nodes].reverse(), edges: [...edges].reverse(), options: geometry }),
        ),
      ).toEqual(placed(layered.place({ nodes, edges, options: geometry })));
      expect(
        placed(
          layered.place({
            nodes: positioned,
            edges,
            options: { ...geometry, scope: "unpositioned" },
          }),
        ),
      ).toEqual([
        { nodeId: "b", x: 398, y: 0 },
        { nodeId: "c", x: 199, y: 280 },
      ]);
    });
  });

  it("keeps the slot of a positioned node that scope unpositioned leaves out", () => {
    // The alignment reads the **full** rank set, never the emitted subset, so
    // dropping `a` from the answer moves nothing else: the grid the host sees does
    // not change with the scope.
    const nodes = [node("a", { x: 700, y: 900 }), node("b"), node("c")];
    const edges = [edge("a", "b"), edge("a", "c")];

    const all = placed(layered.place({ nodes, edges, options: options({ scope: "all" }) }));
    const unpositioned = placed(
      layered.place({ nodes, edges, options: options({ scope: "unpositioned" }) }),
    );

    expect(all).toEqual([
      { nodeId: "a", x: 0, y: 40 },
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 100, y: 80 },
    ]);
    expect(unpositioned).toEqual([
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 100, y: 80 },
    ]);
  });

  it("returns every node for scope all and only the unpositioned nodes for scope unpositioned", () => {
    const input = {
      nodes: [node("a", { x: 700, y: 900 }), node("b"), node("c")],
      edges: [edge("a", "b"), edge("b", "c")],
    };

    expect(placed(layered.place({ ...input, options: options({ scope: "all" }) }))).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 200, y: 0 },
    ]);

    expect(
      placed(layered.place({ ...input, options: options({ scope: "unpositioned" }) })),
    ).toEqual([
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 200, y: 0 },
    ]);
  });

  it("fails with an invalid-options diagnostic when a spacing is not a positive finite number", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge("a", "b")];

    for (const invalid of [
      options({ nodeSpacing: 0 }),
      options({ nodeSpacing: -40 }),
      options({ nodeSpacing: Number.NaN }),
      options({ nodeSpacing: Number.POSITIVE_INFINITY }),
      options({ rankSpacing: 0 }),
      options({ rankSpacing: -100 }),
      options({ rankSpacing: Number.NaN }),
    ]) {
      const diagnostic = failed(layered.place({ nodes, edges, options: invalid }));

      expect(diagnostic.code).toBe("graph-layout.invalid-options");
      expect(diagnostic.message.length).toBeGreaterThan(0);
    }
  });

  it("fails with an invalid-options diagnostic naming the nodeSize field", () => {
    const nodes = [node("a"), node("b")];
    const edges = [edge("a", "b")];
    const invalidSizes = [
      { nodeSize: { width: 0, height: 40 }, field: "nodeSize.width" },
      { nodeSize: { width: -140, height: 40 }, field: "nodeSize.width" },
      { nodeSize: { width: Number.NaN, height: 40 }, field: "nodeSize.width" },
      { nodeSize: { width: 140, height: 0 }, field: "nodeSize.height" },
      { nodeSize: { width: 140, height: Number.POSITIVE_INFINITY }, field: "nodeSize.height" },
    ] as const;

    for (const invalid of invalidSizes) {
      const diagnostic = failed(
        layered.place({ nodes, edges, options: options({ nodeSize: invalid.nodeSize }) }),
      );

      expect(diagnostic.code).toBe("graph-layout.invalid-options");
      expect(diagnostic.message).toContain(invalid.field);
    }

    // A host that bypasses the types hands in something that is not a box at
    // all; the diagnostic names the option, never a geometry built from it.
    const notABox = failed(
      layered.place({
        nodes,
        edges,
        options: { ...options(), nodeSize: null } as unknown as GraphLayoutOptions,
      }),
    );

    expect(notABox.code).toBe("graph-layout.invalid-options");
    expect(notABox.message).toContain("nodeSize");
  });

  it("fails with a duplicate-node diagnostic when two nodes share an id", () => {
    const diagnostic = failed(
      layered.place({
        nodes: [node("a"), node("b"), node("a")],
        edges: [edge("a", "b")],
        options: options(),
      }),
    );

    expect(diagnostic.code).toBe("graph-layout.duplicate-node");
    expect(diagnostic.nodeId).toBe("a");
    expect(diagnostic.message.length).toBeGreaterThan(0);
  });

  it("fails with an unknown-edge-node diagnostic when an edge points at an unknown node", () => {
    const diagnostic = failed(
      layered.place({
        nodes: [node("a"), node("b")],
        edges: [edge("a", "ghost")],
        options: options(),
      }),
    );

    expect(diagnostic.code).toBe("graph-layout.unknown-edge-node");
    expect(diagnostic.nodeId).toBe("ghost");
    expect(diagnostic.message.length).toBeGreaterThan(0);

    const unknownSource = failed(
      layered.place({
        nodes: [node("a")],
        edges: [edge("phantom", "a")],
        options: options(),
      }),
    );

    expect(unknownSource.code).toBe("graph-layout.unknown-edge-node");
    expect(unknownSource.nodeId).toBe("phantom");
  });

  it("returns identical positions when the input order is permuted", () => {
    const nodes = [node("a"), node("b"), node("c"), node("d"), node("e"), node("f"), node("g")];
    const edges = [
      edge("a", "b"),
      edge("a", "c"),
      edge("b", "d"),
      edge("c", "d"),
      edge("d", "e"),
      edge("f", "g"),
      edge("g", "f"),
    ];

    const forward = placed(layered.place({ nodes, edges, options: options() }));
    const reversed = placed(
      layered.place({
        nodes: [...nodes].reverse(),
        edges: [...edges].reverse(),
        options: options(),
      }),
    );

    expect(reversed).toEqual(forward);
  });
});
