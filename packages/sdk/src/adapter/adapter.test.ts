import { describe, expect, it } from "vitest";
import {
  ADAPTER_CAPABILITIES,
  capabilityGaps,
  normalizeAdapter,
  requirementsFrom,
  type BuilderAdapter,
} from "./adapter.js";

function adapter(
  id: string,
  capabilities: Partial<Record<(typeof ADAPTER_CAPABILITIES)[number], boolean>> = {},
  label = "Test engine",
): BuilderAdapter {
  return normalizeAdapterOrThrow({ id, label, capabilities });
}

function normalizeAdapterOrThrow(input: unknown): BuilderAdapter {
  const result = normalizeAdapter(
    input as Parameters<typeof normalizeAdapter>[0],
  );
  if (!result.ok) {
    throw new Error(`unexpected adapter failure: ${result.error[0]?.message}`);
  }
  return result.value;
}

describe("normalizeAdapter", () => {
  it("fills every capability with an explicit default", () => {
    const result = normalizeAdapter({ id: "nodera.headless", label: "Headless" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("nodera.headless");
    expect(result.value.label).toBe("Headless");
    expect(result.value.capabilities).toEqual({
      canvas: true,
      minimap: false,
      controls: false,
      zoomPan: false,
      dragAndDrop: false,
      nodeRenderers: false,
      edgeRenderers: false,
      portRenderers: false,
      propertyRenderers: false,
      edgeStyles: false,
      customPanels: false,
    });
  });

  it("keeps the capabilities the host declares", () => {
    const result = normalizeAdapter({
      id: "nodera.react-flow",
      label: "React Flow",
      capabilities: { minimap: true, dragAndDrop: true, canvas: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.capabilities.minimap).toBe(true);
    expect(result.value.capabilities.dragAndDrop).toBe(true);
    expect(result.value.capabilities.canvas).toBe(false);
    expect(result.value.capabilities.controls).toBe(false);
  });

  it("requires a globally qualified adapter id", () => {
    const result = normalizeAdapter({ id: "reactflow", label: "React Flow" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({
      code: "sdk.invalid-id",
      path: ["adapter", "id"],
    });
  });

  it("requires a non-empty label", () => {
    const result = normalizeAdapter({ id: "nodera.engine", label: "  " });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      path: ["adapter", "label"],
    });
  });
});

describe("requirementsFrom", () => {
  it("derives nothing from definitions that declare no presentation", () => {
    expect(requirementsFrom({ nodes: [], edges: [] })).toEqual({
      nodeRenderers: false,
      edgeRenderers: false,
      portRenderers: false,
      propertyRenderers: false,
      edgeStyles: false,
    });
  });

  it("derives every renderer slot an authored graph actually uses", () => {
    const requirements = requirementsFrom({
      nodes: [
        {
          renderer: "demo.node",
          ports: [{ visual: { renderer: "demo.port" } }],
          properties: [{ component: "demo.component" }],
        },
      ],
      edges: [{ renderer: "demo.edge", visual: { lineStyle: "dashed" } }],
    });

    expect(requirements).toEqual({
      nodeRenderers: true,
      edgeRenderers: true,
      portRenderers: true,
      propertyRenderers: true,
      edgeStyles: true,
    });
  });
});

describe("capabilityGaps", () => {
  const requirements = requirementsFrom({
    nodes: [{ renderer: "demo.node", ports: [{ visual: { renderer: "demo.port" } }] }],
    edges: [],
  });

  it("reports nothing without an adapter, because presentation is host-wired", () => {
    expect(capabilityGaps(undefined, requirements)).toEqual([]);
  });

  it("reports nothing when the adapter declares the capability", () => {
    const engine = adapter("demo.engine", {
      nodeRenderers: true,
      portRenderers: true,
    });

    expect(capabilityGaps(engine, requirements)).toEqual([]);
  });

  it("reports one warning per missing capability the candidate needs", () => {
    const engine = adapter("demo.engine", { nodeRenderers: true });

    const gaps = capabilityGaps(engine, requirements);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      code: "sdk.renderer-unsupported",
      severity: "warning",
      metadata: { adapterId: "demo.engine", capability: "portRenderers" },
    });
    expect(gaps[0]?.message).toContain("portRenderers");
  });
});
