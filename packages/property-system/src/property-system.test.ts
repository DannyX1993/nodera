import { describe, expect, it } from "vitest";
import {
  isPropertyType,
  matchesPropertyType,
  PROPERTY_TYPES,
} from "./property-type.js";
import type { PropertyDefinition } from "./property-definition.js";
import { isDefinitionEnabled, isDefinitionVisible, isPropertyVisible, effectiveOptions } from "./visibility.js";
import { validatePropertyValue, validatePropertyValues } from "./validate.js";

describe("property types", () => {
  it("exposes the Fase 1 type list", () => {
    expect(PROPERTY_TYPES).toHaveLength(16);
    expect(isPropertyType("code-editor")).toBe(true);
    expect(isPropertyType("file-reference")).toBe(true);
    expect(isPropertyType("widget")).toBe(false);
  });

  it("checks the structural shape of values per type", () => {
    expect(matchesPropertyType("string", "a")).toBe(true);
    expect(matchesPropertyType("number", 1.5)).toBe(true);
    expect(matchesPropertyType("number", Number.NaN)).toBe(false);
    expect(matchesPropertyType("boolean", false)).toBe(true);
    expect(matchesPropertyType("select", "opt")).toBe(true);
    expect(matchesPropertyType("multi-select", ["a", "b"])).toBe(true);
    expect(matchesPropertyType("multi-select", ["a", 1])).toBe(false);
    expect(matchesPropertyType("object", { a: 1 })).toBe(true);
    expect(matchesPropertyType("object", [1])).toBe(false);
    expect(matchesPropertyType("array", [1])).toBe(true);
    expect(matchesPropertyType("json-editor", "{}")).toBe(true);
    expect(matchesPropertyType("custom", Symbol("anything"))).toBe(true);
    expect(matchesPropertyType("string", 5)).toBe(false);
  });
});

describe("visibility", () => {
  const values = { mode: "advanced", retries: 3, empty: undefined };

  it("evaluates primitive conditions", () => {
    expect(isPropertyVisible({ kind: "propertyEquals", propertyId: "mode", value: "advanced" }, values)).toBe(true);
    expect(isPropertyVisible({ kind: "propertyEquals", propertyId: "mode", value: "basic" }, values)).toBe(false);
    expect(isPropertyVisible({ kind: "propertyNotEquals", propertyId: "mode", value: "basic" }, values)).toBe(true);
    expect(isPropertyVisible({ kind: "propertyDefined", propertyId: "retries" }, values)).toBe(true);
    expect(isPropertyVisible({ kind: "propertyDefined", propertyId: "empty" }, values)).toBe(false);
  });

  it("composes conditions", () => {
    const allOf = {
      kind: "allOf" as const,
      conditions: [
        { kind: "propertyEquals" as const, propertyId: "mode", value: "advanced" },
        { kind: "propertyDefined" as const, propertyId: "retries" },
      ],
    };
    const anyOf = {
      kind: "anyOf" as const,
      conditions: [
        { kind: "propertyEquals" as const, propertyId: "mode", value: "basic" },
        { kind: "propertyDefined" as const, propertyId: "retries" },
      ],
    };
    expect(isPropertyVisible(allOf, values)).toBe(true);
    expect(isPropertyVisible(anyOf, values)).toBe(true);
  });

describe("dynamic editability and options", () => {
  const values = { mode: "basic", level: "pro" };

  it("gates editability with the static flag and the dynamic condition", () => {
    expect(isDefinitionEnabled({ id: "a", type: "string" }, values)).toBe(true);
    expect(isDefinitionEnabled({ id: "a", type: "string", editable: false }, values)).toBe(false);
    expect(
      isDefinitionEnabled(
        { id: "a", type: "string", enabledWhen: { kind: "propertyEquals", propertyId: "level", value: "pro" } },
        values,
      ),
    ).toBe(true);
    expect(
      isDefinitionEnabled(
        { id: "a", type: "string", enabledWhen: { kind: "propertyEquals", propertyId: "level", value: "free" } },
        values,
      ),
    ).toBe(false);
  });

  it("replaces options with the first matching dynamic option set", () => {
    const method: PropertyDefinition = {
      id: "method",
      type: "select",
      options: [{ value: "GET", label: "GET" }],
      optionSets: [
        {
          when: { kind: "propertyEquals", propertyId: "mode", value: "basic" },
          options: [{ value: "GET", label: "GET" }],
        },
        {
          when: { kind: "propertyEquals", propertyId: "mode", value: "advanced" },
          options: [
            { value: "GET", label: "GET" },
            { value: "POST", label: "POST" },
          ],
        },
      ],
    };
    expect(effectiveOptions(method, { mode: "advanced" })).toEqual([
      { value: "GET", label: "GET" },
      { value: "POST", label: "POST" },
    ]);
    expect(effectiveOptions(method, { mode: "basic" })).toEqual([{ value: "GET", label: "GET" }]);
    // No matching set falls back to the static options.
    expect(effectiveOptions(method, { mode: "other" })).toEqual([{ value: "GET", label: "GET" }]);
    expect(effectiveOptions({ id: "n", type: "string" }, values)).toBeUndefined();
  });
});

  it("combines the static flag with the dynamic condition", () => {
    const hidden: PropertyDefinition = { id: "a", type: "string", visible: false };
    const dynamic: PropertyDefinition = {
      id: "b",
      type: "string",
      visibleWhen: { kind: "propertyEquals", propertyId: "mode", value: "basic" },
    };
    expect(isDefinitionVisible(hidden, values)).toBe(false);
    expect(isDefinitionVisible(dynamic, values)).toBe(false);
    expect(isDefinitionVisible({ id: "c", type: "string" }, values)).toBe(true);
  });
});

describe("property value validation", () => {
  const endpoint: PropertyDefinition = {
    id: "endpoint",
    type: "string",
    required: true,
    schema: { pattern: "^https?://" },
  };
  const retries: PropertyDefinition = {
    id: "retries",
    type: "number",
    validations: [{ kind: "min", value: 0 }, { kind: "max", value: 10 }],
  };

  it("reports missing required values", () => {
    const issues = validatePropertyValue(endpoint, undefined, { elementId: "n1" });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "property.required",
      severity: "error",
      elementId: "n1",
      metadata: { propertyId: "endpoint" },
    });
  });

  it("reports type mismatches", () => {
    const issues = validatePropertyValue(retries, "many");
    expect(issues.map((i) => i.code)).toEqual(["property.type"]);
  });

  it("reports schema and declarative rule violations", () => {
    expect(validatePropertyValue(endpoint, "ftp://x").map((i) => i.code)).toEqual(["property.pattern"]);
    expect(validatePropertyValue(retries, -1).map((i) => i.code)).toEqual(["property.min"]);
    expect(validatePropertyValue(retries, 11).map((i) => i.code)).toEqual(["property.max"]);
    expect(validatePropertyValue(retries, 3)).toEqual([]);
  });

  it("does not invent values for definitions without a value", () => {
    const optional: PropertyDefinition = { id: "note", type: "string" };
    expect(validatePropertyValue(optional, undefined)).toEqual([]);
  });

  it("validates a record against definitions with property paths", () => {
    const issues = validatePropertyValues([endpoint, retries], {
      endpoint: "not-a-url",
      retries: -2,
    });
    expect(issues).toHaveLength(2);
    expect(issues[0]?.propertyPath).toEqual(["endpoint"]);
    expect(issues[1]?.propertyPath).toEqual(["retries"]);
  });
});
