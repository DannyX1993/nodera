import { describe, expect, it } from "vitest";
import { SUPPORTED_FEATURES, resolveFeatures } from "./features.js";
import { createBuilder, type Builder } from "./builder.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";

describe("resolveFeatures", () => {
  it("enables every supported feature when the host declares none", () => {
    const result = resolveFeatures();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(SUPPORTED_FEATURES).toEqual(["minimap", "history", "validation", "edgeInsertion", "edgeWaypointEditing"]);
    expect(result.value).toEqual({
      minimap: true,
      history: true,
      validation: true,
      edgeInsertion: false,
      edgeWaypointEditing: false,
    });
  });

  it("keeps edge insertion off unless the host enables it", () => {
    const result = resolveFeatures();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.edgeInsertion).toBe(false);
  });

  it("enables edge insertion when the host declares it", () => {
    const result = resolveFeatures({ edgeInsertion: true });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.edgeInsertion).toBe(true);
    expect(result.value.minimap).toBe(true);
  });

  it("refuses an edge insertion flag that is not a boolean", () => {
    const result = resolveFeatures({ edgeInsertion: "yes" } as never);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toHaveLength(1);
    expect(result.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      severity: "error",
      path: ["features", "edgeInsertion"],
    });
  });

  it("keeps the flags the host declares for supported features", () => {
    const result = resolveFeatures({ minimap: false, validation: false });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      minimap: false,
      history: true,
      validation: false,
      edgeInsertion: false,
      edgeWaypointEditing: false,
    });
  });

  it("rejects an enabled feature the SDK does not implement", () => {
    const result = resolveFeatures({ grouping: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toHaveLength(1);
    expect(result.error[0]).toMatchObject({
      code: "sdk.feature-unsupported",
      severity: "error",
      path: ["features", "grouping"],
    });
  });

  it("accepts a disabled feature the SDK does not implement", () => {
    const result = resolveFeatures({ grouping: false });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      minimap: true,
      history: true,
      validation: true,
      edgeInsertion: false,
      edgeWaypointEditing: false,
    });
    expect(Object.keys(result.value).sort()).toEqual([...SUPPORTED_FEATURES].sort());
  });

  it("reports every unsupported enabled feature at once", () => {
    const result = resolveFeatures({ grouping: true, execution: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.map((issue) => issue.path)).toEqual([
      ["features", "grouping"],
      ["features", "execution"],
    ]);
  });
});

/* ------------------------------------------------------------------ */
/*  builder.features.edgeInsertion (S6)                                */
/* ------------------------------------------------------------------ */

function nodeInput(type: string): NodeDefinitionInput {
  return {
    type,
    version: "1.0.0",
    label: type,
    category: "test",
    ports: {
      inputs: [{ id: "in", dataType: "any" }],
      outputs: [{ id: "out", dataType: "any" }],
    },
  };
}

/** Builder with two registered definitions and one edge between them. */
function createGraphBuilder(edgeInsertion: boolean): Builder {
  const result = createBuilder({
    features: { edgeInsertion },
    registry: { nodes: [nodeInput("test.source"), nodeInput("test.sink")] },
    graph: { graphId: "graph-features-test" },
  });
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  const builder = result.value;
  for (const nodeId of ["a", "b"] as const) {
    const added = builder.graph.addNode({ type: "test.source", nodeId });
    if (!added.ok) {
      throw new Error(`unexpected node failure: ${added.error[0]?.code ?? "unknown"}`);
    }
  }
  const connected = builder.graph.connect({ source: "a", target: "b" });
  if (!connected.ok) {
    throw new Error(`unexpected edge failure: ${connected.error[0]?.code ?? "unknown"}`);
  }
  return builder;
}

function exportedDocument(builder: Builder): string {
  const exported = builder.document.export("json");
  if (!exported.ok) {
    throw new Error(`unexpected export failure: ${exported.error[0]?.code ?? "unknown"}`);
  }
  return exported.value;
}

describe("builder.features.edgeInsertion", () => {
  it("is observable on the builder and off by default", () => {
    expect(createGraphBuilder(true).features.edgeInsertion).toBe(true);
    expect(createGraphBuilder(false).features.edgeInsertion).toBe(false);
  });

  it("keeps the pending edge insertion in the UI state only", () => {
    const builder = createGraphBuilder(true);
    const edgeId = String(builder.graph.edges()[0]?.id);
    const documentBefore = exportedDocument(builder);

    builder.store.setPendingEdgeInsertId(edgeId);

    expect(builder.store.getState().pendingEdgeInsertId).toBe(edgeId);
    // The presentation state never reaches the document or the graph reads.
    expect(exportedDocument(builder)).toBe(documentBefore);
    expect(builder.graph.nodes()).toHaveLength(2);
    expect(builder.graph.edges()).toHaveLength(1);
    expect(builder.graph.edgeCount()).toBe(1);
  });
});

describe("builder.features.setEdgeInsertion", () => {
  it("toggles the affordance at runtime and keeps the UI state in sync", () => {
    const builder = createGraphBuilder(false);

    const enabled = builder.features.setEdgeInsertion(true);

    expect(enabled).toEqual({ ok: true, value: true });
    expect(builder.features.edgeInsertion).toBe(true);
    expect(builder.store.getState().edgeInsertion).toBe(true);

    const disabled = builder.features.setEdgeInsertion(false);

    expect(disabled).toEqual({ ok: true, value: false });
    expect(builder.features.edgeInsertion).toBe(false);
    expect(builder.store.getState().edgeInsertion).toBe(false);
  });

  it("refuses a non-boolean with sdk.invalid-input and leaves the state untouched", () => {
    const builder = createGraphBuilder(false);

    const refused = builder.features.setEdgeInsertion("yes" as unknown as boolean);

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      path: ["features", "edgeInsertion"],
    });
    expect(builder.features.edgeInsertion).toBe(false);
    expect(builder.store.getState().edgeInsertion).toBe(false);
  });

  it("refuses on a disposed builder and keeps the state it had", () => {
    const builder = createGraphBuilder(true);
    builder.dispose();

    const refused = builder.features.setEdgeInsertion(false);

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error[0]?.code).toBe("sdk.disposed");
    expect(builder.features.edgeInsertion).toBe(true);
    expect(builder.store.getState().edgeInsertion).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  builder.features.edgeWaypointEditing (S8)                          */
/* ------------------------------------------------------------------ */

describe("builder.features.edgeWaypointEditing", () => {
  it("is observable on the builder and off by default", () => {
    const builder = createGraphBuilder(false);

    expect(builder.features.edgeWaypointEditing).toBe(false);
  });

  it("reflects the store value reactively", () => {
    const builder = createGraphBuilder(false);

    expect(builder.features.edgeWaypointEditing).toBe(false);
    builder.store.setEdgeWaypointEditing(true);
    expect(builder.features.edgeWaypointEditing).toBe(true);
    builder.store.setEdgeWaypointEditing(false);
    expect(builder.features.edgeWaypointEditing).toBe(false);
  });
});

describe("builder.features.setEdgeWaypointEditing", () => {
  /** Builder whose layout registry has layered as default. */
  function layeredBuilder(edgeWaypointEditing: boolean): Builder {
    const result = createBuilder({
      features: { edgeWaypointEditing },
      graph: {
        layout: { strategy: "nodera.graph-layout.layered" },
        graphId: "graph-waypoint-test",
      },
      registry: { nodes: [nodeInput("test.source"), nodeInput("test.sink")] },
    });
    if (!result.ok) {
      throw new Error(
        `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
      );
    }
    return result.value;
  }

  /** Builder whose layout registry has free as default. */
  function freeBuilder(edgeWaypointEditing: boolean): Builder {
    const result = createBuilder({
      features: { edgeWaypointEditing },
      graph: {
        layout: { strategy: "nodera.graph-layout.free" },
        graphId: "graph-waypoint-test",
      },
      registry: { nodes: [nodeInput("test.source"), nodeInput("test.sink")] },
    });
    if (!result.ok) {
      throw new Error(
        `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
      );
    }
    return result.value;
  }

  it("succeeds in free layout with editable connections", () => {
    const builder = freeBuilder(false);

    const enabled = builder.features.setEdgeWaypointEditing(true);

    expect(enabled).toEqual({ ok: true, value: true });
    expect(builder.features.edgeWaypointEditing).toBe(true);
    expect(builder.store.getState().edgeWaypointEditing).toBe(true);
  });

  it("refuses when the active strategy is layered", () => {
    const builder = layeredBuilder(false);

    const refused = builder.features.setEdgeWaypointEditing(true);

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toHaveLength(2);
    expect(refused.error[0]).toMatchObject({
      code: "sdk.feature-unavailable",
    });
    expect(refused.error[1]).toMatchObject({
      code: "sdk.invalid-input",
    });
    expect(builder.features.edgeWaypointEditing).toBe(false);
    expect(builder.store.getState().edgeWaypointEditing).toBe(false);
  });

  it("refuses when connections are fixed", () => {
    const builder = freeBuilder(false);
    builder.graphLayout.setConnectionsPolicy("fixed");

    const refused = builder.features.setEdgeWaypointEditing(true);

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toHaveLength(2);
    expect(refused.error[0]).toMatchObject({
      code: "sdk.feature-unavailable",
    });
    expect(builder.features.edgeWaypointEditing).toBe(false);
    expect(builder.store.getState().edgeWaypointEditing).toBe(false);
  });

  it("always succeeds when disabling (even in layered)", () => {
    const builder = layeredBuilder(true);

    const disabled = builder.features.setEdgeWaypointEditing(false);

    expect(disabled).toEqual({ ok: true, value: false });
    expect(builder.features.edgeWaypointEditing).toBe(false);
    expect(builder.store.getState().edgeWaypointEditing).toBe(false);
  });

  it("refuses on a disposed builder and keeps the state it had", () => {
    const builder = freeBuilder(false);
    builder.dispose();

    const refused = builder.features.setEdgeWaypointEditing(true);

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error[0]?.code).toBe("sdk.disposed");
    expect(builder.features.edgeWaypointEditing).toBe(false);
    expect(builder.store.getState().edgeWaypointEditing).toBe(false);
  });

  it("refuses a non-boolean with sdk.invalid-input and leaves the state untouched", () => {
    const builder = freeBuilder(false);

    const refused = builder.features.setEdgeWaypointEditing("yes" as unknown as boolean);

    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toMatchObject([
      expect.objectContaining({
        code: "sdk.invalid-input",
        path: ["features", "edgeWaypointEditing"],
      }),
    ]);
    expect(builder.features.edgeWaypointEditing).toBe(false);
    expect(builder.store.getState().edgeWaypointEditing).toBe(false);
  });
});
