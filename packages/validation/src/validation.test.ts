import { describe, expect, it } from "vitest";
import {
  createEdgeId,
  createGraphId,
  createNodeId,
} from "@nodera/contracts";
import {
  Connection,
  Edge,
  Graph,
  Node,
  type PortDeclaration,
  type PortInstance,
} from "@nodera/graph-model";
import type { EdgeDefinition } from "@nodera/edge-registry";
import { EdgeRegistry } from "@nodera/edge-registry";
import type { NodeDefinition } from "@nodera/node-registry";
import { NodeRegistry } from "@nodera/node-registry";
import type { ValidationContext } from "./context.js";
import { ValidatorRegistry } from "./validator-registry.js";
import { validateGraph } from "./validate-graph.js";

const port = (id: string, direction: PortDeclaration["direction"], extra: Partial<PortDeclaration> = {}): PortDeclaration => ({
  id,
  direction,
  ...extra,
});
const instance = (id: string, direction: PortInstance["direction"]): PortInstance => ({ id, direction });

function makeContext(graph: Graph, nodes: NodeRegistry, edges: EdgeRegistry, validators: ValidatorRegistry): ValidationContext {
  return { graph, nodes, edges, validators };
}

interface Fixture {
  graph: Graph;
  nodes: NodeRegistry;
  edges: EdgeRegistry;
  validators: ValidatorRegistry;
  context: ValidationContext;
}

function buildFixture(options: {
  nodeDefinition: NodeDefinition;
  edgeDefinition?: EdgeDefinition;
  build: (graph: Graph) => void;
}): Fixture {
  const graph = new Graph(createGraphId("g1"));
  const nodes = new NodeRegistry();
  const edges = new EdgeRegistry();
  const validators = new ValidatorRegistry();
  nodes.register(options.nodeDefinition);
  if (options.edgeDefinition !== undefined) {
    edges.register(options.edgeDefinition);
  }
  options.build(graph);
  return {
    graph,
    nodes,
    edges,
    validators,
    context: makeContext(graph, nodes, edges, validators),
  };
}

const simpleNodeDef: NodeDefinition = {
  id: "test.source",
  name: "Source",
  category: "io",
  version: "1.0.0",
  ports: [port("out", "output")],
  properties: [{ id: "name", type: "string", required: true }],
};

function addNode(graph: Graph, id: string, definitionId: string, ports: readonly PortInstance[], properties: Record<string, unknown> = {}): Node {
  const node = new Node(createNodeId(id), definitionId, ports, properties);
  graph.addNode(node);
  return node;
}

function connect(graph: Graph, id: string, from: [string, string], to: [string, string], definitionId?: string) {
  const edge = new Edge(
    createEdgeId(id),
    new Connection(
      { nodeId: createNodeId(from[0]), portId: from[1] },
      { nodeId: createNodeId(to[0]), portId: to[1] },
    ),
    definitionId,
  );
  return graph.addEdge(edge);
}

describe("structural validation", () => {
  it("passes a well-formed graph", () => {
    const fixture = buildFixture({
      nodeDefinition: simpleNodeDef,
      build: (graph) => {
        addNode(graph, "n1", "test.source", [instance("out", "output")], { name: "a" });
        addNode(graph, "n2", "test.source", [instance("in", "input")], { name: "b" });
        connect(graph, "e1", ["n1", "out"], ["n2", "in"]);
      },
    });
    const report = validateGraph(fixture.context);
    expect(report.structurallyValid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("reports unknown node and edge definition references", () => {
    const fixture = buildFixture({
      nodeDefinition: simpleNodeDef,
      build: (graph) => {
        addNode(graph, "n1", "test.ghost", []);
        addNode(graph, "n2", "test.source", [instance("out", "output"), instance("in", "input")], { name: "b" });
        connect(graph, "e1", ["n2", "out"], ["n2", "in"], "test.ghost-edge");
      },
    });
    const report = validateGraph(fixture.context);
    expect(report.structurallyValid).toBe(false);
    expect(report.issues.map((i) => i.code)).toEqual([
      "structural.unknown-node-definition",
      "structural.unknown-edge-definition",
    ]);
  });

  it("prevents missing-port connections at mutation time; the validator guard stays for documents", () => {
    const fixture = buildFixture({
      nodeDefinition: simpleNodeDef,
      build: (graph) => {
        addNode(graph, "n1", "test.source", [instance("out", "output")], { name: "a" });
        addNode(graph, "n2", "test.source", [instance("in", "input")], { name: "b" });
        const rejected = connect(graph, "e1", ["n1", "nope"], ["n2", "in"]);
        expect(rejected.ok).toBe(false);
      },
    });
    const report = validateGraph(fixture.context);
    expect(report.issues).toEqual([]);
  });
});

describe("domain validation", () => {
  it("keeps structurally valid graphs with configuration errors apart", () => {
    const fixture = buildFixture({
      nodeDefinition: simpleNodeDef,
      build: (graph) => {
        addNode(graph, "n1", "test.source", [instance("out", "output")], {});
      },
    });
    const report = validateGraph(fixture.context);
    expect(report.structurallyValid).toBe(true);
    expect(report.configurationValid).toBe(false);
    expect(report.isValid).toBe(false);
    expect(report.issues.map((i) => i.code)).toEqual(["domain.property.required"]);
  });

  it("reports port direction violations", () => {
    const fixture = buildFixture({
      nodeDefinition: simpleNodeDef,
      build: (graph) => {
        addNode(graph, "n1", "test.source", [instance("out", "output"), instance("in", "input")], { name: "a" });
        addNode(graph, "n2", "test.source", [instance("out", "output"), instance("in", "input")], { name: "b" });
        connect(graph, "e1", ["n1", "in"], ["n2", "out"]);
      },
    });
    const report = validateGraph(fixture.context);
    expect(report.issues.map((i) => i.code)).toContain("domain.port-direction");
  });

  it("enforces single-connection multiplicity", () => {
    const fixture = buildFixture({
      nodeDefinition: simpleNodeDef,
      build: (graph) => {
        addNode(graph, "n1", "test.source", [instance("out", "output"), instance("in", "input")], { name: "a" });
        addNode(graph, "n2", "test.source", [instance("out", "output"), instance("in", "input")], { name: "b" });
        addNode(graph, "n3", "test.source", [instance("out", "output"), instance("in", "input")], { name: "c" });
        connect(graph, "e1", ["n1", "out"], ["n2", "in"]);
        connect(graph, "e2", ["n1", "out"], ["n3", "in"]);
      },
    });
    const report = validateGraph(fixture.context);
    expect(report.issues.filter((i) => i.code === "domain.port-over-max")).toHaveLength(1);
    expect(report.issues.find((i) => i.code === "domain.port-over-max")?.metadata).toMatchObject({
      portId: "out",
      max: 1,
      count: 2,
    });
  });

  it("enforces min connections and multiple multiplicity", () => {
    const multiDef: NodeDefinition = {
      ...simpleNodeDef,
      id: "test.multi",
      ports: [port("in", "input", { multiplicity: "multiple", minConnections: 1 })],
    };
    const fixture = buildFixture({
      nodeDefinition: multiDef,
      build: (graph) => {
        addNode(graph, "n1", "test.multi", [instance("in", "input")], {});
      },
    });
    const report = validateGraph(fixture.context);
    expect(report.issues.map((i) => i.code)).toContain("domain.port-under-min");
  });

  it("reports data type mismatches with polymorphic escape hatches", () => {
    const typedDef: NodeDefinition = {
      ...simpleNodeDef,
      id: "test.typed",
      ports: [port("out", "output", { dataType: "string" }), port("in", "input", { dataType: "number" })],
    };
    const fixture = buildFixture({
      nodeDefinition: typedDef,
      build: (graph) => {
        addNode(graph, "n1", "test.typed", [instance("out", "output"), instance("in", "input")], {});
        addNode(graph, "n2", "test.typed", [instance("out", "output"), instance("in", "input")], {});
        connect(graph, "e1", ["n1", "out"], ["n2", "in"]);
      },
    });
    const report = validateGraph(fixture.context);
    expect(report.issues.map((i) => i.code)).toContain("domain.data-type-mismatch");
  });

  it("respects allowedDataTypes as a compatibility override", () => {
    const fromDef: NodeDefinition = {
      ...simpleNodeDef,
      id: "test.from",
      ports: [port("out", "output", { dataType: "string" })],
    };
    const toDef: NodeDefinition = {
      ...simpleNodeDef,
      id: "test.to",
      ports: [port("in", "input", { dataType: "number", allowedDataTypes: ["string"] })],
    };
    const graph = new Graph(createGraphId("g1"));
    const nodes = new NodeRegistry();
    const edges = new EdgeRegistry();
    const validators = new ValidatorRegistry();
    nodes.register(fromDef);
    nodes.register(toDef);
    addNode(graph, "n1", "test.from", [instance("out", "output")], { name: "a" });
    addNode(graph, "n2", "test.to", [instance("in", "input")], { name: "b" });
    connect(graph, "e1", ["n1", "out"], ["n2", "in"]);
    const report = validateGraph(makeContext(graph, nodes, edges, validators));
    expect(report.issues).toEqual([]);
  });

  it("enforces port and edge-definition node type restrictions", () => {
    const restrictedDef: NodeDefinition = {
      ...simpleNodeDef,
      id: "test.restricted",
      ports: [port("in", "input", { allowedNodeDefinitionIds: ["test.allowed"] })],
    };
    const restrictedEdge: EdgeDefinition = {
      id: "test.flow",
      name: "Flow",
      version: "1.0.0",
      allowedSourceNodeDefinitionIds: ["test.allowed"],
    };
    const fixture = buildFixture({
      nodeDefinition: restrictedDef,
      edgeDefinition: restrictedEdge,
      build: (graph) => {
        addNode(graph, "n1", "test.source", [instance("out", "output")], { name: "a" });
        addNode(graph, "n2", "test.restricted", [instance("in", "input")], {});
        connect(graph, "e1", ["n1", "out"], ["n2", "in"], "test.flow");
      },
    });
    const report = validateGraph(fixture.context);
    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain("domain.node-type-not-allowed");
    expect(codes).toContain("domain.source-node-type-not-allowed");
  });

  it("enforces node-level connection policies", () => {
    const sinkDef: NodeDefinition = {
      ...simpleNodeDef,
      id: "test.sink",
      connectionPolicy: { incoming: "allow", outgoing: "forbid" },
    };
    const fixture = buildFixture({
      nodeDefinition: sinkDef,
      build: (graph) => {
        addNode(graph, "n1", "test.sink", [instance("out", "output"), instance("in", "input")], { name: "a" });
        addNode(graph, "n2", "test.sink", [instance("out", "output"), instance("in", "input")], { name: "b" });
        connect(graph, "e1", ["n1", "out"], ["n2", "in"]);
      },
    });
    const report = validateGraph(fixture.context);
    expect(report.issues.map((i) => i.code)).toContain("domain.outgoing-forbidden");
  });

  it("runs custom node rules referenced by definitions and flags unknown ones", () => {
    const validators = new ValidatorRegistry();
    validators.registerNodeRule({
      id: "test.rule.requires-name",
      severity: "warning",
      validate: ({ node }) => [
        { code: "test.rule.empty-name", message: `node ${node.id} has no name` },
      ],
    });
    const ruledDef: NodeDefinition = {
      ...simpleNodeDef,
      id: "test.ruled",
      validationRuleIds: ["test.rule.requires-name", "test.rule.missing"],
    };
    const fixture = buildFixture({
      nodeDefinition: ruledDef,
      build: (graph) => {
        addNode(graph, "n1", "test.ruled", [instance("out", "output")], {});
      },
    });
    fixture.validators.registerNodeRule({
      id: "test.rule.requires-name",
      severity: "warning",
      validate: ({ node }) => [
        { code: "test.rule.empty-name", message: `node ${node.id} has no name` },
      ],
    });
    const report = validateGraph(fixture.context);
    const codes = report.issues.map((i) => i.code);
    expect(codes).toContain("test.rule.empty-name");
    expect(report.issues.find((i) => i.code === "test.rule.empty-name")?.severity).toBe("warning");
    expect(codes).toContain("domain.unknown-node-rule");
  });
});

describe("level filtering", () => {
  it("restricts validation to requested levels", () => {
    const fixture = buildFixture({
      nodeDefinition: simpleNodeDef,
      build: (graph) => {
        addNode(graph, "n1", "test.source", [instance("out", "output")], {});
      },
    });
    const report = validateGraph(fixture.context, { levels: ["structural"] });
    expect(report.issues).toEqual([]);
    expect(report.configurationValid).toBe(true);
  });
});
