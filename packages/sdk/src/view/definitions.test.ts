import { describe, expect, it } from "vitest";
import type { EdgeDefinition } from "@nodera/edge-registry";
import type { NodeDefinition } from "@nodera/node-registry";
import type { PortDeclaration } from "@nodera/graph-model";

import { toEdgeDefinitionView, toNodeDefinitionView, toPortView } from "./definitions.js";

/**
 * The definition half of the §9 vocabulary: a host reading a definition through
 * the SDK gets `type`/`label`, never the core `id`/`name`, and reads every port
 * with an explicit `required` flag instead of a numeric threshold.
 */

function httpDefinition(overrides: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    id: "http.request",
    name: "HTTP request",
    description: "Issues an HTTP request",
    category: "http",
    icon: "globe",
    version: "2.1.0",
    renderer: "http.request",
    ports: [
      { id: "url", direction: "input", name: "URL", dataType: "string", minConnections: 1 },
      { id: "out", direction: "output", dataType: "string" },
    ],
    properties: [{ id: "method", type: "string", label: "Method" }],
    ...overrides,
  };
}

function flowDefinition(overrides: Partial<EdgeDefinition> = {}): EdgeDefinition {
  return {
    id: "http.flow",
    name: "HTTP flow",
    version: "1.2.0",
    ...overrides,
  };
}

/** Keys a view must not carry: the core vocabulary it replaces. */
function expectNoCoreVocabulary(view: object): void {
  expect(Object.keys(view)).not.toContain("id");
  expect(Object.keys(view)).not.toContain("name");
}

describe("toPortView", () => {
  it("derives required from minConnections and keeps the connection bounds", () => {
    const required = toPortView({
      id: "url",
      direction: "input",
      minConnections: 1,
      maxConnections: 1,
    });

    expect(required.required).toBe(true);
    expect(required.minConnections).toBe(1);
    expect(required.maxConnections).toBe(1);

    const optional = toPortView({ id: "out", direction: "output" });

    expect(optional.required).toBe(false);
    expect("minConnections" in optional).toBe(false);
    expect("maxConnections" in optional).toBe(false);
  });

  it("treats a zero minimum as not required", () => {
    expect(toPortView({ id: "out", direction: "output", minConnections: 0 }).required).toBe(
      false,
    );
  });

  it("maps the visual renderer id and drops the visual envelope", () => {
    const view = toPortView({
      id: "url",
      direction: "input",
      name: "URL",
      dataType: "string",
      multiplicity: "multiple",
      maxConnections: null,
      visual: { renderer: "vendor.port" },
    });

    expect(view).toMatchObject({
      id: "url",
      direction: "input",
      name: "URL",
      dataType: "string",
      multiplicity: "multiple",
      maxConnections: null,
      renderer: "vendor.port",
      required: false,
    });
    expect("visual" in view).toBe(false);
  });

  it("omits every optional key instead of setting it to undefined", () => {
    const view = toPortView({ id: "out", direction: "output" });

    expect(Object.values(view).every((value) => value !== undefined)).toBe(true);
    expect(Object.keys(view)).toEqual(["id", "direction", "required"]);
  });
});

describe("toNodeDefinitionView", () => {
  it("publishes type and label where the core says id and name", () => {
    const view = toNodeDefinitionView(httpDefinition());

    expect(view.type).toBe("http.request");
    expect(view.label).toBe("HTTP request");
    expect(view.version).toBe("2.1.0");
    expect(view.category).toBe("http");
    expectNoCoreVocabulary(view);
  });

  it("carries every optional definition field the domain declares", () => {
    const view = toNodeDefinitionView(
      httpDefinition({
        connectionPolicy: { incoming: "allow", outgoing: "forbid" },
        visual: { color: "#123456", icon: "globe" },
        validationRuleIds: ["vendor.node-rule"],
        metadata: { vendor: "acme" },
      }),
    );

    expect(view).toMatchObject({
      description: "Issues an HTTP request",
      icon: "globe",
      renderer: "http.request",
      connectionPolicy: { incoming: "allow", outgoing: "forbid" },
      visual: { color: "#123456", icon: "globe" },
      validationRuleIds: ["vendor.node-rule"],
      metadata: { vendor: "acme" },
    });
  });

  it("maps every port and passes the property definitions through unchanged", () => {
    const definition = httpDefinition();
    const view = toNodeDefinitionView(definition);

    expect(view.ports.map((port) => [port.id, port.direction, port.required])).toEqual([
      ["url", "input", true],
      ["out", "output", false],
    ]);
    expect(view.properties).toEqual(definition.properties);
    expect(view.properties).toBe(definition.properties);
  });

  it("omits absent optional fields instead of setting them to undefined", () => {
    const view = toNodeDefinitionView({
      id: "demo.minimal",
      name: "Minimal",
      category: "demo",
      version: "1.0.0",
      ports: [],
      properties: [],
    });

    expect(Object.keys(view)).toEqual([
      "type",
      "version",
      "label",
      "category",
      "ports",
      "properties",
    ]);
    expect(Object.values(view).every((value) => value !== undefined)).toBe(true);
  });
});

describe("toEdgeDefinitionView", () => {
  it("publishes type and label where the core says id and name", () => {
    const view = toEdgeDefinitionView(flowDefinition());

    expect(view.type).toBe("http.flow");
    expect(view.label).toBe("HTTP flow");
    expect(view.version).toBe("1.2.0");
    expectNoCoreVocabulary(view);
  });

  it("keeps the authored default label separate from the definition label", () => {
    const view = toEdgeDefinitionView(flowDefinition({ label: "Request to response" }));

    expect(view.defaultLabel).toBe("Request to response");
    expect(view.label).toBe("HTTP flow");
  });

  it("echoes the authoring name customConditionId for the domain conditionId", () => {
    const view = toEdgeDefinitionView(flowDefinition({ conditionId: "vendor.is-success" }));

    expect(view.customConditionId).toBe("vendor.is-success");
    expect("conditionId" in view).toBe(false);
  });

  it("carries the remaining edge fields the domain declares", () => {
    const view = toEdgeDefinitionView(
      flowDefinition({
        description: "Data flows here",
        renderer: "http.flow",
        connectionTypes: ["data-flow"],
        allowedSourceNodeDefinitionIds: ["http.request"],
        allowedTargetNodeDefinitionIds: ["http.response"],
        visual: { lineStyle: "dashed" },
        contextualActions: [{ id: "vendor.edge.delete", label: "Delete" }],
        metadata: { vendor: "acme" },
      }),
    );

    expect(view).toMatchObject({
      description: "Data flows here",
      renderer: "http.flow",
      connectionTypes: ["data-flow"],
      allowedSourceNodeDefinitionIds: ["http.request"],
      allowedTargetNodeDefinitionIds: ["http.response"],
      contextualActions: [{ id: "vendor.edge.delete", label: "Delete" }],
      metadata: { vendor: "acme" },
    });
    expect(view.visual?.lineStyle).toBe("dashed");
  });

  it("omits absent optional fields instead of setting them to undefined", () => {
    const view = toEdgeDefinitionView(flowDefinition());

    expect(Object.keys(view)).toEqual(["type", "version", "label"]);
    expect(Object.values(view).every((value) => value !== undefined)).toBe(true);
  });
});

describe("the mapping functions are pure", () => {
  it("returns a fresh view on every call and never mutates the definition", () => {
    const definition = httpDefinition();
    const before = {
      ...definition,
      ports: definition.ports.map((port) => ({ ...port })),
      properties: definition.properties.map((property) => ({ ...property })),
    };

    const first = toNodeDefinitionView(definition);
    const second = toNodeDefinitionView(definition);

    expect(first).not.toBe(second);
    expect(first.ports).not.toBe(second.ports);
    expect(definition).toEqual(before);
  });

  it("never throws for a definition registered by the domain", () => {
    const port: PortDeclaration = { id: "in", direction: "input" };

    expect(() => toPortView(port)).not.toThrow();
    expect(() => toNodeDefinitionView(httpDefinition())).not.toThrow();
    expect(() => toEdgeDefinitionView(flowDefinition())).not.toThrow();
  });
});
