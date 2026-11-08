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

    expect(placed(result)).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "b", x: 0, y: 100 },
      { nodeId: "c", x: 40, y: 100 },
    ]);
  });

  it("orders the nodes of a rank by node id, never by input order", () => {
    const result = layered.place({
      nodes: [node("c"), node("b"), node("a")],
      edges: [edge("a", "c"), edge("a", "b")],
      options: options(),
    });

    expect(placed(result)).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 100, y: 40 },
    ]);
  });

  it("places cycle-locked nodes after every resolved rank", () => {
    const cycleOnly = layered.place({
      nodes: [node("d"), node("a"), node("c"), node("b")],
      edges: [edge("d", "c"), edge("a", "b"), edge("c", "d")],
      options: options(),
    });

    expect(placed(cycleOnly)).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "b", x: 100, y: 0 },
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

    expect(
      placed(layered.place({ nodes, edges, options: options({ nodeSpacing: 40, rankSpacing: 100 }) })),
    ).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "s", x: 0, y: 40 },
      { nodeId: "b", x: 100, y: 0 },
      { nodeId: "c", x: 200, y: 0 },
      { nodeId: "alpha", x: 300, y: 0 },
      { nodeId: "zeta", x: 300, y: 40 },
    ]);

    expect(
      placed(layered.place({ nodes, edges, options: options({ direction: "vertical" }) })),
    ).toEqual([
      { nodeId: "a", x: 0, y: 0 },
      { nodeId: "s", x: 40, y: 0 },
      { nodeId: "b", x: 0, y: 100 },
      { nodeId: "c", x: 0, y: 200 },
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
