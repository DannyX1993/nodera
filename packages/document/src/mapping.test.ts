import { createEdgeId, createGraphId, createNodeId, type EdgeId, type NodeId } from "@nodera/contracts";
import { describe, expect, it } from "vitest";
import { Connection, Edge } from "@nodera/graph-model";
import { Graph } from "@nodera/graph-model";
import { Node } from "@nodera/graph-model";
import { documentToGraph } from "./mapping.js";
import { graphToDocument } from "./mapping.js";
import { normalizeGraphDocument } from "./normalize.js";

/** Builds a phase-1 style sample graph with nodes, ports, edges and settings. */
function sampleGraph(): Graph {
  const graph = new Graph(createGraphId("graph-001"), {
    name: "Example graph",
    description: "Example document",
    tags: ["demo"],
  });
  graph.addNode(
    new Node(
      createNodeId("node-001"),
      "example.input",
      [
        { id: "out", direction: "output" },
        { id: "in", direction: "input", declarationId: "in-port" },
      ],
      { value: "Hello world" },
      { x: 100, y: 100 },
      { icon: "arrow" },
      "1.0.0",
    ),
  );
  graph.addNode(new Node(createNodeId("node-002"), "example.output", [{ id: "in", direction: "input" }]));
  graph.addEdge(
    new Edge(
      createEdgeId("edge-001"),
      new Connection(
        { nodeId: createNodeId("node-001"), portId: "out" },
        { nodeId: createNodeId("node-002"), portId: "in", direction: "input" },
      ),
      "example.flow",
      "main flow",
    ),
  );
  return graph;
}

describe("graphToDocument", () => {
  it("produces the GGD shape from a domain graph", () => {
    const document = graphToDocument(sampleGraph());
    expect(document.format).toBe("ggd");
    expect(document.version).toBe("1.0.0");
    expect(document.metadata).toEqual({
      id: "graph-001",
      name: "Example graph",
      description: "Example document",
      tags: ["demo"],
    });
    expect(document.graph.nodes[0]).toEqual({
      id: "node-001",
      type: "example.input",
      version: "1.0.0",
      position: { x: 100, y: 100 },
      properties: { value: "Hello world" },
      metadata: { icon: "arrow" },
      ports: [
        { id: "out", direction: "output" },
        { id: "in", direction: "input", declarationId: "in-port" },
      ],
    });
    expect(document.graph.edges).toEqual([
      {
        id: "edge-001",
        type: "example.flow",
        source: { nodeId: "node-001", portId: "out" },
        target: { nodeId: "node-002", portId: "in", direction: "input" },
        label: "main flow",
      },
    ]);
    expect(document.graph.groups).toEqual([]);
  });

  it("serializes graph settings so structural rules survive a round-trip", () => {
    const id = createGraphId("graph-002");
    const graph = new Graph(id, {}, { selfLoops: "forbid", multiEdges: "forbid", cycles: "forbid" });
    const document = graphToDocument(graph, { formatVersion: "1.1.0" });
    expect(document.version).toBe("1.1.0");
    expect(document.graph.settings).toEqual({
      selfLoops: "forbid",
      multiEdges: "forbid",
      cycles: "forbid",
    });
  });

  it("serializes graph metadata extra fields as document metadata extra", () => {
    const graph = new Graph(createGraphId("graph-003"), {
      extra: { vendor: { custom: 1 } },
    });
    const document = graphToDocument(graph);
    expect(document.metadata.extra).toEqual({ vendor: { custom: 1 } });
  });
});

describe("documentToGraph", () => {
  it("rebuilds an equivalent graph from a normalized document", () => {
    const source = sampleGraph();
    const normalized = normalizeGraphDocument(graphToDocument(source));
    if (!normalized.ok) throw new Error("fixture document must normalize");
    const result = documentToGraph(normalized.value);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a graph");
    const graph = result.value;
    expect(graph.id).toBe("graph-001");
    expect(graph.metadata).toEqual({
      name: "Example graph",
      description: "Example document",
      tags: ["demo"],
    });
    expect(graph.nodeCount).toBe(2);
    const first = graph.getNode("node-001" as NodeId);
    expect(first?.definitionId).toBe("example.input");
    expect(first?.definitionVersion).toBe("1.0.0");
    expect(first?.position).toEqual({ x: 100, y: 100 });
    expect(first?.getProperties()).toEqual({ value: "Hello world" });
    expect(first?.getPorts()).toEqual([
      { id: "out", direction: "output" },
      { id: "in", direction: "input", declarationId: "in-port" },
    ]);
    const edge = graph.getEdge("edge-001" as EdgeId);
    expect(edge?.connection.source).toEqual({ nodeId: "node-001", portId: "out" });
    expect(edge?.connection.target).toEqual({ nodeId: "node-002", portId: "in", direction: "input" });
    expect(edge?.definitionId).toBe("example.flow");
    expect(edge?.label).toBe("main flow");
  });

  it("applies document settings with prefer-allowed defaults", () => {
    const document = graphToDocument(new Graph(createGraphId("graph-004"), {}, { selfLoops: "forbid", multiEdges: "forbid", cycles: "forbid" }));
    const normalized = normalizeGraphDocument(document);
    if (!normalized.ok) throw new Error("fixture document must normalize");
    const result = documentToGraph(normalized.value);
    if (!result.ok) throw new Error("expected a graph");
    expect(result.value.settings).toEqual({
      selfLoops: "forbid",
      multiEdges: "forbid",
      cycles: "forbid",
    });
  });

  it("reports edges referencing unknown nodes or ports instead of throwing", () => {
    const result = documentToGraph({
      format: "ggd",
      version: "1.0.0",
      metadata: { id: "graph-001" },
      extensions: [],
      graph: {
        nodes: [{ id: "a", type: "t" }],
        edges: [
          {
            id: "e1",
            source: { nodeId: "a", portId: "missing-port" },
            target: { nodeId: "ghost", portId: "in" },
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected mapping errors");
    const codes = result.error.map((issue) => issue.code);
    expect(codes).toContain("document.edge-references-unknown-port");
    expect(codes).toContain("document.edge-references-unknown-node");
  });

  it("does not mutate or lose the source document, including unknown fields", () => {
    const document = graphToDocument(sampleGraph());
    const withVendor = {
      ...document,
      vendorField: { preserved: true },
      graph: { ...document.graph, nodes: document.graph.nodes.map((node) => ({ ...node, vendorNodeField: 7 })) },
    } as typeof document & { vendorField: unknown };
    const snapshot = JSON.parse(JSON.stringify(withVendor)) as typeof withVendor;
    const normalized = normalizeGraphDocument(withVendor);
    if (!normalized.ok) throw new Error("fixture document must normalize");
    const result = documentToGraph(normalized.value);
    expect(result.ok).toBe(true);
    expect(withVendor).toEqual(snapshot);
    expect((normalized.value as unknown as Record<string, unknown>)["vendorField"]).toEqual({
      preserved: true,
    });
    expect((normalized.value.graph.nodes[0] as unknown as Record<string, unknown>)["vendorNodeField"]).toBe(7);
  });
});
