import { describe, expect, it } from "vitest";
import type { PortDeclaration } from "@nodera/graph-model";
import type { PropertyDefinition } from "@nodera/property-system";
import type { NodeDefinition } from "./node-definition.js";
import { NodeRegistry } from "./node-registry.js";
import { validateNodeDefinition } from "./validate.js";

const inputPort: PortDeclaration = { id: "in", name: "In", direction: "input" };
const outputPort: PortDeclaration = { id: "out", direction: "output" };

function makeDefinition(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    id: "vendor.http-request",
    name: "HTTP Request",
    category: "network",
    version: "1.0.0",
    ports: [inputPort, outputPort],
    properties: [
      { id: "url", type: "string", required: true },
      { id: "method", type: "select", options: [{ value: "GET", label: "GET" }] },
    ],
    ...overrides,
  };
}

describe("NodeRegistry", () => {
  it("registers, queries by id, category and lists all", () => {
    const registry = new NodeRegistry();
    expect(registry.register(makeDefinition())).toMatchObject({ ok: true, value: { id: "vendor.http-request" } });
    registry.register(makeDefinition({ id: "vendor.log", name: "Log", category: "utility" }));

    expect(registry.get("vendor.http-request")?.name).toBe("HTTP Request");
    expect(registry.has("vendor.log")).toBe(true);
    expect(registry.require("missing")).toMatchObject({ ok: false, error: { kind: "not-found" } });
    expect(registry.byCategory("network").map((d) => d.id)).toEqual(["vendor.http-request"]);
    expect(registry.categories()).toEqual(["network", "utility"]);
    expect(registry.size).toBe(2);
  });

  it("detects duplicate ids instead of overwriting", () => {
    const registry = new NodeRegistry();
    registry.register(makeDefinition());
    expect(registry.register(makeDefinition())).toMatchObject({
      ok: false,
      error: {
        kind: "duplicate-id",
        id: "vendor.http-request",
        message: 'NodeRegistry already contains a definition with id "vendor.http-request"',
      },
    });
    expect(registry.size).toBe(1);
  });

  it("replaces definitions explicitly and never inserts through replace", () => {
    const registry = new NodeRegistry();
    registry.register(makeDefinition());
    const updated = makeDefinition({ version: "1.1.0" });
    expect(registry.replace(updated)).toMatchObject({ ok: true, value: { version: "1.1.0" } });
    expect(registry.get("vendor.http-request")?.version).toBe("1.1.0");

    const inserted = makeDefinition({ id: "vendor.other", name: "Other" });
    expect(registry.replace(inserted)).toMatchObject({ ok: false, error: { kind: "not-found" } });
    expect(registry.size).toBe(1);
  });

  it("unregisters definitions and reports unknown ones", () => {
    const registry = new NodeRegistry();
    registry.register(makeDefinition());
    expect(registry.unregister("vendor.http-request")).toMatchObject({ ok: true, value: { id: "vendor.http-request" } });
    expect(registry.has("vendor.http-request")).toBe(false);
    expect(registry.unregister("vendor.http-request")).toMatchObject({ ok: false, error: { kind: "not-found" } });
  });
});

describe("validateNodeDefinition", () => {
  it("accepts a complete definition", () => {
    expect(validateNodeDefinition(makeDefinition())).toEqual([]);
  });

  it("rejects non-qualified ids, empty names and bad versions", () => {
    const issues = validateNodeDefinition(
      makeDefinition({ id: "http", name: "  ", version: "1.0" }),
    );
    expect(issues.map((i) => i.code)).toEqual([
      "node-definition.qualified-id",
      "node-definition.missing-name",
      "node-definition.version",
    ]);
  });

  it("detects duplicate port and property ids", () => {
    const issues = validateNodeDefinition(
      makeDefinition({
        ports: [inputPort, { ...inputPort }],
        properties: [
          { id: "url", type: "string" },
          { id: "url", type: "string" },
        ],
      }),
    );
    expect(issues.map((i) => i.code)).toEqual([
      "node-definition.duplicate-port-id",
      "node-definition.duplicate-property-id",
    ]);
  });

  it("detects select properties without options and custom without component", () => {
    const issues = validateNodeDefinition(
      makeDefinition({
        properties: [
          { id: "pick", type: "select" },
          { id: "widget", type: "custom" },
          { id: "loop", type: "string", dependsOn: ["loop"] },
        ],
      }),
    );
    expect(issues.map((i) => i.code)).toEqual([
      "node-definition.select-without-options",
      "node-definition.custom-without-component",
      "node-definition.self-dependency",
    ]);
  });
});
