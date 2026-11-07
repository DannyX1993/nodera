import { describe, expect, it } from "vitest";
import { createEdgeId, createGraphId } from "@nodera/contracts";
import { Connection, Edge, Graph } from "@nodera/graph-model";
import { NodeRegistry } from "@nodera/node-registry";
import type { NodeDefinition } from "@nodera/node-registry";
import { NoderaDomain } from "./domain-facade.js";

const httpNode: NodeDefinition = {
  id: "vendor.http-request",
  name: "HTTP Request",
  category: "network",
  version: "1.0.0",
  ports: [
    { id: "response", name: "Response", direction: "output", dataType: "string" },
    { id: "target", name: "Target", direction: "input", dataType: "string" },
  ],
  properties: [{ id: "url", type: "string", required: true }],
};

const loggerNode: NodeDefinition = {
  id: "vendor.logger",
  name: "Logger",
  category: "utility",
  version: "1.0.0",
  ports: [
    { id: "message", name: "Message", direction: "input", dataType: "string" },
  ],
  properties: [],
};

function makeDomain(): { domain: NoderaDomain; graph: Graph } {
  const domain = new NoderaDomain();
  domain.nodes.register(httpNode);
  domain.nodes.register(loggerNode);
  return { domain, graph: new Graph(createGraphId("g1")) };
}

describe("NoderaDomain facade", () => {
  it("exposes no interface, React or React Flow dependency", () => {
    // Structural guarantee: the facade only composes domain packages.
    const { domain } = makeDomain();
    expect(domain.nodes).toBeInstanceOf(NodeRegistry);
    expect(domain.validators.validatorCount).toBe(0);
  });

  it("creates node instances from definitions without embedding them", () => {
    const { domain, graph } = makeDomain();
    const result = domain.createNode(graph, "vendor.http-request", {
      nodeId: "node-123",
      properties: { url: "https://example.com" },
    });
    expect(result).toMatchObject({ ok: true, value: { id: "node-123" } });
    if (!result.ok) return;
    expect(graph.getNode(result.value.id)?.definitionId).toBe("vendor.http-request");
    expect(graph.getNode(result.value.id)?.hasPort("response")).toBe(true);
    expect(graph.getNode(result.value.id)?.hasPort("target")).toBe(true);
  });

  it("generates instance ids distinct from the definition id", () => {
    const { domain, graph } = makeDomain();
    const result = domain.createNode(graph, "vendor.http-request");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).not.toBe("vendor.http-request");
    expect(result.value.id.startsWith("node-vendor-http-request-")).toBe(true);
  });

  it("rejects unknown definitions and invalid definitions", () => {
    const { domain, graph } = makeDomain();
    expect(domain.createNode(graph, "vendor.ghost")).toMatchObject({
      ok: false,
      error: { kind: "node-definition-not-found" },
    });
    domain.nodes.register({ ...httpNode, id: "vendor.invalid", name: "" });
    expect(domain.createNode(graph, "vendor.invalid")).toMatchObject({
      ok: false,
      error: { kind: "invalid-node-definition" },
    });
  });

  it("rejects duplicate instance ids", () => {
    const { domain, graph } = makeDomain();
    domain.createNode(graph, "vendor.http-request", { nodeId: "node-123" });
    expect(
      domain.createNode(graph, "vendor.http-request", { nodeId: "node-123" }),
    ).toMatchObject({ ok: false, error: { kind: "duplicate-node-id" } });
  });

  it("validates composed graphs and separates structural from configuration results", () => {
    const { domain, graph } = makeDomain();
    const http = domain.createNode(graph, "vendor.http-request", {
      nodeId: "node-123",
    });
    const logger = domain.createNode(graph, "vendor.logger", { nodeId: "node-456" });
    expect(http.ok && logger.ok).toBe(true);
    if (!http.ok || !logger.ok) return;
    graph.addEdge(
      new Edge(
        createEdgeId("e1"),
        new Connection(
          { nodeId: http.value.id, portId: "response" },
          { nodeId: logger.value.id, portId: "message" },
        ),
      ),
    );
    const report = domain.validate(graph);
    expect(report.structurallyValid).toBe(true);
    expect(report.configurationValid).toBe(false);
    expect(report.issues.map((i) => i.code)).toEqual(["domain.property.required"]);
    expect(report.issues[0]).toMatchObject({
      elementId: "node-123",
      propertyPath: ["url"],
    });
  });

  it("reports a fully valid graph when configuration is complete", () => {
    const { domain, graph } = makeDomain();
    const http = domain.createNode(graph, "vendor.http-request", {
      nodeId: "node-123",
      properties: { url: "https://example.com" },
    });
    const logger = domain.createNode(graph, "vendor.logger", { nodeId: "node-456" });
    if (!http.ok || !logger.ok) throw new Error("fixture failed");
    graph.addEdge(
      new Edge(
        createEdgeId("e1"),
        new Connection(
          { nodeId: http.value.id, portId: "response" },
          { nodeId: logger.value.id, portId: "message" },
        ),
      ),
    );
    const report = domain.validate(graph);
    expect(report.isValid).toBe(true);
    expect(report.issues).toEqual([]);
  });
});
