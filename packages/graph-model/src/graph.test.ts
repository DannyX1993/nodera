import { describe, expect, it } from "vitest";
import {
  createEdgeId,
  createGraphId,
  createNodeId,
} from "@nodera/contracts";
import { Connection, Edge, type ConnectionEndpoint } from "./edge.js";
import { Node } from "./node.js";
import type { PortInstance } from "./port.js";
import { Graph } from "./graph.js";
import { DEFAULT_GRAPH_SETTINGS } from "./graph-settings.js";

const inPort = (id: string): PortInstance => ({ id, direction: "input" });
const outPort = (id: string): PortInstance => ({ id, direction: "output" });

function makeNode(
  id: string,
  ports: readonly PortInstance[],
): Node {
  return new Node(createNodeId(id), "test.node", ports);
}

function makeEdge(
  id: string,
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
): Edge {
  return new Edge(createEdgeId(id), new Connection(source, target));
}

const endpoint = (nodeId: string, portId: string): ConnectionEndpoint => ({
  nodeId: createNodeId(nodeId),
  portId,
});

describe("Node", () => {
  it("rejects duplicate port ids", () => {
    expect(
      () =>
        new Node(createNodeId("n1"), "test.node", [
          inPort("in"),
          inPort("in"),
        ]),
    ).toThrowError(RangeError);
  });

  it("manages property values without aliasing the input record", () => {
    const initial = { a: 1 };
    const node = makeNode("n1", []);
    const withInitial = new Node(
      createNodeId("n1"),
      "test.node",
      [],
      initial,
    );
    withInitial.setProperty("b", 2);
    expect(withInitial.getProperties()).toEqual({ a: 1, b: 2 });
    expect(initial).toEqual({ a: 1 });
    expect(withInitial.removeProperty("a")).toBe(true);
    expect(withInitial.removeProperty("missing")).toBe(false);
    expect(withInitial.getProperties()).toEqual({ b: 2 });
    expect(node.getProperties()).toEqual({});
  });
});

describe("Connection", () => {
  it("is equal by value and rejects a port connected to itself", () => {
    const a = new Connection(endpoint("n1", "out"), endpoint("n2", "in"));
    const b = new Connection(endpoint("n1", "out"), endpoint("n2", "in"));
    expect(a.equals(b)).toBe(true);
    expect(
      () => new Connection(endpoint("n1", "out"), endpoint("n1", "out")),
    ).toThrowError(RangeError);
  });
});

describe("Graph integrity", () => {
  it("adds nodes and edges, keeping insertion order and counts", () => {
    const graph = new Graph(createGraphId("g1"));
    graph.addNode(makeNode("n1", [outPort("out"), inPort("in")]));
    graph.addNode(makeNode("n2", [inPort("in")]));
    const added = graph.addEdge(
      makeEdge("e1", endpoint("n1", "out"), endpoint("n2", "in")),
    );
    expect(added.ok).toBe(true);
    expect(graph.nodeCount).toBe(2);
    expect(graph.edgeCount).toBe(1);
    expect(graph.getNodes().map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  it("rejects duplicate node ids and duplicate edge ids", () => {
    const graph = new Graph(createGraphId("g1"));
    graph.addNode(makeNode("n1", [outPort("out")]));
    const duplicate = graph.addNode(makeNode("n1", []));
    expect(duplicate).toMatchObject({
      ok: false,
      error: { kind: "duplicate-node-id", elementId: "n1" },
    });
    graph.addNode(makeNode("n2", [inPort("in"), outPort("out")]));
    graph.addEdge(makeEdge("e1", endpoint("n1", "out"), endpoint("n2", "in")));
    expect(
      graph.addEdge(makeEdge("e1", endpoint("n2", "out"), endpoint("n2", "in"))),
    ).toMatchObject({ ok: false, error: { kind: "duplicate-edge-id" } });
  });

  it("rejects edges referencing unknown nodes or ports", () => {
    const graph = new Graph(createGraphId("g1"));
    graph.addNode(makeNode("n1", [outPort("out")]));
    graph.addNode(makeNode("n2", [inPort("in")]));
    expect(
      graph.addEdge(makeEdge("e1", endpoint("ghost", "out"), endpoint("n2", "in"))),
    ).toMatchObject({ ok: false, error: { kind: "node-not-found" } });
    expect(
      graph.addEdge(makeEdge("e1", endpoint("n1", "nope"), endpoint("n2", "in"))),
    ).toMatchObject({ ok: false, error: { kind: "node-not-found" } });
    expect(
      graph.addEdge(makeEdge("e1", endpoint("n1", "out"), endpoint("n2", "nope"))),
    ).toMatchObject({ ok: false, error: { kind: "node-not-found" } });
    expect(graph.edgeCount).toBe(0);
  });

  it("removes a node together with its attached edges", () => {
    const graph = new Graph(createGraphId("g1"));
    graph.addNode(makeNode("n1", [outPort("out")]));
    graph.addNode(makeNode("n2", [inPort("in")]));
    graph.addNode(makeNode("n3", [outPort("out")]));
    graph.addEdge(makeEdge("e1", endpoint("n1", "out"), endpoint("n2", "in")));
    graph.addEdge(makeEdge("e2", endpoint("n3", "out"), endpoint("n2", "in")));
    const removed = graph.removeNode(createNodeId("n2"));
    expect(removed).toMatchObject({ ok: true, value: { edges: [{ id: "e1" }, { id: "e2" }] } });
    expect(graph.nodeCount).toBe(2);
    expect(graph.edgeCount).toBe(0);
    expect(graph.removeNode(createNodeId("n2"))).toMatchObject({
      ok: false,
      error: { kind: "node-not-found" },
    });
  });

  it("removes edges and reports unknown ones", () => {
    const graph = new Graph(createGraphId("g1"));
    graph.addNode(makeNode("n1", [outPort("out")]));
    graph.addNode(makeNode("n2", [inPort("in")]));
    graph.addEdge(makeEdge("e1", endpoint("n1", "out"), endpoint("n2", "in")));
    expect(graph.removeEdge(createEdgeId("e1")).ok).toBe(true);
    expect(graph.removeEdge(createEdgeId("e1"))).toMatchObject({
      ok: false,
      error: { kind: "edge-not-found" },
    });
  });

  it("answers edge queries by node and direction", () => {
    const graph = new Graph(createGraphId("g1"));
    graph.addNode(makeNode("a", [outPort("out")]));
    graph.addNode(makeNode("b", [inPort("in"), outPort("out")]));
    graph.addNode(makeNode("c", [inPort("in")]));
    graph.addEdge(makeEdge("e1", endpoint("a", "out"), endpoint("b", "in")));
    graph.addEdge(makeEdge("e2", endpoint("b", "out"), endpoint("c", "in")));
    expect(graph.getEdgesOf(createNodeId("b")).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(graph.getEdgesFrom(createNodeId("a")).map((e) => e.id)).toEqual(["e1"]);
    expect(graph.getEdgesTo(createNodeId("b")).map((e) => e.id)).toEqual(["e1"]);
  });
});

describe("Graph settings", () => {
  it("defaults allow self-loops, multi-edges and cycles", () => {
    expect(DEFAULT_GRAPH_SETTINGS).toEqual({
      selfLoops: "allow",
      multiEdges: "allow",
      cycles: "allow",
    });
  });

  it("forbids self-loops when configured", () => {
    const graph = new Graph(createGraphId("g1"), {}, {
      ...DEFAULT_GRAPH_SETTINGS,
      selfLoops: "forbid",
    });
    graph.addNode(makeNode("n1", [inPort("in"), outPort("out")]));
    expect(
      graph.addEdge(makeEdge("e1", endpoint("n1", "out"), endpoint("n1", "in"))),
    ).toMatchObject({ ok: false, error: { kind: "self-loop-forbidden" } });
  });

  it("forbids multi-edges between the same ordered endpoints when configured", () => {
    const graph = new Graph(createGraphId("g1"), {}, {
      ...DEFAULT_GRAPH_SETTINGS,
      multiEdges: "forbid",
    });
    graph.addNode(makeNode("n1", [outPort("out")]));
    graph.addNode(makeNode("n2", [inPort("in")]));
    graph.addEdge(makeEdge("e1", endpoint("n1", "out"), endpoint("n2", "in")));
    expect(
      graph.addEdge(makeEdge("e2", endpoint("n1", "out"), endpoint("n2", "in"))),
    ).toMatchObject({ ok: false, error: { kind: "multi-edge-forbidden" } });
    // A different port pair is still a distinct connection.
    graph.addNode(makeNode("n3", [inPort("in")]));
    expect(
      graph.addEdge(makeEdge("e3", endpoint("n1", "out"), endpoint("n3", "in"))).ok,
    ).toBe(true);
  });

  it("forbids directed cycles when configured", () => {
    const graph = new Graph(createGraphId("g1"), {}, {
      ...DEFAULT_GRAPH_SETTINGS,
      cycles: "forbid",
    });
    graph.addNode(makeNode("a", [outPort("out"), inPort("in")]));
    graph.addNode(makeNode("b", [inPort("in"), outPort("out")]));
    graph.addNode(makeNode("c", [inPort("in"), outPort("out")]));
    graph.addEdge(makeEdge("e1", endpoint("a", "out"), endpoint("b", "in")));
    graph.addEdge(makeEdge("e2", endpoint("b", "out"), endpoint("c", "in")));
    expect(
      graph.addEdge(makeEdge("e3", endpoint("c", "out"), endpoint("a", "in"))),
    ).toMatchObject({ ok: false, error: { kind: "cycle-forbidden" } });
  });
});
