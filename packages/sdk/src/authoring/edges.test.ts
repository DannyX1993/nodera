import { describe, expect, it } from "vitest";
import { validateEdgeDefinition } from "@nodera/edge-registry";
import { toEdgeDefinition, type EdgeDefinitionInput } from "./edges.js";

const ConditionalEdgeRenderer = (): null => null;

function conditionalInput(): EdgeDefinitionInput {
  return {
    type: "demo.conditional",
    label: "Conditional connection",
    renderer: ConditionalEdgeRenderer,
    style: { strokeWidth: 2 },
  };
}

describe("toEdgeDefinition", () => {
  it("translates the published edge authoring example", () => {
    const result = toEdgeDefinition(conditionalInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition).toEqual({
      id: "demo.conditional",
      name: "Conditional connection",
      version: "1.0.0",
      renderer: "demo.conditional",
      visual: { metadata: { style: { strokeWidth: 2 } } },
    });
    expect(result.value.renderer).toEqual({
      id: "demo.conditional",
      value: ConditionalEdgeRenderer,
    });
  });

  it("produces a definition the domain considers complete", () => {
    const result = toEdgeDefinition(conditionalInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateEdgeDefinition(result.value.definition)).toEqual([]);
  });

  it("splits style into declared visual keys and renderer-only hints", () => {
    const result = toEdgeDefinition({
      type: "demo.flow",
      label: "Data flow",
      style: { lineStyle: "dashed", geometry: "step", strokeWidth: 2, dashArray: "4 2" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition.visual).toEqual({
      lineStyle: "dashed",
      geometry: "step",
      metadata: { style: { strokeWidth: 2, dashArray: "4 2" } },
    });
  });

  it("treats width as a declared visual key, not a renderer hint", () => {
    const result = toEdgeDefinition({
      type: "demo.flow",
      label: "Data flow",
      style: { width: 3, strokeWidth: 2 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition.visual).toEqual({
      width: 3,
      metadata: { style: { strokeWidth: 2 } },
    });
  });

  it("merges declared visual hints with style hints", () => {
    const result = toEdgeDefinition({
      type: "demo.flow",
      label: "Data flow",
      visual: { color: "#ff0000", metadata: { state: "ok" } },
      style: { color: "#00ff00", strokeWidth: 3 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition.visual).toEqual({
      color: "#00ff00",
      metadata: { state: "ok", style: { strokeWidth: 3 } },
    });
  });

  it("merges style hints with a style object the host already declared", () => {
    const result = toEdgeDefinition({
      type: "demo.flow",
      label: "Data flow",
      visual: { metadata: { style: { dashArray: "1 1" }, state: "ok" } },
      style: { strokeWidth: 3 },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition.visual).toEqual({
      metadata: { state: "ok", style: { dashArray: "1 1", strokeWidth: 3 } },
    });
  });

  it("omits visual when the host declares no style and no hints", () => {
    const result = toEdgeDefinition({ type: "demo.plain", label: "Plain" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition).not.toHaveProperty("visual");
    expect(result.value.definition).not.toHaveProperty("renderer");
    expect(result.value.renderer).toBeUndefined();
  });

  it("carries relation, restriction and action declarations", () => {
    const result = toEdgeDefinition({
      type: "demo.flow",
      label: "Data flow",
      description: "Rows move between nodes",
      connectionTypes: ["data-flow"],
      allowedSourceNodeDefinitionIds: ["demo.source.csv"],
      allowedTargetNodeDefinitionIds: ["demo.sink.table"],
      customConditionId: "demo.same-schema",
      contextualActions: [{ id: "demo.delete", label: "Delete" }],
      metadata: { vendor: "demo" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition).toMatchObject({
      connectionTypes: ["data-flow"],
      allowedSourceNodeDefinitionIds: ["demo.source.csv"],
      allowedTargetNodeDefinitionIds: ["demo.sink.table"],
      customConditionId: "demo.same-schema",
      contextualActions: [{ id: "demo.delete", label: "Delete" }],
      metadata: { vendor: "demo" },
    });
  });

  it("requires a globally qualified edge type and says so", () => {
    const result = toEdgeDefinition({ type: "conditional", label: "Conditional" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({
      code: "sdk.invalid-id",
      path: ["type"],
      metadata: { value: "conditional" },
    });
    expect(result.error[0]?.message).toContain("vendor.feature-name");
  });

  it("rejects a definition without a label", () => {
    const result = toEdgeDefinition({ type: "demo.flow", label: "" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({ code: "sdk.invalid-input", path: ["label"] });
  });

  it("reports domain validator findings with their domain code", () => {
    const result = toEdgeDefinition({
      type: "demo.flow",
      label: "Data flow",
      contextualActions: [
        { id: "demo.delete", label: "Delete" },
        { id: "demo.delete", label: "Delete again" },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      severity: "error",
      metadata: { domainCode: "edge-definition.duplicate-action-id" },
    });
  });

  it("does not leak unknown authoring fields into the definition", () => {
    const result = toEdgeDefinition({
      type: "demo.flow",
      label: "Data flow",
      hacked: true,
    } as unknown as EdgeDefinitionInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition).not.toHaveProperty("hacked");
  });
});
