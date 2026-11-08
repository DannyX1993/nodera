import { describe, expect, it } from "vitest";

import {
  ADAPTER_CAPABILITIES,
  assertOk,
  createBuilder,
  type AdapterCapability,
  type Builder,
  type EdgeDefinitionInput,
  type NodeDefinitionInput,
} from "@nodera/sdk";

import { createReactFlowAdapter } from "./react-flow-adapter.js";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const NODE_RENDERER = (): null => null;
const EDGE_RENDERER = (): null => null;
const PROPERTY_COMPONENT = (): null => null;

/** A node that exercises every renderer slot the adapter can honour. */
const NODE: NodeDefinitionInput = {
  type: "acme.http-request",
  label: "HTTP request",
  category: "acme",
  renderer: NODE_RENDERER,
  ports: {
    inputs: [{ id: "in", renderer: "acme.port.pill" }],
    outputs: [{ id: "out" }],
  },
  properties: [
    { id: "url", type: "string", component: PROPERTY_COMPONENT },
  ],
};

/** An edge that exercises the edge renderer and the visual-style slot. */
const EDGE: EdgeDefinitionInput = {
  type: "acme.data-flow",
  label: "Data flow",
  renderer: EDGE_RENDERER,
  style: { lineStyle: "dashed" },
};

function buildWith(adapter = createReactFlowAdapter()): Builder {
  return assertOk(
    createBuilder({
      adapter,
      registry: { nodes: [NODE], edges: [EDGE] },
    }),
  );
}

function unsupportedCapabilities(builder: Builder): readonly string[] {
  return builder.diagnostics
    .filter((issue) => issue.code === "sdk.renderer-unsupported")
    .map((issue) => String(issue.metadata?.["capability"]));
}

/* ------------------------------------------------------------------ */
/*  Identity and capabilities                                          */
/* ------------------------------------------------------------------ */

describe("createReactFlowAdapter", () => {
  it("declares the stable engine identity", () => {
    const adapter = createReactFlowAdapter();
    expect(adapter.id).toBe("nodera.react-flow");
    expect(adapter.label).toBe("React Flow");
  });

  it("declares every capability by default", () => {
    const adapter = createReactFlowAdapter();
    expect(Object.keys(adapter.capabilities).sort()).toEqual([...ADAPTER_CAPABILITIES].sort());
    for (const capability of ADAPTER_CAPABILITIES) {
      expect(adapter.capabilities[capability]).toBe(true);
    }
  });

  it("narrows the declared capabilities without dropping the rest", () => {
    const adapter = createReactFlowAdapter({ capabilities: { minimap: false } });
    const narrowed: readonly AdapterCapability[] = ["minimap"];
    for (const capability of ADAPTER_CAPABILITIES) {
      expect(adapter.capabilities[capability]).toBe(!narrowed.includes(capability));
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Composition with createBuilder                                     */
/* ------------------------------------------------------------------ */

describe("createReactFlowAdapter inside createBuilder", () => {
  it("is accepted as the builder adapter", () => {
    const builder = buildWith();
    expect(builder.adapter?.id).toBe("nodera.react-flow");
    expect(builder.adapter?.label).toBe("React Flow");
  });

  it("reports no capability gap for node, edge, port and property renderers", () => {
    const builder = buildWith();
    expect(builder.diagnostics).toEqual([]);
    expect(unsupportedCapabilities(builder)).toEqual([]);
  });

  it("reports one gap per capability the narrowed adapter cannot honour", () => {
    const adapter = createReactFlowAdapter({
      capabilities: {
        nodeRenderers: false,
        edgeRenderers: false,
        portRenderers: false,
        propertyRenderers: false,
        edgeStyles: false,
      },
    });
    const builder = buildWith(adapter);
    expect([...unsupportedCapabilities(builder)].sort()).toEqual([
      "edgeRenderers",
      "edgeStyles",
      "nodeRenderers",
      "portRenderers",
      "propertyRenderers",
    ]);
    for (const issue of builder.diagnostics) {
      expect(issue.severity).toBe("warning");
    }
  });
});
