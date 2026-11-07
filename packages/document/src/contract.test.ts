import { describe, expect, it } from "vitest";
import { normalizeGraphDocument } from "./normalize.js";
import { GGD_FORMAT } from "./types.js";

/** Builds a minimal well-formed raw document with overrides. */
function rawDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: GGD_FORMAT,
    version: "1.0.0",
    metadata: { id: "graph-001", name: "Example graph" },
    graph: { nodes: [] },
    ...overrides,
  };
}

describe("GGD format constant", () => {
  it("is the canonical format marker from the specification", () => {
    expect(GGD_FORMAT).toBe("ggd");
  });
});

describe("normalizeGraphDocument", () => {
  it("accepts the specification example shape and fills defaulted arrays", () => {
    const result = normalizeGraphDocument(
      rawDocument({
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
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        format: "ggd",
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
          edges: [],
          groups: [],
        },
      },
    });
  });

  it("preserves unknown fields at document, metadata, node and group level", () => {
    const result = normalizeGraphDocument(
      rawDocument({
        vendorField: { preserved: true },
        metadata: { id: "graph-001", vendorMeta: "kept" },
        graph: {
          nodes: [{ id: "n1", type: "t", unknownProp: 7 }],
          groups: [{ id: "g1", members: ["n1"], customAspect: "kept" }],
        },
      }),
    );
    if (!result.ok) throw new Error("expected a valid document");
    const raw = result.value as unknown as Record<string, unknown>;
    expect(raw["vendorField"]).toEqual({ preserved: true });
    expect((result.value.metadata as unknown as Record<string, unknown>)["vendorMeta"]).toBe("kept");
    const firstNode = result.value.graph.nodes[0] as unknown as Record<string, unknown> | undefined;
    expect(firstNode?.["unknownProp"]).toBe(7);
    expect(result.value.graph.groups).toEqual([
      { id: "g1", members: ["n1"], customAspect: "kept" },
    ]);
  });

  it("rejects non-object input with a document.* diagnostic", () => {
    const result = normalizeGraphDocument("nope");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.length).toBeGreaterThan(0);
    expect(result.error[0]?.code).toMatch(/^document\./);
    expect(result.error[0]?.severity).toBe("error");
  });

  it("rejects a missing or wrong format marker", () => {
    const missing = normalizeGraphDocument(rawDocument({ format: undefined }));
    const wrong = normalizeGraphDocument(rawDocument({ format: "not-ggd" }));
    for (const result of [missing, wrong]) {
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected rejection");
      expect(result.error.some((issue) => issue.code === "document.invalid-format")).toBe(true);
    }
  });

  it("rejects a missing, non-string or non-semver version", () => {
    for (const version of [undefined, 1, "1", "abc", "1.0.0.0"]) {
      const result = normalizeGraphDocument(rawDocument({ version }));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected rejection");
      expect(result.error.some((issue) => issue.code === "document.invalid-version")).toBe(true);
    }
  });

  it("rejects a document without a metadata id", () => {
    const result = normalizeGraphDocument(rawDocument({ metadata: { name: "no id" } }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.missing-metadata-id")).toBe(true);
  });

  it("rejects a document whose graph nodes are missing or not an array", () => {
    for (const nodes of [undefined, {}]) {
      const result = normalizeGraphDocument(rawDocument({ graph: { nodes } }));
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected rejection");
      expect(result.error.some((issue) => issue.code === "document.missing-graph-nodes")).toBe(true);
    }
  });

  it("rejects nodes without id or type, and non-semver node versions", () => {
    const result = normalizeGraphDocument(
      rawDocument({
        graph: {
          nodes: [{ id: "n1" }, { type: "t" }, { id: "n2", type: "t", version: "bad" }],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    const codes = result.error.map((issue) => issue.code);
    expect(codes).toContain("document.invalid-node");
    expect(codes).toContain("document.invalid-node-version");
  });

  it("rejects extensions entries without id or version", () => {
    const result = normalizeGraphDocument(
      rawDocument({ extensions: [{ id: "only.id" }, { version: "1.0.0" }, "garbage"] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.invalid-extension")).toBe(true);
  });

  it("accepts an edges array and rejects malformed edges and endpoints", () => {
    const good = normalizeGraphDocument(
      rawDocument({
        graph: {
          nodes: [{ id: "a", type: "t" }, { id: "b", type: "t" }],
          edges: [
            {
              id: "e1",
              source: { nodeId: "a", portId: "out" },
              target: { nodeId: "b", portId: "in" },
            },
          ],
        },
      }),
    );
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.value.graph.edges).toHaveLength(1);

    const bad = normalizeGraphDocument(
      rawDocument({
        graph: {
          nodes: [{ id: "a", type: "t" }, { id: "b", type: "t" }],
          edges: [{ source: { nodeId: "a" }, target: {} }],
        },
      }),
    );
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("expected rejection");
    expect(bad.error.some((issue) => issue.code === "document.invalid-edge")).toBe(true);
  });

  it("rejects invalid graph settings", () => {
    const result = normalizeGraphDocument(
      rawDocument({ graph: { nodes: [], settings: { selfLoops: "maybe" } } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.invalid-settings")).toBe(true);
  });

  it("rejects edge endpoints with an unknown port direction", () => {
    const result = normalizeGraphDocument(
      rawDocument({
        graph: {
          nodes: [{ id: "a", type: "t" }, { id: "b", type: "t" }],
          edges: [
            {
              id: "e1",
              source: { nodeId: "a", portId: "out", direction: "north" },
              target: { nodeId: "b", portId: "in" },
            },
          ],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.invalid-endpoint-direction")).toBe(true);
  });

  it("rejects non-portable values such as functions inside properties", () => {
    const result = normalizeGraphDocument(
      rawDocument({
        graph: {
          nodes: [{ id: "n1", type: "t", properties: { bad: () => "x" } }],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.non-portable-value")).toBe(true);
  });

  it("rejects node ports without id or a valid direction", () => {
    const result = normalizeGraphDocument(
      rawDocument({
        graph: {
          nodes: [
            { id: "n1", type: "t", ports: [{ direction: "input" }, { id: "p2", direction: "south" }] },
          ],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.invalid-port")).toBe(true);
  });
});
