import type { ValidationIssue } from "@nodera/contracts";
import type { JsonSchema } from "./json-schema.js";
import type { PropertyDefinition, PropertyValidation } from "./property-definition.js";
import { matchesPropertyType } from "./property-type.js";

/**
 * Validates one property value against its definition and produces
 * normalized, representation-independent diagnostics.
 *
 * This is value validation only: whether a value satisfies node-level or
 * graph-level rules is domain validation, a separate layer.
 */
export function validatePropertyValue(
  definition: PropertyDefinition,
  value: unknown,
  options: ValidatePropertyOptions = {},
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const elementId = options.elementId;
  const context = { propertyId: definition.id };

  if (value === undefined) {
    if (definition.required === true) {
      issues.push({
        code: "property.required",
        severity: "error",
        message: `Property "${definition.id}" is required but has no value`,
        elementId,
        propertyPath: options.propertyPath,
        metadata: context,
      });
    }
    return issues;
  }

  if (!matchesPropertyType(definition.type, value)) {
    issues.push({
      code: "property.type",
      severity: "error",
      message: `Property "${definition.id}" expects type "${definition.type}"`,
      elementId,
      propertyPath: options.propertyPath,
      metadata: context,
    });
    return issues;
  }

  issues.push(...validateSchemaConstraints(definition, value, elementId, options));
  issues.push(...validateDeclarativeRules(definition, value, elementId, options));
  return issues;
}

export interface ValidatePropertyOptions {
  /** Element the value belongs to, attached to every issue when given. */
  readonly elementId?: string;
  /** Property path prefix, e.g. `["properties", "endpoint"]`. */
  readonly propertyPath?: readonly string[];
}

function issue(
  code: string,
  message: string,
  definition: PropertyDefinition,
  elementId: string | undefined,
  options: ValidatePropertyOptions,
): ValidationIssue {
  return {
    code,
    severity: "error",
    message,
    elementId,
    propertyPath: options.propertyPath,
    metadata: { propertyId: definition.id },
  };
}

function validateSchemaConstraints(
  definition: PropertyDefinition,
  value: unknown,
  elementId: string | undefined,
  options: ValidatePropertyOptions,
): readonly ValidationIssue[] {
  const schema = definition.schema;
  if (schema === undefined) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push(
        issue("property.minimum", `Property "${definition.id}" must be >= ${schema.minimum}`, definition, elementId, options),
      );
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push(
        issue("property.maximum", `Property "${definition.id}" must be <= ${schema.maximum}`, definition, elementId, options),
      );
    }
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push(
        issue("property.minLength", `Property "${definition.id}" must be at least ${schema.minLength} characters`, definition, elementId, options),
      );
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push(
        issue("property.maxLength", `Property "${definition.id}" must be at most ${schema.maxLength} characters`, definition, elementId, options),
      );
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      issues.push(
        issue("property.pattern", `Property "${definition.id}" does not match the required pattern`, definition, elementId, options),
      );
    }
  }
  if (schema.enum !== undefined && !(schema.enum as readonly unknown[]).some((v) => v === value)) {
    issues.push(
      issue("property.enum", `Property "${definition.id}" must be one of the allowed values`, definition, elementId, options),
    );
  }
  return issues;
}

function validateDeclarativeRules(
  definition: PropertyDefinition,
  value: unknown,
  elementId: string | undefined,
  options: ValidatePropertyOptions,
): readonly ValidationIssue[] {
  const rules = definition.validations;
  if (rules === undefined) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  for (const rule of rules as readonly PropertyValidation[]) {
    switch (rule.kind) {
      case "min":
        if (typeof value === "number" && value < rule.value) {
          issues.push(issue("property.min", `Property "${definition.id}" must be >= ${rule.value}`, definition, elementId, options));
        }
        break;
      case "max":
        if (typeof value === "number" && value > rule.value) {
          issues.push(issue("property.max", `Property "${definition.id}" must be <= ${rule.value}`, definition, elementId, options));
        }
        break;
      case "minLength":
        if (typeof value === "string" && value.length < rule.value) {
          issues.push(issue("property.minLength", `Property "${definition.id}" must be at least ${rule.value} characters`, definition, elementId, options));
        }
        break;
      case "maxLength":
        if (typeof value === "string" && value.length > rule.value) {
          issues.push(issue("property.maxLength", `Property "${definition.id}" must be at most ${rule.value} characters`, definition, elementId, options));
        }
        break;
      case "pattern":
        if (typeof value === "string" && !new RegExp(rule.value).test(value)) {
          issues.push(issue("property.pattern", `Property "${definition.id}" does not match the required pattern`, definition, elementId, options));
        }
        break;
      case "custom":
        // Custom rules are resolved by the validator registry (see
        // @nodera/validation); a bare definition cannot evaluate them.
        break;
    }
  }
  return issues;
}

/**
 * Validates a full property-value record against a list of definitions,
 * ignoring values without a matching definition (unknown properties are
 * preserved, never invented).
 */
export function validatePropertyValues(
  definitions: readonly PropertyDefinition[],
  values: Readonly<Record<string, unknown>>,
  options: ValidatePropertyOptions = {},
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const definition of definitions) {
    const path: readonly string[] = options.propertyPath
      ? [...options.propertyPath, definition.id]
      : [definition.id];
    issues.push(...validatePropertyValue(definition, values[definition.id], { ...options, propertyPath: path }));
  }
  return issues;
}

export type { JsonSchema };
