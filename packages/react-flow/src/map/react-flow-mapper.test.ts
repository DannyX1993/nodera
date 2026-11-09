import type {
  EdgeChange,
  NodeChange,
} from "@xyflow/react";
import { Position } from "@xyflow/react";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Connection, Edge, Graph, Node } from "@nodera/graph-model";
import { createEdgeId, createGraphId, createNodeId } from "@nodera/contracts";
import type { NodeDefinition, NodeVisual } from "@nodera/node-registry";
import type { PortDeclaration, PortDirection, PortInstance } from "@nodera/graph-model";

import type { EdgeDefinition } from "@nodera/edge-registry";

import {
  applyDragPositions,
  applyMeasuredDimensions,
  dragPositionsFromChanges,
  hasNewDimensions,
  connectionFromReactFlow,
  nodePositionFromReactFlow,
  removedIdsFromReactFlowChanges,
  toReactFlowEdges,
  toReactFlowNodes,
} from "./react-flow-mapper.js";
import { DefaultEdgeRenderer } from "../renderers/default-edge-renderer.js";

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

describe("toReactFlowEdges renderer-only style hints", () => {
  function hintedGraph(style: Readonly<Record<string, unknown>>) {
    const node1 = buildNode("n1", "d", [buildPortInstance("p1", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p2", "input")]);
    const edge = makeEdge("e1", "n1", "p1", "n2", "p2", "edge-def");
    return {
      graph: buildGraph([node1, node2], [edge]),
      definition: mockEdgeDefinition({ visual: { metadata: { style } } }),
    };
  }

  it("carries the honoured metadata.style hints into the edge data", () => {
    const { graph, definition } = hintedGraph({ strokeWidth: 3, dashArray: "4 2" });

    const result = toReactFlowEdges(graph, () => definition);

    expect(result[0]!.data).toEqual({
      styleHints: { strokeWidth: 3, dashArray: "4 2" },
    });
  });

  it("leaves the edge data absent when the definition declares no renderer-only hints", () => {
    const { graph, definition } = hintedGraph({});

    const result = toReactFlowEdges(graph, () => definition);

    expect(result[0]!.data).toBeUndefined();
  });

  it("keeps the phase-4 style mapping for an edge that only declares visual keys", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p1", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p2", "input")]);
    const edge = makeEdge("e1", "n1", "p1", "n2", "p2", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);

    const result = toReactFlowEdges(graph, () =>
      mockEdgeDefinition({ visual: { lineStyle: "dashed", color: "red" } }),
    );

    expect(result[0]!.style).toEqual({ strokeDasharray: "6 6", stroke: "red" });
    expect(result[0]!.data).toBeUndefined();
  });

  it("draws an SDK-authored strokeWidth hint on the rendered default edge", () => {
    // Integration: definition → mapped React Flow edge → DefaultEdgeRenderer.
    const { graph, definition } = hintedGraph({ strokeWidth: 3, dashArray: "4 2" });
    const mapped = toReactFlowEdges(graph, () => definition)[0]!;
    const data = mapped.data;
    if (data === undefined) {
      throw new Error("expected the mapped edge to carry the definition's style hints");
    }

    const { container } = render(
      createElement(DefaultEdgeRenderer, {
        id: "e1",
        source: "n1",
        target: "n2",
        sourceX: 0,
        sourceY: 0,
        targetX: 100,
        targetY: 100,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data,
      }),
    );

    const path = container.querySelector("path");
    expect((path as SVGPathElement).style.strokeWidth).toBe("3");
    expect((path as SVGPathElement).style.strokeDasharray).toBe("4 2");
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
describe("T8 audit fixes", () => {
  it("carries the definition renderer id in node data (rendererId)", () => {
    const node = buildNode("node-1", "node-def", []);
    const graph = buildGraph([node], []);
    const result = toReactFlowNodes(graph, () => mockNodeDefinition({ renderer: "my-custom-node" }));
    const data = result[0]!.data as Record<string, unknown>;
    expect(data["rendererId"]).toBe("my-custom-node");
  });

  it("omits rendererId when the definition has none", () => {
    const node = buildNode("node-1", "node-def", []);
    const graph = buildGraph([node], []);
    const result = toReactFlowNodes(graph, () => mockNodeDefinition({}));
    expect((result[0]!.data as Record<string, unknown>)["rendererId"]).toBeUndefined();
  });

  it("maps edge lineStyle dashed to strokeDasharray", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p1", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p2", "input")]);
    const edge = makeEdge("e1", "n1", "p1", "n2", "p2", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);
    const def = mockEdgeDefinition({ visual: { lineStyle: "dashed" } });
    const result = toReactFlowEdges(graph, () => def);
    expect((result[0]!.style as Record<string, unknown>)["strokeDasharray"]).toBe("6 6");
  });

  it("maps edge lineStyle dotted to strokeDasharray", () => {
    const node1 = buildNode("n1", "d", [buildPortInstance("p1", "output")]);
    const node2 = buildNode("n2", "d", [buildPortInstance("p2", "input")]);
    const edge = makeEdge("e1", "n1", "p1", "n2", "p2", "edge-def");
    const graph = buildGraph([node1, node2], [edge]);
    const def = mockEdgeDefinition({ visual: { lineStyle: "dotted" } });
    const result = toReactFlowEdges(graph, () => def);
    expect((result[0]!.style as Record<string, unknown>)["strokeDasharray"]).toBe("2 4");
  });
});

describe("port visual mapping (S3 component replacement)", () => {
  it("carries the port declaration visual into data.ports", () => {
    const decl: PortDeclaration = {
      id: "p1",
      name: "Port One",
      direction: "input",
      visual: { renderer: "acme.port", metadata: { shape: "diamond" } },
    };
    const node = buildNode("node-1", "node-def", [
      buildPortInstance("p1", "input", decl),
    ]);
    const graph = buildGraph([node], []);

    const result = toReactFlowNodes(graph, () =>
      mockNodeDefinition({ ports: [decl] }),
    );

    const port = (result[0]!.data as { ports: Array<{ id: string; visual?: unknown }> })
      .ports[0];
    expect(port?.visual).toEqual({
      renderer: "acme.port",
      metadata: { shape: "diamond" },
    });
  });

  it("omits the visual key when the port declaration has no visual", () => {
    const decl: PortDeclaration = {
      id: "p1",
      name: "Port One",
      direction: "input",
    };
    const node = buildNode("node-1", "node-def", [
      buildPortInstance("p1", "input", decl),
    ]);
    const graph = buildGraph([node], []);

    const result = toReactFlowNodes(graph, () =>
      mockNodeDefinition({ ports: [decl] }),
    );

    const port = (result[0]!.data as { ports: Array<{ id: string }> }).ports[0];
    expect(port).not.toHaveProperty("visual");
  });
});

describe("applyMeasuredDimensions (T8 minimap fix)", () => {
  it("merges measured dimensions into the matching nodes", () => {
    const nodes = [
      { id: "n1", position: { x: 0, y: 0 }, data: {} },
      { id: "n2", position: { x: 10, y: 0 }, data: {} },
    ];
    const dims = new Map([["n1", { width: 160, height: 48 }]]);
    const merged = applyMeasuredDimensions(nodes, dims);
    expect(merged[0]).toMatchObject({ width: 160, height: 48 });
    expect(merged[1]).not.toHaveProperty("width");
    // Original array untouched.
    expect(nodes[0]).not.toHaveProperty("width");
  });

  it("carries `measured`, so a re-derived node keeps its internal handle bounds", () => {
    // React Flow's `parseHandles` answers `undefined` when a user node has no
    // `measured`, and that drops the node's internal handle bounds — which
    // unmounts its edges for a frame on every re-derivation (the drag flicker).
    const nodes = [{ id: "n1", position: { x: 0, y: 0 }, data: {} }];
    const dims = new Map([["n1", { width: 160, height: 48 }]]);

    const merged = applyMeasuredDimensions(nodes, dims);

    expect(merged[0]).toMatchObject({ measured: { width: 160, height: 48 } });
  });

  it("leaves a node without stored dimensions identical, and unmeasured", () => {
    const node = { id: "n1", position: { x: 0, y: 0 }, data: {} };

    const merged = applyMeasuredDimensions([node], new Map());

    expect(merged[0]).toBe(node);
    expect(merged[0]).not.toHaveProperty("measured");
  });

  it("drops stored dimensions for nodes that no longer exist", () => {
    const nodes = [{ id: "n1", position: { x: 0, y: 0 }, data: {} }];
    const dims = new Map<string, { width: number; height: number }>([
      ["n1", { width: 10, height: 10 }],
      ["n-gone", { width: 5, height: 5 }],
    ]);
    applyMeasuredDimensions(nodes, dims);
    expect(dims.has("n-gone")).toBe(false);
    expect(dims.has("n1")).toBe(true);
  });
});

describe("hasNewDimensions (loop guard)", () => {
  it("reports new dimensions the first time a node reports", () => {
    const measured = new Map<string, { width: number; height: number }>();
    const changes = [
      { id: "n1", type: "dimensions" as const, dimensions: { width: 51, height: 18 } },
    ];
    expect(hasNewDimensions(changes, measured)).toBe(true);
  });

  it("ignores repeated identical dimensions (prevents the refresh loop)", () => {
    const dims = { width: 51, height: 18 };
    const measured = new Map([["n1", dims]]);
    const changes = [
      { id: "n1", type: "dimensions" as const, dimensions: { width: 51, height: 18 } },
    ];
    expect(hasNewDimensions(changes, measured)).toBe(false);
  });

  it("reports when a node changes size", () => {
    const measured = new Map([["n1", { width: 51, height: 18 }]]);
    const changes = [
      { id: "n1", type: "dimensions" as const, dimensions: { width: 80, height: 30 } },
    ];
    expect(hasNewDimensions(changes, measured)).toBe(true);
  });

  it("ignores non-dimension changes", () => {
    const measured = new Map();
    const changes = [{ id: "n1", type: "position" as const, position: { x: 1, y: 2 } }];
    expect(hasNewDimensions(changes as never, measured)).toBe(false);
  });
});

describe("dragPositionsFromChanges (live drag paint)", () => {
  it("keeps the position a live drag reports", () => {
    const changes: NodeChange[] = [
      { id: "n1", type: "position", position: { x: 120, y: 80 }, dragging: true },
    ];

    expect([...dragPositionsFromChanges(changes)]).toEqual([
      ["n1", { x: 120, y: 80 }],
    ]);
  });

  it("ignores the release, the last position change of a drag", () => {
    const changes: NodeChange[] = [
      { id: "n1", type: "position", position: { x: 120, y: 80 }, dragging: false },
    ];

    // Keeping this one would leave a snap-back node at the pointer position.
    expect(dragPositionsFromChanges(changes).size).toBe(0);
  });

  it("ignores non-position changes", () => {
    const changes: NodeChange[] = [
      { id: "n1", type: "dimensions", dimensions: { width: 140, height: 40 } },
      { id: "n1", type: "select", selected: true },
      { id: "n1", type: "remove" },
    ];

    expect(dragPositionsFromChanges(changes).size).toBe(0);
  });

  it("ignores a live position change that carries no position", () => {
    const changes: NodeChange[] = [{ id: "n1", type: "position", dragging: true }];

    expect(dragPositionsFromChanges(changes).size).toBe(0);
  });

  it("keeps one position per node of a multi-node drag", () => {
    const changes: NodeChange[] = [
      { id: "n1", type: "position", position: { x: 100, y: 0 }, dragging: true },
      { id: "n2", type: "position", position: { x: 200, y: 0 }, dragging: true },
    ];

    const positions = dragPositionsFromChanges(changes);

    expect(positions.size).toBe(2);
    expect(positions.get("n1")).toEqual({ x: 100, y: 0 });
    expect(positions.get("n2")).toEqual({ x: 200, y: 0 });
  });
});

describe("applyDragPositions (canvas state)", () => {
  const nodes = [
    { id: "n1", position: { x: 0, y: 0 }, data: {} },
    { id: "n2", position: { x: 10, y: 0 }, data: {} },
  ];

  it("moves only the reported node and leaves the others identical", () => {
    const merged = applyDragPositions(nodes, new Map([["n1", { x: 120, y: 80 }]]));

    expect(merged[0]?.position).toEqual({ x: 120, y: 80 });
    // The node the drag never reported keeps the document's position — same
    // object, so React Flow is not told a node it is not dragging moved.
    expect(merged[1]).toBe(nodes[1]);
  });

  it("keeps the measured size a moved node already carries", () => {
    // The size a node already reports must survive the move: losing `measured`
    // would make React Flow re-measure it and unmount its edges for a frame.
    const measured = [
      { id: "n1", position: { x: 0, y: 0 }, measured: { width: 160, height: 48 }, data: {} },
    ];

    const merged = applyDragPositions(measured, new Map([["n1", { x: 40, y: 20 }]]));

    expect(merged[0]).toMatchObject({
      position: { x: 40, y: 20 },
      measured: { width: 160, height: 48 },
    });
  });

  it("returns the nodes unchanged in value when the map is empty", () => {
    const merged = applyDragPositions(nodes, new Map());

    expect(merged).toEqual(nodes);
    expect(merged).not.toBe(nodes);
  });

  it("does not mutate the input array", () => {
    const before = nodes.map((node) => ({ ...node, position: { ...node.position } }));

    applyDragPositions(nodes, new Map([["n1", { x: 5, y: 5 }]]));

    expect(nodes).toEqual(before);
  });
});
