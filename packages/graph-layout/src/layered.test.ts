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

    // `a` is alone in its rank and its two children are not: the cross axis (now
    // `x`) centres the one-node rank over the two-node one, so `a` sits at 20
    // — the mean of its children's columns — instead of over `b`'s column.
    expect(placed(result)).toEqual([
      { nodeId: "a", x: 20, y: 0 },
      { nodeId: "b", x: 0, y: 100 },
      { nodeId: "c", x: 40, y: 100 },
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

    // Retargeted again by the centring rule: `a` is alone in its rank over a
    // two-node rank, so its cross coordinate is the mean of the children's.
    expect(placed(result)).toEqual([
      { nodeId: "a", x: 0, y: 20 },
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 100, y: 40 },
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

    // Retargeted by the centring rule: `a` forks, so its one-node rank is
    // centred over the two-node rank below it (`y: 20`, the mean of 0 and 40).
    expect(result).toEqual([
      { nodeId: "a", x: 0, y: 20 },
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 100, y: 40 },
      // Crossed as [d, e]; the barycenter keeps each child under its own parent.
      { nodeId: "e", x: 200, y: 0 },
      { nodeId: "d", x: 200, y: 40 },
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
    // (The rank axis is untouched by the centring rule: it only shifts the
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
    // Centring: `[b, c]` and `[e, d]` both hold two nodes, so only the one-node
    // rank of `a` is narrower than the widest one and shifts by
    // (2 - 1) / 2 * 40 = 20.
    expect(new Map(result.map((entry) => [entry.nodeId, entry.y]))).toEqual(
      new Map([
        ["a", 20],
        ["b", 0],
        ["c", 40],
        ["e", 0],
        ["d", 40],
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

    // Retargeted by the centring rule: the widest rank holds two nodes ([c, d]
    // in the cycle-locked bucket), so the one-node ranks of `a` and `b` are
    // centred at `y: 20`. Rank order, ids and the rank axis are unchanged.
    expect(placed(cycleOnly)).toEqual([
      { nodeId: "a", x: 0, y: 20 },
      { nodeId: "b", x: 100, y: 20 },
      { nodeId: "c", x: 200, y: 0 },
      { nodeId: "d", x: 200, y: 40 },
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

    // Retargeted by the centring rule: the widest rank holds two nodes
    // ([a, s] and the isolated bucket [alpha, zeta]), so the one-node ranks of
    // `b` and `c` take the cross coordinate 20 instead of 0.
    expect(
      placed(layered.place({ nodes, edges, options: options({ nodeSpacing: 40, rankSpacing: 100 }) })),
    ).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "s", x: 0, y: 40 },
      { nodeId: "b", x: 100, y: 20 },
      { nodeId: "c", x: 200, y: 20 },
      { nodeId: "alpha", x: 300, y: 0 },
      { nodeId: "zeta", x: 300, y: 40 },
    ]);

    expect(
      placed(layered.place({ nodes, edges, options: options({ direction: "vertical" }) })),
    ).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "s", x: 40, y: 0 },
      { nodeId: "b", x: 20, y: 100 },
      { nodeId: "c", x: 20, y: 200 },
      { nodeId: "alpha", x: 0, y: 300 },
      { nodeId: "zeta", x: 40, y: 300 },
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
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "b", x: 0, y: 40 },
      { nodeId: "c", x: 0, y: 80 },
    ]);
  });

  it("centres a rank over the widest one on the cross axis when the direction is vertical", () => {
    // The reported defect: a node several branches depart from did not sit over
    // the centre of those branches. `a` forks into `b` and `c`, so the one-node
    // rank of `a` is centred over the two-node rank of its children instead of
    // starting at the cross origin. The rank axis is untouched.
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
    expect(right).toEqual({ nodeId: "c", x: 40, y: 100 });
    expect(parent.x).toBe((left.x + right.x) / 2);
    expect(parent).toEqual({ nodeId: "a", x: 20, y: 0 });
  });

  it("centres a rank over the widest one on the cross axis when the direction is horizontal", () => {
    // The same rule on the other axis: `y` carries the in-rank index, and the
    // rank axis (`x`) is exactly `rank * rankSpacing`, unchanged.
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
    expect(right).toEqual({ nodeId: "c", x: 100, y: 40 });
    expect(parent.x).toBe(0);
    expect(left.x).toBe(right.x);
    expect(left.x).toBe(100);
    expect(parent.y).toBe((left.y + right.y) / 2);
    expect(parent).toEqual({ nodeId: "a", x: 0, y: 20 });
  });

  it("keeps every node of a one-node-per-rank chain on cross coordinate 0", () => {
    // Preserved geometry: with exactly one node per rank the widest rank is the
    // rank itself, so the centring offset `(maxWidth - n) / 2 * nodeSpacing` is
    // zero and a linear chain is still a straight line on both directions.
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
  });

  it("centres two parents over their shared child when that rank is the wider one", () => {
    // `a -> c` and `b -> c`: the parents share the wide rank and the child is
    // alone in its own, so the child is centred between the two columns.
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
    expect(second).toEqual({ nodeId: "b", x: 0, y: 40 });
    expect(child).toEqual({ nodeId: "c", x: 100, y: 20 });
    expect((first.y + second.y) / 2).toBe(child.y);
  });

  it("keeps the slot of a positioned node that scope unpositioned leaves out", () => {
    // The centring offset comes from the **full** rank length, never from the
    // emitted subset, so dropping `a` from the answer moves nothing else: the
    // grid the host sees does not change with the scope.
    const nodes = [node("a", { x: 700, y: 900 }), node("b"), node("c")];
    const edges = [edge("a", "b"), edge("a", "c")];

    const all = placed(layered.place({ nodes, edges, options: options({ scope: "all" }) }));
    const unpositioned = placed(
      layered.place({ nodes, edges, options: options({ scope: "unpositioned" }) }),
    );

    expect(all).toEqual([
      { nodeId: "a", x: 0, y: 20 },
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 100, y: 40 },
    ]);
    expect(unpositioned).toEqual([
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 100, y: 40 },
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
