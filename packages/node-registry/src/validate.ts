import type { ValidationIssue } from "@nodera/contracts";
import type { NodeDefinition } from "./node-definition.js";

/** Shape of a qualified definition id: at least one dot, no whitespace. */
const QUALIFIED_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+$/;

/** Shape of a semver version: major.minor.patch with optional pre-release. */
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Validates a node definition's own completeness and internal consistency.
 * This is extension-level validation (incomplete or inconsistent
 * definitions), separate from graph validation.
 */
export function validateNodeDefinition(
  definition: NodeDefinition,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const elementId = definition.id;

  if (!QUALIFIED_ID_PATTERN.test(definition.id)) {
    issues.push({
      code: "node-definition.qualified-id",
      severity: "error",
      message: `Node definition id "${definition.id}" must be dot-qualified, e.g. "vendor.feature-name"`,
      elementId,
    });
  }
  if (definition.name.trim().length === 0) {
    issues.push({
      code: "node-definition.missing-name",
      severity: "error",
      message: `Node definition "${definition.id}" must declare a name`,
      elementId,
    });
  }
  if (!VERSION_PATTERN.test(definition.version)) {
    issues.push({
      code: "node-definition.version",
      severity: "error",
      message: `Node definition "${definition.id}" version "${definition.version}" must be semver (major.minor.patch)`,
      elementId,
    });
  }
  issues.push(...duplicateIds(definition, elementId));
  issues.push(...inconsistentProperties(definition, elementId));
  return issues;
}

function duplicateIds(
  definition: NodeDefinition,
  elementId: string,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const portIds = new Set<string>();
  for (const port of definition.ports) {
    if (portIds.has(port.id)) {
      issues.push({
        code: "node-definition.duplicate-port-id",
        severity: "error",
        message: `Node definition "${definition.id}" declares duplicate port id "${port.id}"`,
        elementId,
      });
    }
    portIds.add(port.id);
  }
  const propertyIds = new Set<string>();
  for (const property of definition.properties) {
    if (propertyIds.has(property.id)) {
      issues.push({
        code: "node-definition.duplicate-property-id",
        severity: "error",
        message: `Node definition "${definition.id}" declares duplicate property id "${property.id}"`,
        elementId,
        propertyPath: ["properties", property.id],
      });
    }
    propertyIds.add(property.id);
  }
  return issues;
}

function inconsistentProperties(
  definition: NodeDefinition,
  elementId: string,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const property of definition.properties) {
    const propertyPath = ["properties", property.id] as const;
    if ((property.type === "select" || property.type === "multi-select")) {
      if (property.options === undefined || property.options.length === 0) {
        issues.push({
          code: "node-definition.select-without-options",
          severity: "error",
          message: `Select property "${property.id}" of "${definition.id}" must declare options`,
          elementId,
          propertyPath,
        });
      }
    }
    if (property.type === "custom" && property.component === undefined) {
      issues.push({
        code: "node-definition.custom-without-component",
        severity: "error",
        message: `Custom property "${property.id}" of "${definition.id}" must declare a component id`,
        elementId,
        propertyPath,
      });
    }
    if (property.dependsOn !== undefined && property.dependsOn.includes(property.id)) {
      issues.push({
        code: "node-definition.self-dependency",
        severity: "error",
        message: `Property "${property.id}" of "${definition.id}" cannot depend on itself`,
        elementId,
        propertyPath,
      });
    }
  }
  return issues;
}
