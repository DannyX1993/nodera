/**
 * Automatic placement of the nodes a host left unpositioned.
 *
 * Every assertion here goes through the public builder surface: the host
 * configures `graph.layout`, adds instances and reads back the position of the
 * instance views. Nothing reads internal storage, and nothing places a node the
 * host already positioned.
 */

import { describe, expect, it } from "vitest";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";
import type { BuilderConfiguration, BuilderGraphConfiguration } from "../builder/configuration.js";
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
});

describe("graph layout: automatic placement", () => {
  it("places the first node of an empty graph at the grid anchor", () => {
    expect(added(builderWith({ mode: "auto" })).position).toEqual({ x: 0, y: 0 });
  });

  it("grows horizontally by the default spacing", () => {
    const builder = builderWith({ mode: "auto" });
    expect(added(builder).position).toEqual({ x: 0, y: 0 });
    expect(added(builder).position).toEqual({ x: 240, y: 0 });
  });

  it("grows horizontally by the configured spacing", () => {
    const builder = builderWith({ mode: "auto", spacing: 100 });
    expect(added(builder).position).toEqual({ x: 0, y: 0 });
    expect(added(builder).position).toEqual({ x: 100, y: 0 });
  });

  it("grows vertically when the host asks for vertical placement", () => {
    const builder = builderWith({ mode: "auto", direction: "vertical" });
    expect(added(builder).position).toEqual({ x: 0, y: 0 });
    expect(added(builder).position).toEqual({ x: 0, y: 240 });
  });

  it("skips a slot the host already occupies", () => {
    const builder = builderWith({ mode: "auto" });
    expect(added(builder, { x: 0, y: 0 }).position).toEqual({ x: 0, y: 0 });
    expect(added(builder).position).toEqual({ x: 240, y: 0 });
  });

  it("assigns the same slot whatever order the occupied nodes were added in", () => {
    const forward = builderWith({ mode: "auto" });
    added(forward, { x: 240, y: 0 });
    added(forward, { x: 480, y: 0 });
    expect(added(forward).position).toEqual({ x: 0, y: 0 });

    const backward = builderWith({ mode: "auto" });
    added(backward, { x: 480, y: 0 });
    added(backward, { x: 240, y: 0 });
    expect(added(backward).position).toEqual({ x: 0, y: 0 });
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
    expect(second.position).toEqual({ x: 240, y: 0 });

    expect(builder.graph.undo()).toBe(true);
    expect(builder.graph.nodes()).toHaveLength(1);
    expect(builder.graph.nodes()[0]?.position).toEqual({ x: 0, y: 0 });

    expect(builder.graph.redo()).toBe(true);
    expect(builder.graph.nodes().find((restored) => restored.id === second.id)?.position).toEqual({
      x: 240,
      y: 0,
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
