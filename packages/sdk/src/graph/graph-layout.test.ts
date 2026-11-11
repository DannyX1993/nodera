/**
 * Automatic placement of the nodes a host left unpositioned.
 *
 * Every assertion here goes through the public builder surface: the host
 * configures `graph.layout`, adds instances and reads back the position of the
 * instance views. Nothing reads internal storage, and nothing places a node the
 * host already positioned.
 *
 * The anchored rules read the anchor's position and the graph's positions and
 * nothing else: the host decides which node is the anchor, so the SDK never
 * looks at a selection itself.
 */

import { describe, expect, it } from "vitest";
import type { Result } from "@nodera/contracts";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";
import type { BuilderConfiguration, BuilderGraphConfiguration } from "../builder/configuration.js";
import type { SdkIssues } from "../errors.js";
import type { NodeInstanceView } from "../view/instances.js";

const STEP = "flow.step";

function nodeInput(type: string): NodeDefinitionInput {
  return {
    type,
    version: "1.0.0",
    label: type,
    category: "flow",
    ports: {
      inputs: [{ id: "in", dataType: "any" }],
      outputs: [{ id: "out", dataType: "any" }],
    },
  };
}

/**
 * Configuration of a host that does not type-check its own input, which is how a
 * JavaScript host reaches the boundary: the assertion is the only cast in this
 * file and it exists to hand the builder a value the types forbid.
 */
function hostConfiguration(layout: unknown): BuilderConfiguration {
  const registry = { nodes: [nodeInput(STEP)] };
  return layout === undefined
    ? { registry }
    : { registry, graph: { layout } as BuilderGraphConfiguration };
}

function builderWith(layout?: unknown): Builder {
  const result = createBuilder(hostConfiguration(layout));
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

function added(builder: Builder, position?: { readonly x: number; readonly y: number }): NodeInstanceView {
  const result = builder.graph.addNode(
    position === undefined ? { type: STEP } : { type: STEP, position },
  );
  if (!result.ok) {
    throw new Error(
      `unexpected add-node failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

/**
 * The instance of a successful add, failing the test when the SDK refused it.
 *
 * The anchored cases need an explicit instance id and the `after` anchor, so
 * they write the whole request instead of going through {@link added}.
 */
function placed(result: Result<NodeInstanceView, SdkIssues>): NodeInstanceView {
  if (!result.ok) {
    throw new Error(
      `unexpected add-node failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

/**
 * Loads nodes a host authored as a document.
 *
 * It is how a node **without** a position reaches an `auto` builder: `addNode`
 * would have placed it, so the only honest way to reach that state is the
 * import a host performs with its own document.
 */
function importNodes(
  builder: Builder,
  nodes: readonly Readonly<Record<string, unknown>>[],
): void {
  const imported = builder.document.import({
    format: "ggd",
    version: "1.1.0",
    metadata: { id: "graph-placement" },
    extensions: [],
    graph: { nodes, edges: [] },
  });
  if (!imported.ok) {
    throw new Error(
      `unexpected import failure: ${imported.error.map((issue) => issue.code).join(", ")}`,
    );
  }
}

function buildFailure(
  layout: unknown,
): readonly { readonly code: string; readonly path?: readonly string[] }[] {
  const result = createBuilder(hostConfiguration(layout));
  if (result.ok) {
    throw new Error("expected the builder to refuse an invalid graph layout");
  }
  return result.error;
}

describe("graph layout: free mode", () => {
  it("leaves a node unpositioned when the host configures no layout", () => {
    const builder = builderWith();
    expect(added(builder).position).toBeUndefined();
  });

  it("leaves a node unpositioned when the host asks for free placement", () => {
    const builder = builderWith({ mode: "free" });
    expect(added(builder).position).toBeUndefined();
  });

  it("ignores the anchor and invents no position", () => {
    const builder = builderWith({ mode: "free" });
    const anchor = placed(
      builder.graph.addNode({ type: STEP, nodeId: "anchor", position: { x: 0, y: 0 } }),
    );

    expect(placed(builder.graph.addNode({ type: STEP, after: anchor.id })).position).toBeUndefined();
  });
});

describe("graph layout: automatic placement", () => {
  it("places the first node of an empty graph at the grid anchor", () => {
    expect(added(builderWith({ mode: "auto" })).position).toEqual({ x: 0, y: 0 });
  });

  it("grows horizontally by the default box plus the default spacing", () => {
    const builder = builderWith({ mode: "auto" });
    expect(added(builder).position).toEqual({ x: 0, y: 0 });
    // The strategy's default 140-wide box plus the default 240 gap.
    expect(added(builder).position).toEqual({ x: 380, y: 0 });
  });

  it("grows horizontally by the default box plus the configured spacing", () => {
    const builder = builderWith({ mode: "auto", spacing: 100 });
    expect(added(builder).position).toEqual({ x: 0, y: 0 });
    expect(added(builder).position).toEqual({ x: 240, y: 0 });
  });

  it("steps along the advanced axis by the declared box plus the spacing", () => {
    const layout = { mode: "auto", spacing: 100, nodeSize: { width: 60, height: 20 } };
    const horizontal = builderWith({ ...layout, direction: "horizontal" });
    expect(added(horizontal).position).toEqual({ x: 0, y: 0 });
    expect(added(horizontal).position).toEqual({ x: 160, y: 0 });
    expect(added(horizontal).position).toEqual({ x: 320, y: 0 });

    // `vertical` advances `y`, so the step reads the height: 20 + 100 = 120.
    const vertical = builderWith({ ...layout, direction: "vertical" });
    expect(added(vertical).position).toEqual({ x: 0, y: 0 });
    expect(added(vertical).position).toEqual({ x: 0, y: 120 });
    expect(added(vertical).position).toEqual({ x: 0, y: 240 });
  });

  it("keeps the boxes apart when the spacing is smaller than the box", () => {
    const builder = builderWith({
      mode: "auto",
      spacing: 10,
      nodeSize: { width: 200, height: 40 },
    });
    expect(added(builder).position).toEqual({ x: 0, y: 0 });
    expect(added(builder).position).toEqual({ x: 210, y: 0 });
  });

  it("grows vertically when the host asks for vertical placement", () => {
    const builder = builderWith({ mode: "auto", direction: "vertical" });
    expect(added(builder).position).toEqual({ x: 0, y: 0 });
    // The default 40-tall box plus the default 240 gap.
    expect(added(builder).position).toEqual({ x: 0, y: 280 });
  });

  it("skips a slot the host already occupies", () => {
    const builder = builderWith({ mode: "auto" });
    expect(added(builder, { x: 0, y: 0 }).position).toEqual({ x: 0, y: 0 });
    expect(added(builder).position).toEqual({ x: 380, y: 0 });
  });

  it("assigns the same slot whatever order the occupied nodes were added in", () => {
    const forward = builderWith({ mode: "auto" });
    added(forward, { x: 240, y: 0 });
    added(forward, { x: 480, y: 0 });
    expect(added(forward).position).toEqual({ x: 860, y: 0 });

    const backward = builderWith({ mode: "auto" });
    added(backward, { x: 480, y: 0 });
    added(backward, { x: 240, y: 0 });
    expect(added(backward).position).toEqual({ x: 860, y: 0 });
  });

  it("lands after the graph's extent when the host declares no anchor", () => {
    const builder = builderWith({ mode: "auto" });
    added(builder, { x: 0, y: 0 });
    added(builder, { x: 240, y: 0 });
    expect(added(builder).position).toEqual({ x: 620, y: 0 });
  });

  it("keeps the farthest row and steps past the extent along the vertical axis", () => {
    const builder = builderWith({ mode: "auto", direction: "vertical" });
    added(builder, { x: 0, y: 0 });
    added(builder, { x: 0, y: 240 });
    expect(added(builder).position).toEqual({ x: 0, y: 520 });
  });

  it("keeps a position the host supplied itself", () => {
    const builder = builderWith({ mode: "auto" });
    expect(added(builder, { x: 10, y: 20 }).position).toEqual({ x: 10, y: 20 });
  });

  it("never moves a node the host already positioned", () => {
    const builder = builderWith({ mode: "auto" });
    const first = added(builder, { x: 500, y: 300 });
    added(builder);
    expect(builder.graph.nodes().find((node) => node.id === first.id)?.position).toEqual({
      x: 500,
      y: 300,
    });
  });

  it("keeps the assigned position inside the add-node history unit", () => {
    const builder = builderWith({ mode: "auto" });
    const first = added(builder);
    const second = added(builder);
    expect(first.position).toEqual({ x: 0, y: 0 });
    expect(second.position).toEqual({ x: 380, y: 0 });

    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodes()).toHaveLength(1);
    expect(builder.graph.nodes()[0]?.position).toEqual({ x: 0, y: 0 });

    expect(builder.graph.redo()).toBe(true);
    expect(builder.graph.nodes().find((restored) => restored.id === second.id)?.position).toEqual({
      x: 380,
      y: 0,
    });
  });
});

describe("graph layout: anchored placement", () => {
  it("lands the first free slot forward of the anchor along the axis", () => {
    const builder = builderWith({ mode: "auto" });
    const anchor = placed(
      builder.graph.addNode({ type: STEP, nodeId: "anchor", position: { x: 0, y: 0 } }),
    );
    placed(builder.graph.addNode({ type: STEP, nodeId: "sibling", position: { x: 240, y: 0 } }));

    // The default box plus the default gap: the candidate starts at 380, which is
    // free, so it is the first free slot forward of the anchor.
    expect(placed(builder.graph.addNode({ type: STEP, after: anchor.id })).position).toEqual({
      x: 380,
      y: 0,
    });
  });

  it("skips an occupied slot forward and never backward", () => {
    const builder = builderWith({ mode: "auto" });
    // The slot behind the anchor stays empty: placement only ever steps ahead.
    placed(builder.graph.addNode({ type: STEP, nodeId: "behind", position: { x: 240, y: 0 } }));
    const anchor = placed(
      builder.graph.addNode({ type: STEP, nodeId: "anchor", position: { x: 480, y: 0 } }),
    );

    expect(placed(builder.graph.addNode({ type: STEP, after: anchor.id })).position).toEqual({
      x: 860,
      y: 0,
    });
  });

  it("steps forward along the vertical axis", () => {
    const builder = builderWith({ mode: "auto", direction: "vertical" });
    const anchor = placed(
      builder.graph.addNode({ type: STEP, nodeId: "anchor", position: { x: 0, y: 240 } }),
    );
    placed(builder.graph.addNode({ type: STEP, nodeId: "sibling", position: { x: 0, y: 480 } }));

    expect(placed(builder.graph.addNode({ type: STEP, after: anchor.id })).position).toEqual({
      x: 0,
      y: 520,
    });
  });

  it("keeps the anchor's row and steps by the default box plus the spacing", () => {
    const builder = builderWith({ mode: "auto", spacing: 100 });
    const anchor = placed(
      builder.graph.addNode({ type: STEP, nodeId: "anchor", position: { x: 50, y: 300 } }),
    );

    expect(placed(builder.graph.addNode({ type: STEP, after: anchor.id })).position).toEqual({
      x: 290,
      y: 300,
    });
  });

  it("lands after the graph's extent when the anchor carries no position", () => {
    const builder = builderWith({ mode: "auto" });
    importNodes(builder, [
      { id: "placed", type: STEP, position: { x: 240, y: 0 } },
      { id: "unplaced", type: STEP },
    ]);

    expect(placed(builder.graph.addNode({ type: STEP, after: "unplaced" })).position).toEqual({
      x: 620,
      y: 0,
    });
  });

  it("lets an explicit position win over the anchor", () => {
    const builder = builderWith({ mode: "auto" });
    const anchor = placed(
      builder.graph.addNode({ type: STEP, nodeId: "anchor", position: { x: 0, y: 0 } }),
    );

    expect(
      placed(
        builder.graph.addNode({ type: STEP, after: anchor.id, position: { x: 900, y: 900 } }),
      ).position,
    ).toEqual({ x: 900, y: 900 });
  });

  it("keeps an anchored position inside the add-node history unit", () => {
    const builder = builderWith({ mode: "auto" });
    const anchor = placed(
      builder.graph.addNode({ type: STEP, nodeId: "anchor", position: { x: 0, y: 0 } }),
    );
    const child = placed(builder.graph.addNode({ type: STEP, nodeId: "child", after: anchor.id }));
    expect(child.position).toEqual({ x: 380, y: 0 });

    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodes().map((node) => node.id)).toEqual([anchor.id]);

    expect(builder.graph.redo()).toBe(true);
    expect(builder.graph.nodes().find((node) => node.id === child.id)?.position).toEqual({
      x: 380,
      y: 0,
    });
  });

  it("answers the same slot for the same state whatever the ids, the order or the repetition", () => {
    const forward = builderWith({ mode: "auto" });
    const first = placed(
      forward.graph.addNode({ type: STEP, nodeId: "zulu", position: { x: 0, y: 0 } }),
    );
    placed(forward.graph.addNode({ type: STEP, nodeId: "alpha", position: { x: 240, y: 0 } }));
    const slot = placed(forward.graph.addNode({ type: STEP, after: first.id })).position;
    expect(slot).toEqual({ x: 380, y: 0 });

    // The same positions stored in the other order, under other ids.
    const backward = builderWith({ mode: "auto" });
    placed(backward.graph.addNode({ type: STEP, nodeId: "alpha", position: { x: 240, y: 0 } }));
    const second = placed(
      backward.graph.addNode({ type: STEP, nodeId: "zulu", position: { x: 0, y: 0 } }),
    );
    expect(placed(backward.graph.addNode({ type: STEP, after: second.id })).position).toEqual(slot);

    // And the same state again, after undoing the anchored add.
    forward.graph.undo();
    expect(placed(forward.graph.addNode({ type: STEP, after: first.id })).position).toEqual(slot);
  });

  const refusedAnchors: readonly { readonly request: unknown; readonly path: readonly string[] }[] = [
    { request: { type: STEP, after: "ghost" }, path: ["after"] },
    { request: { type: STEP, after: "not an id" }, path: ["after"] },
    { request: { type: STEP, after: 42 }, path: ["after"] },
  ];

  it.each(refusedAnchors)("refuses an unusable anchor at $path and creates nothing", ({
    request,
    path,
  }) => {
    const builder = builderWith({ mode: "auto" });
    const anchor = placed(
      builder.graph.addNode({ type: STEP, nodeId: "anchor", position: { x: 0, y: 0 } }),
    );

    const result = builder.graph.addNode(request as { readonly type: string });
    if (result.ok) {
      throw new Error("expected the unusable anchor to be refused");
    }
    expect(result.error[0]?.code).toBe("sdk.invalid-input");
    expect(result.error[0]?.path).toEqual(path);
    expect(builder.graph.nodes().map((node) => node.id)).toEqual([anchor.id]);

    // The refusal is not a history entry: one undo reverts the anchor's own add.
    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodeCount()).toBe(0);
    expect(builder.graph.canUndo()).toBe(false);
  });
});

describe("graph layout: arranging an existing graph", () => {
  function connected(builder: Builder, source: string, target: string): void {
    const result = builder.graph.connect({ source, target });
    if (!result.ok) {
      throw new Error(
        `unexpected connect failure: ${result.error.map((issue) => issue.code).join(", ")}`,
      );
    }
  }

  /** Positions of every node, keyed by instance id, as the host reads them. */
  function positions(
    builder: Builder,
  ): Record<string, { readonly x: number; readonly y: number } | undefined> {
    return Object.fromEntries(builder.graph.nodes().map((node) => [node.id, node.position]));
  }

  it("ranks a node with no edge after the last resolved rank, for both directions", () => {
    // The demo graph that reported the defect: a chain plus nodes the host added
    // without connecting them. The chain is ranked, the isolated nodes follow it
    // in one id-ordered rank, and neither lands at the origin.
    const builder = builderWith({ mode: "auto" });
    placed(builder.graph.addNode({ type: STEP, nodeId: "start" }));
    placed(builder.graph.addNode({ type: STEP, nodeId: "work" }));
    placed(builder.graph.addNode({ type: STEP, nodeId: "zeta" }));
    placed(builder.graph.addNode({ type: STEP, nodeId: "alpha" }));
    connected(builder, "start", "work");

    const horizontal = builder.graph.arrange({
      direction: "horizontal",
      spacing: 40,
      rankSpacing: 100,
    });
    if (!horizontal.ok) {
      throw new Error(
        `unexpected arrange failure: ${horizontal.error.map((issue) => issue.code).join(", ")}`,
      );
    }
    // Rewritten by the alignment rule (old: `start` and `work` at `y: 40`, half
    // of a pitch, because the one-node ranks were centred over the two-node
    // bucket). `work` takes its parent's column `0`, and the isolated bucket,
    // which has no placed parent, keeps its base slots 0 and 80 — one pitch is
    // the default 40-tall box plus the 40 gap.
    expect(positions(builder)).toEqual({
      start: { x: 0, y: 0 },
      work: { x: 100, y: 0 },
      alpha: { x: 200, y: 0 },
      zeta: { x: 200, y: 80 },
    });

    const vertical = builder.graph.arrange({
      direction: "vertical",
      spacing: 40,
      rankSpacing: 100,
    });
    if (!vertical.ok) {
      throw new Error(
        `unexpected arrange failure: ${vertical.error.map((issue) => issue.code).join(", ")}`,
      );
    }
    // Vertically the cross axis reads the box **width**, so the pitch is the
    // default 140-wide box plus the 40 gap: 180. The chain keeps the column `0`
    // and the isolated bucket keeps the slots 0 and 180 (old: the chain at 90,
    // half of the applied pitch, from the centring rule).
    expect(positions(builder)).toEqual({
      start: { x: 0, y: 0 },
      work: { x: 0, y: 100 },
      alpha: { x: 0, y: 200 },
      zeta: { x: 180, y: 200 },
    });
  });
});

describe("graph layout: configuration diagnostics", () => {
  it("refuses an unknown mode", () => {
    const issues = buildFailure({ mode: "dynamic" });
    expect(issues[0]?.code).toBe("sdk.invalid-input");
    expect(issues[0]?.path).toEqual(["graph", "layout", "mode"]);
  });

  it("refuses an unknown direction", () => {
    const issues = buildFailure({ mode: "auto", direction: "diagonal" });
    expect(issues[0]?.code).toBe("sdk.invalid-input");
    expect(issues[0]?.path).toEqual(["graph", "layout", "direction"]);
  });

  it.each([0, -240, Number.NaN, Number.POSITIVE_INFINITY, "240"])(
    "refuses an invalid spacing (%s)",
    (spacing) => {
      const issues = buildFailure({ mode: "auto", spacing });
      expect(issues[0]?.code).toBe("sdk.invalid-input");
      expect(issues[0]?.path).toEqual(["graph", "layout", "spacing"]);
    },
  );

  it("refuses a layout that is not an object", () => {
    const issues = buildFailure("auto");
    expect(issues[0]?.code).toBe("sdk.invalid-input");
    expect(issues[0]?.path).toEqual(["graph", "layout"]);
  });
});
