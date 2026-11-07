import { describe, expect, it } from "vitest";
import type { EdgeDefinition } from "./edge-definition.js";
import { EdgeRegistry } from "./edge-registry.js";
import { validateEdgeDefinition } from "./validate.js";

function makeDefinition(overrides: Partial<EdgeDefinition> = {}): EdgeDefinition {
  return {
    id: "vendor.data-flow",
    name: "Data Flow",
    version: "1.0.0",
    connectionTypes: ["data-flow"],
    visual: { lineStyle: "solid", geometry: "bezier", arrowEnd: true },
    contextualActions: [{ id: "vendor.edge.delete", label: "Delete" }],
    ...overrides,
  };
}

describe("EdgeRegistry", () => {
  it("registers, queries by id and by connection type", () => {
    const registry = new EdgeRegistry();
    registry.register(makeDefinition());
    registry.register(
      makeDefinition({ id: "vendor.control-flow", connectionTypes: ["control-flow"] }),
    );
    expect(registry.get("vendor.data-flow")?.name).toBe("Data Flow");
    expect(registry.byConnectionType("data-flow").map((d) => d.id)).toEqual(["vendor.data-flow"]);
    expect(registry.byConnectionType("missing")).toEqual([]);
    expect(registry.require("missing")).toMatchObject({ ok: false, error: { kind: "not-found" } });
    expect(registry.size).toBe(2);
  });

  it("rejects duplicates and supports explicit replace and unregister", () => {
    const registry = new EdgeRegistry();
    registry.register(makeDefinition());
    expect(registry.register(makeDefinition())).toMatchObject({
      ok: false,
      error: { kind: "duplicate-id", id: "vendor.data-flow" },
    });
    expect(registry.replace(makeDefinition({ version: "2.0.0" }))).toMatchObject({
      ok: true,
      value: { version: "2.0.0" },
    });
    expect(registry.replace(makeDefinition({ id: "vendor.other", name: "Other" }))).toMatchObject({
      ok: false,
      error: { kind: "not-found" },
    });
    expect(registry.unregister("vendor.data-flow").ok).toBe(true);
    expect(registry.size).toBe(0);
  });
});

describe("validateEdgeDefinition", () => {
  it("accepts a complete definition", () => {
    expect(validateEdgeDefinition(makeDefinition())).toEqual([]);
  });

  it("rejects bad ids, names, versions and empty connection types", () => {
    const issues = validateEdgeDefinition(
      makeDefinition({ id: "flow", name: " ", version: "v1", connectionTypes: [""] }),
    );
    expect(issues.map((i) => i.code)).toEqual([
      "edge-definition.qualified-id",
      "edge-definition.missing-name",
      "edge-definition.version",
      "edge-definition.connection-type",
    ]);
  });

  it("detects duplicate contextual action ids", () => {
    const issues = validateEdgeDefinition(
      makeDefinition({
        contextualActions: [
          { id: "a", label: "A" },
          { id: "a", label: "A again" },
        ],
      }),
    );
    expect(issues.map((i) => i.code)).toEqual(["edge-definition.duplicate-action-id"]);
  });
});
