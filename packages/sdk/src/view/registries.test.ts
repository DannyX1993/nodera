import { describe, expect, it } from "vitest";

import type { EdgeDefinitionInput } from "../authoring/edges.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";

/**
 * The definition registries a host reads.
 *
 * `builder.registries.nodes`/`.edges` are read adapters: every value they hand
 * back speaks the §9 vocabulary (`type`/`label`), and the only mutation they
 * expose is the one whose result a host needs — unregistering, which returns
 * the removed view.
 */

const REQUEST = "http.request";
const RESPONSE = "http.response";
const FLOW = "http.flow";

function nodeInput(type: string, category: string): NodeDefinitionInput {
  return {
    type,
    version: "1.0.0",
    label: type,
    category,
    ports: { inputs: [{ id: "in" }], outputs: [{ id: "out" }] },
  };
}

function edgeInput(overrides: Partial<EdgeDefinitionInput> = {}): EdgeDefinitionInput {
  return { type: FLOW, label: "HTTP flow", ...overrides };
}

function create(): Builder {
  const result = createBuilder({
    registry: {
      nodes: [nodeInput(REQUEST, "http"), nodeInput(RESPONSE, "http"), nodeInput("db.row", "data")],
      edges: [edgeInput({ connectionTypes: ["data-flow"] })],
    },
  });
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

describe("the node definition read adapter", () => {
  it("returns §9 views from every read", () => {
    const builder = create();

    expect(builder.registries.nodes.size).toBe(3);
    expect(builder.registries.nodes.all().map((view) => view.type)).toEqual([
      REQUEST,
      RESPONSE,
      "db.row",
    ]);
    expect(builder.registries.nodes.has(REQUEST)).toBe(true);
    expect(builder.registries.nodes.has("http.missing")).toBe(false);

    const view = builder.registries.nodes.get(REQUEST);
    expect(view).toMatchObject({ type: REQUEST, label: REQUEST, category: "http" });
    expect(Object.keys(view ?? {})).not.toContain("id");
    expect(Object.keys(view ?? {})).not.toContain("name");
  });

  it("groups by category and lists the categories in use", () => {
    const builder = create();

    expect(builder.registries.nodes.byCategory("http").map((view) => view.type)).toEqual([
      REQUEST,
      RESPONSE,
    ]);
    expect(builder.registries.nodes.byCategory("missing")).toEqual([]);
    expect(builder.registries.nodes.categories()).toEqual(["data", "http"]);
  });

  it("reports an unknown type through require instead of throwing", () => {
    const builder = create();

    const missing = builder.registries.nodes.require("http.missing");

    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error).toHaveLength(1);
    expect(missing.error[0]).toMatchObject({
      code: "sdk.unknown-definition",
      severity: "error",
      path: ["type"],
      metadata: { value: "http.missing" },
    });
    expect(missing.error[0]?.message).toContain("http.missing");
  });

  it("returns the view for a known type", () => {
    const builder = create();

    const found = builder.registries.nodes.require(REQUEST);

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.type).toBe(REQUEST);
  });

  it("returns the removed definition when a host unregisters it", () => {
    const builder = create();

    const removed = builder.registries.nodes.unregister(REQUEST);

    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.type).toBe(REQUEST);
    expect(builder.registries.nodes.has(REQUEST)).toBe(false);
    expect(builder.registries.nodes.size).toBe(2);

    const again = builder.registries.nodes.unregister(REQUEST);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error[0]).toMatchObject({ code: "sdk.unknown-definition" });
  });

  it("refuses to unregister after dispose and keeps every read working", () => {
    const builder = create();
    builder.dispose();

    const removed = builder.registries.nodes.unregister(REQUEST);
    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error[0]).toMatchObject({ code: "sdk.disposed" });

    expect(builder.registries.nodes.size).toBe(3);
    expect(builder.registries.nodes.get(REQUEST)?.type).toBe(REQUEST);
    expect(builder.registries.nodes.require(REQUEST).ok).toBe(true);
  });
});

describe("the edge definition read adapter", () => {
  it("returns §9 views from every read", () => {
    const builder = create();

    expect(builder.registries.edges.size).toBe(1);
    expect(builder.registries.edges.all().map((view) => view.type)).toEqual([FLOW]);
    expect(builder.registries.edges.has(FLOW)).toBe(true);

    const view = builder.registries.edges.get(FLOW);
    expect(view).toMatchObject({ type: FLOW, label: "HTTP flow", version: "1.0.0" });
    expect(Object.keys(view ?? {})).not.toContain("id");
    expect(Object.keys(view ?? {})).not.toContain("name");
  });

  it("groups by the connection types the domain declares", () => {
    const builder = create();

    expect(
      builder.registries.edges.byConnectionType("data-flow").map((view) => view.type),
    ).toEqual([FLOW]);
    expect(builder.registries.edges.byConnectionType("control-flow")).toEqual([]);
  });

  it("reports an unknown type through require instead of throwing", () => {
    const builder = create();

    const missing = builder.registries.edges.require("http.missing");

    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error[0]).toMatchObject({ code: "sdk.unknown-definition" });
  });

  it("returns the removed definition when a host unregisters it", () => {
    const builder = create();

    const removed = builder.registries.edges.unregister(FLOW);

    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.value.type).toBe(FLOW);
    expect(builder.registries.edges.size).toBe(0);
  });

  it("refuses to unregister after dispose and keeps every read working", () => {
    const builder = create();
    builder.dispose();

    const removed = builder.registries.edges.unregister(FLOW);
    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error[0]).toMatchObject({ code: "sdk.disposed" });
    expect(builder.registries.edges.size).toBe(1);
  });
});

describe("registration through the builder reports views", () => {
  it("returns the §9 view from registerNode and registerEdge", () => {
    const builder = createBuilder();
    if (!builder.ok) {
      throw new Error("the default builder must compose");
    }

    const node = builder.value.registerNode(nodeInput("acme.node", "acme"));
    expect(node.ok).toBe(true);
    if (!node.ok) return;
    expect(node.value.type).toBe("acme.node");
    expect(Object.keys(node.value)).not.toContain("id");

    const edge = builder.value.registerEdge({ type: "acme.edge", label: "Acme edge" });
    expect(edge.ok).toBe(true);
    if (!edge.ok) return;
    expect(edge.value.type).toBe("acme.edge");
    expect(Object.keys(edge.value)).not.toContain("name");
  });
});
