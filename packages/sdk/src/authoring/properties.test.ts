import { describe, expect, it } from "vitest";
import { toPropertyDefinition } from "./properties.js";

describe("toPropertyDefinition", () => {
  it("normalizes a plain string option list into value/label pairs", () => {
    const result = toPropertyDefinition({
      id: "method",
      type: "select",
      defaultValue: "GET",
      options: ["GET", "POST"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition).toEqual({
      id: "method",
      type: "select",
      defaultValue: "GET",
      options: [
        { value: "GET", label: "GET" },
        { value: "POST", label: "POST" },
      ],
    });
    expect(result.value.component).toBeUndefined();
  });

  it("keeps option objects that already carry a label", () => {
    const result = toPropertyDefinition({
      id: "method",
      type: "select",
      options: [{ value: "GET", label: "Read" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition.options).toEqual([{ value: "GET", label: "Read" }]);
  });

  it("carries the whole declarative property contract", () => {
    const result = toPropertyDefinition({
      id: "url",
      type: "string",
      label: "URL",
      description: "Endpoint to call",
      defaultValue: "https://example.test",
      required: true,
      editable: false,
      visible: true,
      order: 3,
      group: "request",
      schema: { type: "string", maxLength: 2048 },
      validations: [{ kind: "pattern", value: "^https://" }],
      visibleWhen: { kind: "propertyDefined", propertyId: "endpoint" },
      enabledWhen: { kind: "propertyEquals", propertyId: "mode", value: "manual" },
      dependsOn: ["mode"],
      metadata: { hint: "absolute" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition).toEqual({
      id: "url",
      type: "string",
      label: "URL",
      description: "Endpoint to call",
      defaultValue: "https://example.test",
      required: true,
      editable: false,
      visible: true,
      order: 3,
      group: "request",
      schema: { type: "string", maxLength: 2048 },
      validations: [{ kind: "pattern", value: "^https://" }],
      visibleWhen: { kind: "propertyDefined", propertyId: "endpoint" },
      enabledWhen: { kind: "propertyEquals", propertyId: "mode", value: "manual" },
      dependsOn: ["mode"],
      metadata: { hint: "absolute" },
    });
  });

  it("binds an opaque component to a derived id for custom properties", () => {
    const Component = (): null => null;

    const result = toPropertyDefinition(
      { id: "code", type: "custom", component: Component },
      { ownerType: "company.ai-node" },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition.component).toBe("company.ai-node.code");
    expect(result.value.component).toEqual({
      id: "company.ai-node.code",
      value: Component,
    });
  });

  it("passes a component id through without creating a binding", () => {
    const result = toPropertyDefinition({
      id: "code",
      type: "custom",
      component: "company.code-editor",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition.component).toBe("company.code-editor");
    expect(result.value.component).toBeUndefined();
  });

  it("rejects an unknown property type naming the accepted ones", () => {
    const result = toPropertyDefinition({
      id: "size",
      type: "slider" as unknown as "string",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      severity: "error",
      path: ["properties", "size", "type"],
    });
    expect(result.error[0]?.message).toContain("string");
  });

  it("rejects a select property without options", () => {
    const missing = toPropertyDefinition({ id: "method", type: "select" });
    const empty = toPropertyDefinition({ id: "method", type: "select", options: [] });

    expect(missing.ok).toBe(false);
    expect(empty.ok).toBe(false);
    if (missing.ok || empty.ok) return;
    expect(missing.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      path: ["properties", "method", "options"],
    });
  });

  it("rejects a custom property without a component", () => {
    const result = toPropertyDefinition({ id: "code", type: "custom" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      path: ["properties", "code", "component"],
    });
  });

  it("rejects an empty property id", () => {
    const result = toPropertyDefinition({ id: " ", type: "string" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({ code: "sdk.invalid-id" });
  });
});
