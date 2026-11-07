import { describe, expect, it } from "vitest";
import { GGD_FORMAT, normalizeGraphDocument, type GraphDocument } from "@nodera/document";
import { parseYamlDocument, serializeYaml } from "./index.js";

/** Builds a normalized spec-example document via the shared normalizer. */
function exampleDocument(): GraphDocument {
  const normalized = normalizeGraphDocument({
    format: GGD_FORMAT,
    version: "1.0.0",
    metadata: { id: "graph-001", name: "Example graph" },
    graph: {
      nodes: [
        {
          id: "node-001",
          type: "example.input",
          version: "1.0.0",
          position: { x: 100, y: 100 },
          properties: { value: "Hello world" },
        },
      ],
    },
  });
  if (!normalized.ok) throw new Error("fixture must be valid");
  return normalized.value;
}

describe("serializeYaml", () => {
  it("writes YAML carrying the same logical model as the JSON contract", () => {
    const result = serializeYaml(exampleDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected serialization");
    expect(result.value).toContain("format: ggd");
    expect(result.value).toContain("type: example.input");
  });

  it("refuses non-portable values instead of silently dropping them", () => {
    const document = exampleDocument();
    const withFunction = {
      ...document,
      graph: {
        ...document.graph,
        nodes: document.graph.nodes.map((node) => ({
          ...node,
          properties: { bad: () => "x" },
        })),
      },
    } as GraphDocument;
    const result = serializeYaml(withFunction);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.non-portable-value")).toBe(true);
  });
});

describe("parseYamlDocument", () => {
  it("round-trips a serialized document to an equivalent normalized document", () => {
    const source = exampleDocument();
    const serialized = serializeYaml(source);
    if (!serialized.ok) throw new Error("expected serialization");
    const parsed = parseYamlDocument(serialized.value);
    expect(parsed).toEqual({ ok: true, value: source });
  });

  it("preserves unknown fields through a full round-trip", () => {
    const document = exampleDocument();
    const withVendor = {
      ...document,
      vendorField: { preserved: true },
      graph: {
        ...document.graph,
        nodes: document.graph.nodes.map((node) => ({ ...node, vendorNodeField: 7 })),
      },
    } as GraphDocument;
    const serialized = serializeYaml(withVendor);
    if (!serialized.ok) throw new Error("expected serialization");
    const parsed = parseYamlDocument(serialized.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected parse");
    expect((parsed.value as unknown as Record<string, unknown>)["vendorField"]).toEqual({
      preserved: true,
    });
    const firstNode = parsed.value.graph.nodes[0] as unknown as Record<string, unknown> | undefined;
    expect(firstNode?.["vendorNodeField"]).toBe(7);
  });

  it("reports invalid YAML with a parse.* diagnostic and never throws", () => {
    const result = parseYamlDocument("key: [unclosed");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.length).toBe(1);
    expect(result.error[0]?.code).toBe("parse.invalid-yaml");
    expect(result.error[0]?.severity).toBe("error");
  });

  it("rejects YAML that does not describe an object", () => {
    const result = parseYamlDocument("just a scalar");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.malformed-document")).toBe(true);
  });

  it("passes structural document issues through from the shared normalizer", () => {
    const result = parseYamlDocument(
      ["format: ggd", "version: 1.0.0", "metadata:", "  name: no id", "graph:", "  nodes: []"].join("\n"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.missing-metadata-id")).toBe(true);
  });
});
