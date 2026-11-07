import { describe, expect, it } from "vitest";
import { normalizeGraphDocument } from "./normalize.js";
import { validateGraphDocument } from "./validation.js";

/** Builds a normalized valid document to mutate for each rule. */
function validDocument(): Record<string, unknown> {
  const normalized = normalizeGraphDocument({
    format: "ggd",
    version: "1.0.0",
    metadata: { id: "graph-001", name: "Example graph" },
    graph: {
      nodes: [
        { id: "node-001", type: "example.input", version: "1.0.0" },
        { id: "node-002", type: "example.output" },
      ],
      edges: [
        {
          id: "edge-001",
          source: { nodeId: "node-001", portId: "out" },
          target: { nodeId: "node-002", portId: "in" },
        },
      ],
    },
  });
  if (!normalized.ok) throw new Error("fixture must be valid");
  return normalized.value as unknown as Record<string, unknown>;
}

describe("validateGraphDocument", () => {
  it("accepts a structurally valid document", () => {
    const report = validateGraphDocument(validDocument());
    expect(report.isValid).toBe(true);
    expect(report.documentValid).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("rejects a document with structural violations and reports where they are", () => {
    const report = validateGraphDocument({
      version: "abc",
      metadata: {},
      graph: { nodes: [{ type: "t" }], edges: [{ id: "e1" }] },
    });
    expect(report.isValid).toBe(false);
    expect(report.documentValid).toBe(false);
    const codes = report.issues.map((issue) => issue.code);
    expect(codes).toContain("document.invalid-format");
    expect(codes).toContain("document.invalid-version");
    expect(codes).toContain("document.missing-metadata-id");
    expect(codes).toContain("document.invalid-node");
    expect(codes).toContain("document.invalid-edge");
    expect(report.issues.every((issue) => issue.severity === "error")).toBe(true);
  });

  it("reports issues with propertyPaths locating the violation", () => {
    const report = validateGraphDocument({ format: "ggd", version: "nope" });
    const versionIssue = report.issues.find((issue) => issue.code === "document.invalid-version");
    expect(versionIssue?.propertyPath).toEqual(["version"]);
  });

  it("never mutates or repairs the inspected document", () => {
    const document = validDocument();
    const snapshot = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
    validateGraphDocument(document);
    expect(document).toEqual(snapshot);
  });
});
