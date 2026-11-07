import { describe, expect, it } from "vitest";
import type { GraphDocument } from "@nodera/document";
import {
  normalizeGraphDocument,
  GGD_FORMAT,
} from "@nodera/document";
import { parseJsonDocument } from "./index.js";
import { serializeJson } from "./index.js";

/** Spec-example-style normalized document fixture. */
function exampleDocument(): GraphDocument {
  const normalized = normalizeGraphDocument({
    format: GGD_FORMAT,
    version: "1.0.0",
    metadata: { id: "graph-001", name: "Example graph" },
    extensions: [{ id: "example.nodes", version: "1.0.0" }],
    graph: {
      nodes: [
        {
          id: "node-001",
          type: "example.input",
          version: "1.0.0",
          position: { x: 100, y: 100 },
          properties: { value: "Hello world" },
          metadata: {},
        },
      ],
    },
  });
  if (!normalized.ok) throw new Error("fixture must be valid");
  return normalized.value;
}

describe("serializeJson", () => {
  it("writes stable, pretty JSON with the ggd format marker", () => {
    const result = serializeJson(exampleDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected serialization");
    const text = result.value;
    expect(text).toContain('"format": "ggd"');
    expect(text).toBe(JSON.stringify(exampleDocument(), null, 2));
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
    const result = serializeJson(withFunction);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.non-portable-value")).toBe(true);
  });
});

describe("parseJsonDocument", () => {
  it("round-trips a serialized document to an equivalent normalized document", () => {
    const source = exampleDocument();
    const serialized = serializeJson(source);
    if (!serialized.ok) throw new Error("expected serialization");
    const parsed = parseJsonDocument(serialized.value);
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
    const serialized = serializeJson(withVendor);
    if (!serialized.ok) throw new Error("expected serialization");
    const parsed = parseJsonDocument(serialized.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected parse");
    expect((parsed.value as unknown as Record<string, unknown>)["vendorField"]).toEqual({
      preserved: true,
    });
    const firstNode = parsed.value.graph.nodes[0] as unknown as Record<string, unknown> | undefined;
    expect(firstNode?.["vendorNodeField"]).toBe(7);
  });

  it("reports invalid JSON with a parse.* diagnostic and never throws", () => {
    const result = parseJsonDocument("{ not json");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.length).toBe(1);
    expect(result.error[0]?.code).toBe("parse.invalid-json");
    expect(result.error[0]?.severity).toBe("error");
  });

  it("passes structural document issues through from the shared normalizer", () => {
    const missingId = parseJsonDocument(
      '{"format":"ggd","version":"1.0.0","metadata":{"name":"x"},"graph":{"nodes":[]}}',
    );
    for (const candidate of [missingId]) {
      expect(candidate.ok).toBe(false);
      if (candidate.ok) throw new Error("expected rejection");
      expect(candidate.error.some((issue) => issue.code === "document.missing-metadata-id")).toBe(true);
    }
  });
});
