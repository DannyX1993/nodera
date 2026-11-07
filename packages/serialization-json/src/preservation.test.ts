import { describe, expect, it } from "vitest";
import type { NodeId } from "@nodera/contracts";
import { documentToGraph, graphToDocument } from "@nodera/document";
import { parseJsonDocument, serializeJson } from "./index.js";

const SOURCE_TEXT = `{
  "format": "ggd",
  "version": "1.0.0",
  "metadata": { "id": "graph-001", "name": "Example", "vendorMeta": { "kept": true } },
  "vendorField": "top-level unknown",
  "extensions": [
    { "id": "example.nodes", "version": "1.0.0" },
    { "id": "acme.futureThing", "version": "2.0.0" }
  ],
  "graph": {
    "nodes": [
      {
        "id": "node-001",
        "type": "acme.unknownNodeType",
        "version": "2.0.0",
        "position": { "x": 10, "y": 20 },
        "properties": { "futureProp": "kept" },
        "vendorNodeField": 7
      },
      { "id": "node-002", "type": "acme.unknownNodeType" }
    ],
    "edges": [],
    "groups": [{ "id": "g1", "members": ["node-001"], "customAspect": "kept" }],
    "vendorGraphField": { "deep": { "value": 1 } }
  }
}`;

describe("unknown node and field preservation", () => {
  it("is lossless through text → document → text, including unknowns", () => {
    const parsed = parseJsonDocument(SOURCE_TEXT);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected parse");
    const text = serializeJson(parsed.value);
    expect(text.ok).toBe(true);
    if (!text.ok) throw new Error("expected serialization");

    const finalRound = JSON.parse(text.value) as Record<string, unknown>;
    const source = JSON.parse(SOURCE_TEXT) as Record<string, unknown>;
    expect(finalRound).toEqual(source);
  });

  it("keeps the text → document → text cycle byte-stable after the first pass", () => {
    const first = parseJsonDocument(SOURCE_TEXT);
    if (!first.ok) throw new Error("expected parse");
    const firstText = serializeJson(first.value);
    if (!firstText.ok) throw new Error("expected serialization");
    const second = parseJsonDocument(firstText.value);
    if (!second.ok) throw new Error("expected parse");
    const secondText = serializeJson(second.value);
    expect(secondText).toEqual(firstText);
  });

  it("survives the graph boundary: unknown node types and domain data round-trip", () => {
    const parsed = parseJsonDocument(SOURCE_TEXT);
    if (!parsed.ok) throw new Error("expected parse");
    const rebuild = documentToGraph(parsed.value);
    expect(rebuild.ok).toBe(true);
    if (!rebuild.ok) throw new Error("expected graph");
    const graph = rebuild.value;
    expect(graph.getNode("node-001" as NodeId)?.definitionId).toBe("acme.unknownNodeType");

    const exported = graphToDocument(graph, { formatVersion: "1.0.0" });
    const firstNode = exported.graph.nodes[0];
    expect(firstNode?.type).toBe("acme.unknownNodeType");
    expect(firstNode?.version).toBe("2.0.0");
    expect(firstNode?.position).toEqual({ x: 10, y: 20 });
    expect(firstNode?.properties).toEqual({ futureProp: "kept" });
    expect(graph.nodeCount).toBe(2);
    const back = parseJsonDocument(JSON.stringify(exported));
    expect(back.ok).toBe(true);
  });

  it("never mutates the parsed document when importing into the domain", () => {
    const parsed = parseJsonDocument(SOURCE_TEXT);
    if (!parsed.ok) throw new Error("expected parse");
    const before = JSON.stringify(parsed.value);
    documentToGraph(parsed.value);
    expect(JSON.stringify(parsed.value)).toBe(before);
  });
});
