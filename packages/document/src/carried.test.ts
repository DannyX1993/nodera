import { describe, expect, it } from "vitest";
import { createGraphId, createNodeId } from "@nodera/contracts";
import { Graph, Node } from "@nodera/graph-model";
import { documentToGraph } from "./mapping.js";
import { extractCarriedDocumentData, graphToDocument } from "./mapping.js";
import { normalizeGraphDocument } from "./normalize.js";
import { GGD_FORMAT } from "./types.js";

/** Builds a normalized document carrying data the domain cannot represent. */
function fullDocument(): Record<string, unknown> {
  const normalized = normalizeGraphDocument({
    format: GGD_FORMAT,
    version: "1.1.0",
    metadata: { id: "graph-001", name: "Carried" },
    extensions: [
      { id: "example.nodes", version: "1.0.0" },
      { id: "acme.future", version: "2.0.0" },
    ],
    graph: {
      nodes: [{ id: "n1", type: "t" }],
      edges: [],
      groups: [{ id: "g1", members: ["n1"] }],
    },
  });
  if (!normalized.ok) throw new Error("fixture must be valid");
  return normalized.value as unknown as Record<string, unknown>;
}

describe("extractCarriedDocumentData", () => {
  it("captures extension references, groups and format version verbatim", () => {
    const carried = extractCarriedDocumentData(fullDocument() as never);
    expect(carried.formatVersion).toBe("1.1.0");
    expect(carried.extensions).toEqual([
      { id: "example.nodes", version: "1.0.0" },
      { id: "acme.future", version: "2.0.0" },
    ]);
    expect(carried.groups).toEqual([{ id: "g1", members: ["n1"] }]);
  });
});

describe("graphToDocument with carried data", () => {
  it("re-emits carried extensions, groups and format version", () => {
    const graph = new Graph(createGraphId("graph-001"));
    graph.addNode(new Node(createNodeId("n1"), "t", []));
    const document = graphToDocument(graph, { carried: extractCarriedDocumentData(fullDocument() as never) });
    expect(document.version).toBe("1.1.0");
    expect(document.extensions).toEqual([
      { id: "example.nodes", version: "1.0.0" },
      { id: "acme.future", version: "2.0.0" },
    ]);
    expect(document.graph.groups).toEqual([{ id: "g1", members: ["n1"] }]);
  });

  it("lets an explicit formatVersion win over the carried one", () => {
    const graph = new Graph(createGraphId("graph-001"));
    const document = graphToDocument(graph, {
      carried: extractCarriedDocumentData(fullDocument() as never),
      formatVersion: "2.0.0",
    });
    expect(document.version).toBe("2.0.0");
  });

  it("reconstructs a document equivalent to the one it came from", () => {
    const source = fullDocument() as never;
    const carried = extractCarriedDocumentData(source);
    const importResult = documentToGraph(source);
    if (!importResult.ok) throw new Error("expected a graph");
    const rebuilt = graphToDocument(importResult.value, { carried });
    // Export always emits the canonical form (properties/ports keys present),
    // so equality is by document meaning: carried fields verbatim, graph
    // data exactly as import produced it.
    expect(rebuilt.version).toBe("1.1.0");
    expect(rebuilt.extensions).toEqual([
      { id: "example.nodes", version: "1.0.0" },
      { id: "acme.future", version: "2.0.0" },
    ]);
    expect(rebuilt.graph.groups).toEqual([{ id: "g1", members: ["n1"] }]);
    expect(rebuilt.graph.nodes.map((node) => ({ id: node.id, type: node.type }))).toEqual([
      { id: "n1", type: "t" },
    ]);
  });
});
