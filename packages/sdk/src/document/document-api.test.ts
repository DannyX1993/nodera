import { describe, expect, it } from "vitest";
import type { Result } from "@nodera/contracts";
import { GGD_FORMAT, type GraphDocument } from "@nodera/document";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";
import type { SdkIssues } from "../errors.js";
import type { BuilderDocumentFormatName } from "./document-api.js";

const REQUEST = "http.request";

function nodeInput(overrides: Partial<NodeDefinitionInput> = {}): NodeDefinitionInput {
  return {
    type: REQUEST,
    version: "1.0.0",
    label: "HTTP request",
    category: "http",
    ports: {
      inputs: [{ id: "in", dataType: "any" }],
      outputs: [{ id: "out", dataType: "any" }],
    },
    ...overrides,
  };
}

function create(version = "1.0.0"): Builder {
  const result = createBuilder({
    document: { format: GGD_FORMAT, version },
    registry: { nodes: [nodeInput()] },
  });
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

function addNodeOrThrow(builder: Builder, type = REQUEST): string {
  const added = builder.graph.addNode({ type });
  if (!added.ok) {
    throw new Error(
      `unexpected addNode failure: ${added.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return String(added.value.id);
}

/** Text of a successful serialization, failing the test otherwise. */
function textOf(result: Result<string, SdkIssues>): string {
  if (!result.ok) {
    throw new Error(
      `unexpected serialization failure: ${result.error
        .map((issue) => issue.code)
        .join(", ")}`,
    );
  }
  return result.value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads one property of a possibly non-object value, without casting. */
function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

describe("document creation", () => {
  it("creates a document that reflects the live editor graph", () => {
    const builder = create("1.1.0");
    const nodeId = addNodeOrThrow(builder);

    const document = builder.document.create();

    expect(document.format).toBe("ggd");
    expect(document.version).toBe(builder.documentFormat.version);
    expect(document.version).toBe("1.1.0");
    expect(document.graph.nodes.map((node) => node.id)).toEqual([nodeId]);
    expect(document.graph.nodes.map((node) => node.type)).toEqual([REQUEST]);
  });
});

describe("document round-trips", () => {
  it.each(["json", "yaml"] as const)(
    "serializes and deserializes the same graph through %s",
    (format) => {
      const builder = create();
      const nodeId = addNodeOrThrow(builder);

      const text = textOf(builder.document.serialize(format));
      const parsed = builder.document.deserialize(format, text);

      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.ok).toBe(true);
      if (!parsed.value.ok) return;
      const graph = parsed.value.value;
      expect(graph.nodeCount).toBe(1);
      expect(graph.getNodes().map((node) => String(node.id))).toEqual([nodeId]);
      expect(graph.getNodes().map((node) => node.definitionId)).toEqual([REQUEST]);
    },
  );

  it("rejects malformed content with the parse problem it found", () => {
    const builder = create();

    const parsed = builder.document.deserialize("json", '{ "format": "ggd", ');

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toHaveLength(1);
    expect(parsed.error[0]).toMatchObject({
      code: "sdk.document-invalid",
      severity: "error",
      metadata: { domainCode: "parse.invalid-json" },
    });
    expect(parsed.error[0]?.message.length).toBeGreaterThan(0);
  });
});

describe("document import", () => {
  it("loads the graph and preserves data the domain does not model", () => {
    const builder = create();
    const raw = {
      format: "ggd",
      version: "1.1.0",
      metadata: {
        id: "graph-demo",
        name: "Demo",
        "x-vendor-metadata": { owner: "acme" },
      },
      extensions: [],
      "x-vendor": { source: "acme" },
      graph: {
        nodes: [{ id: "node-a", type: REQUEST, "x-vendor-color": "teal" }],
        edges: [],
        "x-vendor-graph": 7,
      },
    };

    const imported = builder.document.import(raw);

    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.ok).toBe(true);
    if (!imported.value.ok) return;
    expect(imported.value.value.getNodes().map((node) => String(node.id))).toEqual([
      "node-a",
    ]);

    const document = builder.document.create();
    expect(document.graph.nodes.map((node) => node.id)).toEqual(["node-a"]);

    const serialized: unknown = JSON.parse(textOf(builder.document.serialize("json")));
    expect(field(serialized, "x-vendor")).toEqual({ source: "acme" });
    expect(field(field(serialized, "graph"), "x-vendor-graph")).toBe(7);
    const nodes = field(field(serialized, "graph"), "nodes");
    expect(field(Array.isArray(nodes) ? nodes[0] : undefined, "x-vendor-color")).toBe(
      "teal",
    );
    expect(field(field(serialized, "metadata"), "x-vendor-metadata")).toEqual({
      owner: "acme",
    });
  });

  it("reports a structurally invalid document instead of throwing", () => {
    const builder = create();

    const imported = builder.document.import({
      format: "ggd",
      version: "1.0.0",
      metadata: { id: "graph-demo" },
    });

    expect(imported.ok).toBe(false);
    if (imported.ok) return;
    expect(imported.error).toHaveLength(1);
    expect(imported.error[0]).toMatchObject({
      code: "sdk.document-invalid",
      severity: "error",
      path: ["graph", "nodes"],
      metadata: { domainCode: "document.missing-graph-nodes" },
    });
    expect(builder.graph.nodeCount()).toBe(0);
  });

  it("reports a non-object payload as an invalid document", () => {
    const builder = create();

    const imported = builder.document.import(42);

    expect(imported.ok).toBe(false);
    if (imported.ok) return;
    expect(imported.error[0]).toMatchObject({
      code: "sdk.document-invalid",
      metadata: { domainCode: "document.malformed-document" },
    });
  });
});

describe("document export", () => {
  it("exports the live graph exactly as it serializes it", () => {
    const builder = create();
    addNodeOrThrow(builder);

    expect(builder.document.export("json")).toEqual(builder.document.serialize("json"));
    expect(builder.document.export("yaml")).toEqual(builder.document.serialize("yaml"));
  });

  it("rejects a format the framework does not define", () => {
    const builder = create();
    const unsupported = "xml" as BuilderDocumentFormatName;

    for (const result of [
      builder.document.export(unsupported),
      builder.document.serialize(unsupported),
      builder.document.deserialize(unsupported, "{}"),
    ]) {
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error[0]).toMatchObject({
        code: "sdk.unsupported-format",
        severity: "error",
        metadata: { value: unsupported },
      });
    }
  });
});

describe("document serializer objects", () => {
  it("serializes like the method and deserializes like the method", () => {
    const builder = create();
    addNodeOrThrow(builder);
    const document: GraphDocument = builder.document.create();

    const serializer = builder.document.serializer("json");

    expect(serializer.serialize(document)).toEqual(builder.document.serialize("json"));
    expect(serializer.serialize(document)).toEqual(builder.document.export("json"));

    const text = textOf(builder.document.serialize("json"));
    const viaSerializer = serializer.deserialize(text);
    const viaMethod = builder.document.deserialize("json", text);
    expect(viaSerializer.ok).toBe(viaMethod.ok);
    if (!viaSerializer.ok || !viaMethod.ok) return;
    expect(viaSerializer.value.ok).toBe(viaMethod.value.ok);
    if (!viaSerializer.value.ok || !viaMethod.value.ok) return;
    expect(
      viaSerializer.value.value.getNodes().map((node) => String(node.id)),
    ).toEqual(viaMethod.value.value.getNodes().map((node) => String(node.id)));
  });
});

describe("document validation", () => {
  it("validates a created document and never throws for a non-object input", () => {
    const builder = create();
    addNodeOrThrow(builder);

    const valid = builder.document.validate(builder.document.create());
    expect(valid.documentValid).toBe(true);
    expect(valid.isValid).toBe(true);
    expect(valid.issues).toEqual([]);

    for (const input of [42, null, "not a document", []] as const) {
      const report = builder.document.validate(input);
      expect(report.documentValid).toBe(false);
      expect(report.isValid).toBe(false);
      expect(report.issues.map((issue) => issue.code)).toEqual([
        "document.malformed-document",
      ]);
    }
  });
});

describe("graph.exported emission", () => {
  it("emits one graph.exported per successful export and serialize", () => {
    const builder = create();
    addNodeOrThrow(builder);
    const graphId = String(builder.editor.graph.id);
    const exported: { readonly graphId: string; readonly format: string }[] = [];
    builder.editor.events.subscribe("graph.exported", (event) => {
      exported.push(event.payload);
    });

    const json = textOf(builder.document.export("json"));

    expect(json.length).toBeGreaterThan(0);
    expect(exported).toEqual([{ graphId, format: "json" }]);

    textOf(builder.document.serialize("yaml"));

    expect(exported).toEqual([
      { graphId, format: "json" },
      { graphId, format: "yaml" },
    ]);
  });

  it("never emits for deserialize, import, validate or a rejected format", () => {
    const builder = create();
    addNodeOrThrow(builder);
    const text = textOf(builder.document.serialize("json"));
    const document = builder.document.create();
    const exported: unknown[] = [];
    builder.editor.events.subscribe("graph.exported", (event) => {
      exported.push(event.payload);
    });

    builder.document.deserialize("json", text);
    builder.document.import(document);
    builder.document.validate(document);
    builder.document.export("xml" as BuilderDocumentFormatName);

    expect(exported).toEqual([]);
  });

  it("emits while still carrying the data the domain does not model", () => {
    const builder = create();
    const imported = builder.document.import({
      format: "ggd",
      version: "1.0.0",
      metadata: { id: "graph-demo", name: "Demo" },
      extensions: [],
      "x-vendor": { source: "acme" },
      graph: { nodes: [{ id: "node-a", type: REQUEST }], edges: [] },
    });
    expect(imported.ok).toBe(true);
    const exported: unknown[] = [];
    builder.editor.events.subscribe("graph.exported", (event) => {
      exported.push(event.payload);
    });

    const serialized: unknown = JSON.parse(textOf(builder.document.export("json")));

    expect(exported).toHaveLength(1);
    expect(field(serialized, "x-vendor")).toEqual({ source: "acme" });
  });
});
