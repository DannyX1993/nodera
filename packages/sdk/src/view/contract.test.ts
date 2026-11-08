import { describe, expect, it } from "vitest";

import type { EdgeDefinitionInput } from "../authoring/edges.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";
import type { EdgeDefinitionView } from "./definitions.js";
import type { EdgeInstanceView } from "./instances.js";

/**
 * Contract guard against PRODUCT-DESCRIPTION §9 ("Contratos públicos y
 * tipado").
 *
 * §9 lists the fields of the contracts a host reads. The types already express
 * them, but a type is satisfied by a shape the host cannot see at runtime:
 * these assertions check the *values* the SDK actually produces, with
 * `Object.keys` and `in`, so a rename inside a mapping function is caught even
 * when it still compiles.
 */

/** §9, verbatim: the `NodeInstance` fields. */
const SECTION_9_NODE_INSTANCE_FIELDS = [
  "id",
  "type",
  "version",
  "position",
  "properties",
  "metadata",
] as const;

/** §9, verbatim: the `EdgeInstance` fields. */
const SECTION_9_EDGE_INSTANCE_FIELDS = [
  "id",
  "type",
  "source",
  "sourcePort",
  "target",
  "targetPort",
  "metadata",
] as const;

/**
 * The one field the SDK adds to §9's `EdgeInstance`: the instance's own label.
 *
 * §9's `EdgeInstance` sketch omits it, but the domain stores it and dropping it
 * would be the silent-loss defect this phase treats as critical.
 */
const EDGE_INSTANCE_EXTRA_FIELDS = ["label"] as const;

/** §9, verbatim: the required `NodeDefinition` fields. */
const SECTION_9_NODE_DEFINITION_FIELDS = [
  "type",
  "version",
  "label",
  "category",
  "ports",
  "properties",
] as const;

/** The core names §9 replaces; a view that carries one speaks two vocabularies. */
const CORE_DEFINITION_KEYS = ["id", "name"] as const;

const REQUEST = "http.request";
const RESPONSE = "http.response";
const FLOW = "http.flow";

function nodeInput(type: string): NodeDefinitionInput {
  return {
    type,
    version: "1.0.0",
    label: type,
    category: "http",
    ports: { inputs: [{ id: "in", dataType: "any" }], outputs: [{ id: "out", dataType: "any" }] },
    properties: [{ id: "url", type: "string", label: "URL" }],
  };
}

function edgeInput(): EdgeDefinitionInput {
  return { type: FLOW, label: "HTTP flow" };
}

function create(): Builder {
  const result = createBuilder({
    registry: { nodes: [nodeInput(REQUEST), nodeInput(RESPONSE)], edges: [edgeInput()] },
  });
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

function nodeId(builder: Builder, type: string): string {
  const added = builder.graph.addNode({ type, position: { x: 1, y: 2 } });
  if (!added.ok) {
    throw new Error(
      `unexpected addNode failure: ${added.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return added.value.id;
}

function connectedEdge(builder: Builder): EdgeInstanceView {
  const source = nodeId(builder, REQUEST);
  const target = nodeId(builder, RESPONSE);
  const edge = builder.graph.connect({ source, target, type: FLOW, label: "flow" });
  if (!edge.ok) {
    throw new Error(
      `unexpected connect failure: ${edge.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return edge.value;
}

describe("§9 NodeDefinition", () => {
  it("publishes the §9 field names and none of the core ones", () => {
    const builder = create();
    const view = builder.registries.nodes.get(REQUEST);

    if (view === undefined) {
      throw new Error("the configured definition must be readable");
    }

    for (const field of SECTION_9_NODE_DEFINITION_FIELDS) {
      expect(Object.keys(view), `missing §9 field "${field}"`).toContain(field);
    }
    for (const core of CORE_DEFINITION_KEYS) {
      expect(Object.keys(view), `core key "${core}" leaked`).not.toContain(core);
      expect(core in view, `core key "${core}" leaked`).toBe(false);
    }
  });

  it("names every port with §9's direction vocabulary", () => {
    const builder = create();
    const view = builder.registries.nodes.get(REQUEST);

    if (view === undefined) {
      throw new Error("the configured definition must be readable");
    }
    for (const port of view.ports) {
      expect(["input", "output", "bidirectional"]).toContain(port.direction);
      expect(typeof port.required).toBe("boolean");
      expect("direction" in port).toBe(true);
    }
  });
});

describe("§9 NodeInstance", () => {
  /**
   * A document that pins every §9 instance field.
   *
   * A node the builder creates carries no definition version and no metadata,
   * so the only public way to obtain all six §9 fields at once is an imported
   * document that declares them.
   */
  const DOCUMENT = {
    format: "ggd",
    version: "1.0.0",
    metadata: { id: "graph-contract" },
    extensions: [],
    graph: {
      nodes: [
        {
          id: "n1",
          type: REQUEST,
          version: "1.0.0",
          position: { x: 3, y: 4 },
          properties: { url: "https://example.test" },
          metadata: { vendor: "acme" },
          ports: [
            { id: "in", direction: "input" },
            { id: "out", direction: "output" },
          ],
        },
      ],
      edges: [],
    },
  };

  it("carries all six §9 fields and no core definition key", () => {
    const builder = create();
    const imported = builder.document.import(DOCUMENT);

    expect(imported.ok).toBe(true);

    const [instance] = builder.graph.nodes();
    if (instance === undefined) {
      throw new Error("the graph must expose the imported node");
    }
    expect(Object.keys(instance).sort()).toEqual(
      [...SECTION_9_NODE_INSTANCE_FIELDS].sort(),
    );
    expect("definitionId" in instance).toBe(false);
    expect("definitionVersion" in instance).toBe(false);
    expect(instance.type).toBe(REQUEST);
  });

  it("is what the graph read returns for every stored node", () => {
    const builder = create();
    nodeId(builder, REQUEST);

    const [instance] = builder.graph.nodes();
    if (instance === undefined) {
      throw new Error("the graph must expose the node it holds");
    }
    expect(Object.keys(instance)).toContain("id");
    expect(Object.keys(instance)).toContain("type");
    expect(Object.keys(instance)).toContain("properties");
    expect(instance.type).toBe(REQUEST);
  });
});

describe("§9 EdgeInstance", () => {
  it("carries the flat §9 endpoints and no nested object", () => {
    const builder = create();
    connectedEdge(builder);
    // §9's `metadata` is optional and a freshly connected edge has none, so the
    // one public way to obtain every §9 field at once is to set it through the
    // editor and read the graph again.
    const stored = builder.editor.graph.getEdges()[0];
    if (stored === undefined) {
      throw new Error("the editor must expose the edge it just created");
    }
    stored.setMetadata({ vendor: "acme" });

    const edge = builder.graph.edges()[0];
    if (edge === undefined) {
      throw new Error("the graph must expose the edge it holds");
    }

    for (const field of SECTION_9_EDGE_INSTANCE_FIELDS) {
      expect(Object.keys(edge), `missing §9 field "${field}"`).toContain(field);
    }
    const allowed: readonly string[] = [
      ...SECTION_9_EDGE_INSTANCE_FIELDS,
      ...EDGE_INSTANCE_EXTRA_FIELDS,
    ];
    for (const key of Object.keys(edge)) {
      expect(allowed, `unexpected field "${key}"`).toContain(key);
    }
    expect(typeof edge.source).toBe("string");
    expect(typeof edge.target).toBe("string");
    expect(typeof edge.sourcePort).toBe("string");
    expect(typeof edge.targetPort).toBe("string");
    expect("connection" in edge).toBe(false);
    expect("definitionId" in edge).toBe(false);
  });

  it("has no object-valued field at all, because endpoints are flat", () => {
    const builder = create();
    const edge = connectedEdge(builder);

    for (const [key, value] of Object.entries(edge)) {
      expect(typeof value === "object", `field "${key}" is nested`).toBe(false);
    }
  });

  it("is what the graph read returns for every stored edge", () => {
    const builder = create();
    const created = connectedEdge(builder);

    const [edge] = builder.graph.edges();
    if (edge === undefined) {
      throw new Error("the graph must expose the edge it holds");
    }
    expect(edge).toEqual(created);
  });
});

describe("§9 EdgeDefinition", () => {
  it("publishes §9's type and label, and no core key", () => {
    const builder = create();
    const view: EdgeDefinitionView | undefined = builder.registries.edges.get(FLOW);

    if (view === undefined) {
      throw new Error("the configured edge definition must be readable");
    }
    expect(Object.keys(view)).toContain("type");
    expect(Object.keys(view)).toContain("label");
    expect(Object.keys(view)).toContain("version");
    for (const core of CORE_DEFINITION_KEYS) {
      expect(core in view).toBe(false);
    }
  });
});
