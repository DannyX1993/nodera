import type {
  EdgeChange,
  NodeChange,
} from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { Connection, Edge, Graph, Node } from "@nodera/graph-model";
import { createEdgeId, createGraphId, createNodeId } from "@nodera/contracts";
import type { NodeDefinition, NodeVisual } from "@nodera/node-registry";
import type { PortDeclaration, PortDirection, PortInstance } from "@nodera/graph-model";

import type { EdgeDefinition } from "@nodera/edge-registry";

import {
  connectionFromReactFlow,
  nodePositionFromReactFlow,
  removedIdsFromReactFlowChanges,
  toReactFlowEdges,
  toReactFlowNodes,
} from "./react-flow-mapper.js";

// --- Test helpers ---

function buildPortInstance(
  id: string,
  direction: PortDirection,
  declaration?: PortDeclaration,
): PortInstance {
  return {
    id,
    direction,
    ...(declaration !== undefined ? { declarationId: declaration.id } : {}),
  };
}

function buildNode(
  id: string,
  definitionId: string,
  ports: PortInstance[],
  properties: Record<string, unknown> = {},
  position?: { x: number; y: number },
  metadata?: Record<string, unknown>,
): Node {
  return new Node(
    createNodeId(id),
    definitionId,
    ports,
    properties,
    position,
    metadata,
  );
}

function buildGraph(
  nodes: Node[],
  edges: Edge[],
): Graph {
  const graph = new Graph(createGraphId("graph-1"));
  for (const node of nodes) {
    graph.addNode(node);
  }
  for (const edge of edges) {
    graph.addEdge(edge);
  }
  return graph;
}

function mockNodeDefinition(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    id: "test-node",
    name: "Test Node",
    category: "test",
    version: "1.0.0",
    ports: [],
    properties: [],
    ...overrides,
  };
}

function mockEdgeDefinition(overrides: Partial<EdgeDefinition> = {}): EdgeDefinition {
  return {
    id: "test-edge",
    name: "Test Edge",
    version: "1.0.0",
    ...overrides,
  };
}

function makeEdge(
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
  definitionId?: string,
): Edge {
  return new Edge(
    createEdgeId(id),
    new Connection(
      { nodeId: createNodeId(sourceNodeId), portId: sourcePortId },
      { nodeId: createNodeId(targetNodeId), portId: targetPortId },
    ),
    definitionId,
  );
}

// --- Tests ---

describe("toReactFlowNodes", () => {
  it("maps nodes with full definitions and mixed port directions", () => {
    const inputPortDecl: PortDeclaration = {
      id: "in",
      name: "Input",
      direction: "input",
      dataType: "string",
    };
    const outputPortDecl: PortDeclaration = {
      id: "out",
      name: "Output",
      direction: "output",
      dataType: "number",
    };
    const bidirPortDecl: PortDeclaration = {
      id: "both",
      name: "Bidirectional",
      direction: "bidirectional",
      dataType: "any",
    };

    const node1 = buildNode(
      "node-1",
      "node-registry-1",
      [
        buildPortInstance("in", "input", inputPortDecl),
        buildPortInstance("out", "output", outputPortDecl),
      ],
      { foo: "bar" },
      { x: 100, y: 200 },
    );

    const node2 = buildNode(
      "node-2",
      "node-registry-2",
      [buildPortInstance("both", "bidirectional", bidirPortDecl)],
      {},
      { x: 50, y: 50 },
    );

    const graph = buildGraph([node1, node2], []);

    const resolveNodeDefinition = (definitionId: string): NodeDefinition | undefined => {
      if (definitionId === "node-registry-1") {
        return mockNodeDefinition({
          renderer: "http-node",
          ports: [inputPortDecl, outputPortDecl],
        });
      }
      if (definitionId === "node-registry-2") {
        return mockNodeDefinition({
          renderer: "io-node",
          ports: [bidirPortDecl],
        });
      }
      return undefined;
    };

    const result = toReactFlowNodes(graph, resolveNodeDefinition);

    expect(result).toHaveLength(2);

    // node-1: has input + output ports → target + source handles
    const rfNode1 = result.find((n: { id: string }) => n.id === "node-1");
    expect(rfNode1).toBeDefined();
  });

  it("defaults position to {x:0, y:0} when node has no position", () => {
    const node = buildNode("node-no-pos", "node-def", []);
    const graph = buildGraph([node], []);

    const result = toReactFlowNodes(graph, () => undefined);

    const rfNode = result[0];
    expect(rfNode!.position).toEqual({ x: 0, y: 0 });
  });

  it("uses default renderer id when definition is undefined", () => {
    const node = buildNode("node-def", "some-node", []);
    const graph = buildGraph([node], []);

    const result = toReactFlowNodes(graph, () => undefined);

    expect(result[0]!.type).toBe("nodera-default-node");
  });

  it("uses definition.renderer when available", () => {
    const node = buildNode("node-with-renderer", "node-def", []);
    const graph = buildGraph([node], []);

    const result = toReactFlowNodes(graph, () =>
      mockNodeDefinition({ renderer: "my-custom-node" }),
    );

    expect(result[0]!.type).toBe("my-custom-node");
  });

  it("maps input port to target handle", () => {
    const inputDecl: PortDeclaration = {
      id: "in",
      name: "Input",
      direction: "input",
    };
    const node = buildNode("node-1", "node-def", [
      buildPortInstance("in", "input", inputDecl),
    ]);
    const graph = buildGraph([node], []);

    const result = toReactFlowNodes(graph, () =>
      mockNodeDefinition({ ports: [inputDecl] }),
    );

    const rfNode = result[0];
    // Handles are rendered by PortHandle in the node-type wrapper; the
    // mapper's contract is the merged port data the wrapper reads.
    const port = (rfNode!.data as { ports: Array<{ id: string; direction: string }> }).ports.find(
      (p) => p.id === "in",
    );
    expect(port).toBeDefined();
    expect(port?.direction).toBe("input");
  });

  it("maps output port to source handle", () => {
    const outputDecl: PortDeclaration = {
      id: "out",
      name: "Output",
      direction: "output",
    };
    const node = buildNode("node-1", "node-def", [
      buildPortInstance("out", "output", outputDecl),
    ]);
    const graph = buildGraph([node], []);

    const result = toReactFlowNodes(graph, () =>
      mockNodeDefinition({ ports: [outputDecl] }),
    );

    const rfNode = result[0];
    const port = (rfNode!.data as { ports: Array<{ id: string; direction: string }> }).ports.find(
      (p) => p.id === "out",
    );
    expect(port).toBeDefined();
    expect(port?.direction).toBe("output");
  });

  it("maps bidirectional port to source handle", () => {
    const bidirDecl: PortDeclaration = {
      id: "both",
      name: "Bidirectional",
      direction: "bidirectional",
    };
    const node = buildNode("node-1", "node-def", [
      buildPortInstance("both", "bidirectional", bidirDecl),
    ]);
    const graph = buildGraph([node], []);

    const result = toReactFlowNodes(graph, () =>
      mockNodeDefinition({ ports: [bidirDecl] }),
    );

    const rfNode = result[0];
    const port = (rfNode!.data as { ports: Array<{ id: string; direction: string }> }).ports.find(
      (p) => p.id === "both",
    );
    expect(port).toBeDefined();
    // bidirectional maps to a source handle in the wrapper (ConnectionMode loose).
    expect(port?.direction).toBe("bidirectional");
  });

  it("includes port name, direction and dataType in data.ports", () => {
    const decl: PortDeclaration = {
      id: "p1",
      name: "Port One",
      direction: "input",
      dataType: "string",
    };
    const node = buildNode("node-1", "node-def", [
      buildPortInstance("p1", "input", decl),
    ]);
    const graph = buildGraph([node], []);

    const result = toReactFlowNodes(graph, () =>
      mockNodeDefinition({ ports: [decl] }),
    );

    expect(result[0]!.data!.ports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "p1",
          name: "Port One",
          direction: "input",
          dataType: "string",
        }),
      ]),
    );
  });

  it("copies node properties into data.properties", () => {
    const node = buildNode("node-1", "node-def", [], { key: "val" });
    const graph = buildGraph([node], []);

    const result = toReactFlowNodes(graph, () => mockNodeDefinition());

    expect(result[0]!.data!.properties).toEqual({ key: "val" });
  });

  it("sets label from node metadata name when definition name available", () => {
    const node = buildNode("node-1", "node-def", [], {}, undefined, { name: "Node Label" });
    const graph = buildGraph([node], []);

    const result = toReactFlowNodes(graph, () =>
      mockNodeDefinition({ name: "Def Name" }),
    );

    expect(result[0]!.data!.label).toBe("Node Label");
  });
});

describe("toReactFlowEdges", () => {
  it("maps edge id, source, target and handles", () => {
    const node1 = buildNode("node-1", "def", [buildPortInstance("out", "output")]);
    const node2 = buildNode("node-2", "def", [buildPortInstance("in", "input")]);
    const edge = makeEdge("edge-1", "node-1", "out", "node-2", "in");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () => undefined);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("edge-1");
    expect(result[0]!.source).toBe("node-1");
    expect(result[0]!.target).toBe("node-2");
    expect(result[0]!.sourceHandle).toBe("out");
    expect(result[0]!.targetHandle).toBe("in");
  });

  it("uses default renderer id when definition is undefined", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p1", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p2", "input")]);
    const edge = makeEdge("e1", "n1", "p1", "n2", "p2");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () => undefined);

    expect(result[0]!.type).toBe("nodera-default-edge");
  });

  it("uses definition.renderer when available", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p1", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p2", "input")]);
    const edge = makeEdge("e1", "n1", "p1", "n2", "p2", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () =>
      mockEdgeDefinition({ renderer: "my-edge" }),
    );

    expect(result[0]!.type).toBe("my-edge");
  });

  it("maps geometry straight → straight edge type", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p", "input")]);
    const edge = makeEdge("e1", "n1", "p", "n2", "p", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () =>
      mockEdgeDefinition({
        visual: { geometry: "straight" },
      }),
    );

    expect(result[0]!.type).toBe("straight");
  });

  it("maps geometry bezier → default (BezierEdge type)", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p", "input")]);
    const edge = makeEdge("e1", "n1", "p", "n2", "p", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () =>
      mockEdgeDefinition({
        visual: { geometry: "bezier" },
      }),
    );

    expect(result[0]!.type).toBe("default");
  });

  it("maps geometry step → step edge type", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p", "input")]);
    const edge = makeEdge("e1", "n1", "p", "n2", "p", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () =>
      mockEdgeDefinition({
        visual: { geometry: "step" },
      }),
    );

    expect(result[0]!.type).toBe("step");
  });

  it("maps geometry smooth → smoothstep edge type", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p", "input")]);
    const edge = makeEdge("e1", "n1", "p", "n2", "p", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () =>
      mockEdgeDefinition({
        visual: { geometry: "smooth" },
      }),
    );

    expect(result[0]!.type).toBe("smoothstep");
  });

  it("sets animated from visual.animation", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p", "input")]);
    const edge = makeEdge("e1", "n1", "p", "n2", "p", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () =>
      mockEdgeDefinition({
        visual: { animation: "flow" },
      }),
    );

    expect(result[0]!.animated).toBe(true);
  });

  it("sets style.stroke from visual.color", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p", "input")]);
    const edge = makeEdge("e1", "n1", "p", "n2", "p", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () =>
      mockEdgeDefinition({
        visual: { color: "red" },
      }),
    );

    expect(result[0]!.style).toEqual({ stroke: "red" });
  });

  it("sets markerEnd from visual.arrowEnd", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p", "input")]);
    const edge = makeEdge("e1", "n1", "p", "n2", "p", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () =>
      mockEdgeDefinition({
        visual: { arrowEnd: true },
      }),
    );

    expect(result[0]!.markerEnd).toBe("arrow");
  });

  it("sets markerStart from visual.arrowStart", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p", "input")]);
    const edge = makeEdge("e1", "n1", "p", "n2", "p", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () =>
      mockEdgeDefinition({
        visual: { arrowStart: true },
      }),
    );

    expect(result[0]!.markerStart).toBe("arrow");
  });

  it("sets edge label from edge instance", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p", "input")]);
    const edge = makeEdge("e1", "n1", "p", "n2", "p");
    edge.setLabel("My Connection");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () => undefined);

    // RF edge label is ReactNode; we store it as text
    expect(result[0]!.label).toBe("My Connection");
  });
});

describe("nodePositionFromReactFlow", () => {
  it("extracts nodeId and position from an RF node", () => {
    const rfNode = { id: "my-node", position: { x: 150, y: 300 } };

    const result = nodePositionFromReactFlow(rfNode as never);

    expect(result).toEqual({ nodeId: "my-node", position: { x: 150, y: 300 } });
  });
});

describe("connectionFromReactFlow", () => {
  it("converts valid connection params to source/target structure", () => {
    const result = connectionFromReactFlow({
      source: "node-1",
      target: "node-2",
      sourceHandle: "out",
      targetHandle: "in",
    });

    expect(result).toEqual({
      source: { nodeId: "node-1", portId: "out" },
      target: { nodeId: "node-2", portId: "in" },
    });
  });

  it("returns undefined when sourceHandle is null", () => {
    const result = connectionFromReactFlow({
      source: "node-1",
      target: "node-2",
      sourceHandle: null,
      targetHandle: "in",
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined when targetHandle is null", () => {
    const result = connectionFromReactFlow({
      source: "node-1",
      target: "node-2",
      sourceHandle: "out",
      targetHandle: null,
    });

    expect(result).toBeUndefined();
  });

  it("returns undefined when both handles are null", () => {
    const result = connectionFromReactFlow({
      source: "node-1",
      target: "node-2",
      sourceHandle: null,
      targetHandle: null,
    });

    expect(result).toBeUndefined();
  });
});

describe("removedIdsFromReactFlowChanges", () => {
  it("extracts ids from NodeRemoveChange entries", () => {
    const changes: NodeChange[] = [
      { id: "node-1", type: "remove" },
      { id: "node-2", type: "position", position: { x: 0, y: 0 } },
      { id: "node-3", type: "remove" },
    ];

    const result = removedIdsFromReactFlowChanges(changes);

    expect(result).toEqual(["node-1", "node-3"]);
  });

  it("extracts ids from EdgeRemoveChange entries", () => {
    const changes: EdgeChange[] = [
      { id: "edge-1", type: "remove" },
      { id: "edge-2", type: "select", selected: true },
      { id: "edge-3", type: "remove" },
    ];

    const result = removedIdsFromReactFlowChanges(changes);

    expect(result).toEqual(["edge-1", "edge-3"]);
  });

  it("returns empty array when no remove changes exist", () => {
    const changes: NodeChange[] = [
      { id: "node-1", type: "position", position: { x: 1, y: 1 } },
    ];

    const result = removedIdsFromReactFlowChanges(changes);

    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(removedIdsFromReactFlowChanges([])).toHaveLength(0);
  });
});