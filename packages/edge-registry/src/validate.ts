import type { ValidationIssue } from "@nodera/contracts";
import type { EdgeDefinition } from "./edge-definition.js";

const QUALIFIED_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Validates an edge definition's own completeness and internal consistency
 * (extension-level validation, separate from graph validation).
 */
export function validateEdgeDefinition(
  definition: EdgeDefinition,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const elementId = definition.id;

  if (!QUALIFIED_ID_PATTERN.test(definition.id)) {
    issues.push({
      code: "edge-definition.qualified-id",
      severity: "error",
      message: `Edge definition id "${definition.id}" must be dot-qualified, e.g. "vendor.feature-name"`,
      elementId,
    });
  }
  if (definition.name.trim().length === 0) {
    issues.push({
      code: "edge-definition.missing-name",
      severity: "error",
      message: `Edge definition "${definition.id}" must declare a name`,
      elementId,
    });
  }
  if (!VERSION_PATTERN.test(definition.version)) {
    issues.push({
      code: "edge-definition.version",
      severity: "error",
      message: `Edge definition "${definition.id}" version "${definition.version}" must be semver (major.minor.patch)`,
      elementId,
    });
  }
  if (definition.connectionTypes !== undefined) {
    for (const type of definition.connectionTypes) {
      if (type.trim().length === 0) {
        issues.push({
          code: "edge-definition.connection-type",
          severity: "error",
          message: `Edge definition "${definition.id}" declares an empty connection type`,
          elementId,
        });
      }
    }
  }
  const actionIds = new Set<string>();
  for (const action of definition.contextualActions ?? []) {
    if (actionIds.has(action.id)) {
      issues.push({
        code: "edge-definition.duplicate-action-id",
        severity: "error",
        message: `Edge definition "${definition.id}" declares duplicate contextual action id "${action.id}"`,
        elementId,
      });
    }
    actionIds.add(action.id);
  }
  return issues;
}
