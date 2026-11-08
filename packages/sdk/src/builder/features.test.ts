import { describe, expect, it } from "vitest";
import { SUPPORTED_FEATURES, resolveFeatures } from "./features.js";
import { createBuilder, type Builder } from "./builder.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";

describe("resolveFeatures", () => {
  it("enables every supported feature when the host declares none", () => {
    const result = resolveFeatures();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(SUPPORTED_FEATURES).toEqual(["minimap", "history", "validation", "edgeInsertion"]);
    expect(result.value).toEqual({
      minimap: true,
      history: true,
      validation: true,
      edgeInsertion: false,
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
