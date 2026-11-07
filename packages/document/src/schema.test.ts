import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "../schema/ggd-1.0.0.schema.json" with { type: "json" };

/** Builds a minimal well-formed GGD 1.0.0 document per the spec example. */
function specExample(): Record<string, unknown> {
  return {
    format: "ggd",
    version: "1.0.0",
    metadata: {
      id: "graph-001",
      name: "Example graph",
      description: "A graph with one node and one edge",
      tags: ["demo", "example"],
    },
    extensions: [
      { id: "example.nodes", version: "1.0.0" },
    ],
    graph: {
      nodes: [
        {
          id: "node-001",
          type: "example.input",
          version: "1.0.0",
          position: { x: 100, y: 100 },
          properties: { value: "Hello" },
          metadata: { author: "dev" },
          ports: [
            { id: "in", direction: "input", declarationId: "in-def" },
            { id: "out", direction: "output" },
          ],
        },
      ],
      edges: [
        {
          id: "edge-001",
          type: "example.link",
          source: { nodeId: "node-001", portId: "out", direction: "output" },
          target: { nodeId: "node-002", portId: "in", direction: "input" },
          label: "connects",
          metadata: { weight: 1 },
        },
      ],
    },
  };
}

const ajv = new Ajv2020({ allErrors: true });

describe("GGD 1.0.0 JSON Schema (Draft 2020-12)", () => {
  it("compiles without error", () => {
    const validate = ajv.compile(schema);
    expect(validate).toBeDefined();
  });

  it("validates the spec-example document", () => {
    const validate = ajv.compile(schema);
    const result = validate(specExample());
    expect(result).toBe(true);
    if (!result) throw new Error("expected validation to pass");
    // No errors should be present
    expect(validate.errors).toBeNull();
  });

  it("rejects missing metadata.id with error at /metadata", () => {
    const doc = specExample();
    delete (doc.metadata as Record<string, unknown>)["id"];
    const validate = ajv.compile(schema);
    const result = validate(doc);
    expect(result).toBe(false);
    if (!result) {
      expect(
        validate.errors!.some((e: { instancePath: string }) => e.instancePath === "/metadata"),
      ).toBe(true);
    }
  });

  it("rejects version 'abc' with error at /version", () => {
    const doc = specExample();
    (doc as Record<string, unknown>)["version"] = "abc";
    const validate = ajv.compile(schema);
    const result = validate(doc);
    expect(result).toBe(false);
    if (!result) {
      expect(
        validate.errors!.some((e: { instancePath: string }) => e.instancePath === "/version"),
      ).toBe(true);
    }
  });

  it("rejects format 'not-ggd'", () => {
    const doc = specExample();
    (doc as Record<string, unknown>)["format"] = "not-ggd";
    const validate = ajv.compile(schema);
    const result = validate(doc);
    expect(result).toBe(false);
    if (!result) {
      expect(
        validate.errors!.some((e: { instancePath: string }) => e.instancePath === "/format"),
      ).toBe(true);
    }
  });

  it("rejects settings.selfLoops 'maybe'", () => {
    const doc = specExample();
    const graph = doc.graph as Record<string, unknown>;
    graph["settings"] = {
      selfLoops: "maybe" as unknown,
    };
    const validate = ajv.compile(schema);
    const result = validate(doc);
    expect(result).toBe(false);
    if (!result) {
      expect(
        validate.errors!.some(
          (e: { instancePath: string }) => e.instancePath === "/graph/settings/selfLoops",
        ),
      ).toBe(true);
    }
  });

  it("preserves unknown top-level, node-level and metadata-level vendor fields", () => {
    const doc = specExample();
    (doc as Record<string, unknown>)["vendorTop"] = { data: true };
    (doc.metadata as Record<string, unknown>)["vendorMeta"] = "kept";
    const graph = doc.graph as Record<string, unknown>;
    const nodes = graph.nodes as Record<string, unknown>[];
    const node = nodes[0] as Record<string, unknown>;
    node["unknownProp"] = 42;
    const validate = ajv.compile(schema);
    const result = validate(doc);
    expect(result).toBe(true);
    if (!result) throw new Error("expected validation to pass with unknown fields");
  });
});