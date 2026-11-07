import { describe, expect, it } from "vitest";
import { createEdgeId, createGraphId, createNodeId } from "@nodera/contracts";
import { Connection, Edge } from "./edge.js";
import { Graph } from "./graph.js";
import { Node } from "./node.js";

function makeNode(id: string): Node {
  return new Node(createNodeId(id), "example.node", [
    { id: "in", direction: "input", declarationId: "in" },
    { id: "out", direction: "output", declarationId: "out" },
  ]);
}

function makeEdge(id: string, sourceId: string, targetId: string): Edge {
  return new Edge(
    createEdgeId(id),
    new Connection(
      { nodeId: createNodeId(sourceId), portId: "out" },
      { nodeId: createNodeId(targetId), portId: "in" },
    ),
  );
}

function makeGraph(): Graph {
  const graph = new Graph(createGraphId("graph-1"));
  graph.addNode(makeNode("a"));
  graph.addNode(makeNode("b"));
  graph.addNode(makeNode("c"));
  graph.addEdge(makeEdge("e1", "a", "b"));
  graph.addEdge(makeEdge("e2", "b", "c"));
  return graph;
}

describe("Node mutation primitives", () => {
  it("setPosition replaces the node position", () => {
    const node = makeNode("a");
    expect(node.position).toBeUndefined();

    node.setPosition({ x: 10, y: 20 });
    expect(node.position).toEqual({ x: 10, y: 20 });

    node.setPosition({ x: 30, y: 40 });
    expect(node.position).toEqual({ x: 30, y: 40 });
  });

  it("setPosition can clear the position", () => {
    const node = makeNode("a");
    node.setPosition({ x: 1, y: 2 });
    node.setPosition(undefined);
    expect(node.position).toBeUndefined();
  });

  it("setMetadata replaces the metadata record immutably", () => {
    const node = makeNode("a");
    const original = node.metadata;

    node.setMetadata({ group: "io" });
    expect(node.metadata).toEqual({ group: "io" });
    expect(original).toBeUndefined();

    node.setMetadata(undefined);
    expect(node.metadata).toBeUndefined();
  });
});

describe("Edge mutation primitives", () => {
  it("setLabel replaces the edge label", () => {
    const graph = makeGraph();
    const edge = graph.getEdge(createEdgeId("e1"))!;

    edge.setLabel("flow");
    expect(edge.label).toBe("flow");

    edge.setLabel(undefined);
    expect(edge.label).toBeUndefined();
  });

  it("setMetadata replaces the edge metadata record", () => {
    const graph = makeGraph();
    const edge = graph.getEdge(createEdgeId("e1"))!;

    edge.setMetadata({ weight: 2 });
    expect(edge.metadata).toEqual({ weight: 2 });
  });
});

describe("Graph mutation primitives", () => {
  it("clear removes every node and edge and returns them for restoration", () => {
    const graph = makeGraph();

    const removed = graph.clear();

    expect(graph.nodeCount).toBe(0);
    expect(graph.edgeCount).toBe(0);
    expect(removed.nodes.map((n) => n.id)).toHaveLength(3);
    expect(removed.edges.map((e) => e.id)).toHaveLength(2);
  });

  it("clear on an empty graph returns empty collections", () => {
    const graph = new Graph(createGraphId("graph-1"));
    const removed = graph.clear();
    expect(removed.nodes).toEqual([]);
    expect(removed.edges).toEqual([]);
  });

  it("a cleared graph accepts restored nodes and edges again", () => {
    const graph = makeGraph();
    const removed = graph.clear();

    for (const node of removed.nodes) {
      expect(graph.addNode(node).ok).toBe(true);
    }
    for (const edge of removed.edges) {
      expect(graph.addEdge(edge).ok).toBe(true);
    }
    expect(graph.nodeCount).toBe(3);
    expect(graph.edgeCount).toBe(2);
  });

  it("setMetadata replaces the graph metadata", () => {
    const graph = new Graph(createGraphId("graph-1"), { name: "Old" });

    graph.setMetadata({ name: "New", description: "desc" });

    expect(graph.metadata).toEqual({ name: "New", description: "desc" });
  });
});
