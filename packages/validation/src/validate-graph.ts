import type { ValidationIssue } from "@nodera/contracts";
import type { GraphValidator, ValidationContext, ValidationLevel } from "./context.js";
import { domainValidator } from "./domain-validator.js";
import { structuralValidator } from "./structural-validator.js";

/**
 * Outcome of validating a graph.
 *
 * Structural validity and configuration correctness are reported apart:
 * a graph can be structurally valid and still have domain errors, and the
 * two states must never be conflated.
 */
export interface ValidationReport {
  /** All issues, structural and domain, in deterministic order. */
  readonly issues: readonly ValidationIssue[];
  /** True when no structural-level error was found. */
  readonly structurallyValid: boolean;
  /** True when no domain-level error was found. */
  readonly configurationValid: boolean;
  /** True when no error-severity issue was found at any level. */
  readonly isValid: boolean;
}

/** The built-in validators, registered in every standard context. */
export const BUILT_IN_VALIDATORS: readonly GraphValidator[] = [
  structuralValidator,
  domainValidator,
];

/**
 * Validates a graph with the built-in validators plus every registered
 * graph-level validator, optionally filtered by level.
 */
export function validateGraph(
  context: ValidationContext,
  options: { readonly levels?: readonly ValidationLevel[] } = {},
): ValidationReport {
  const validators: GraphValidator[] = [
    ...BUILT_IN_VALIDATORS,
    ...context.validators.allValidators(),
  ];
  const levels = options.levels;
  const applicable = levels === undefined
    ? validators
    : validators.filter((v) => levels.includes(v.level));

  const issues: ValidationIssue[] = [];
  for (const validator of applicable) {
    issues.push(...validator.validate(context));
  }
  const structuralErrors = issues.some(
    (i) => i.code.startsWith("structural.") && i.severity === "error",
  );
  const domainErrors = issues.some(
    (i) => i.code.startsWith("domain.") && i.severity === "error",
  );
  const anyErrors = issues.some((i) => i.severity === "error");
  return {
    issues,
    structurallyValid: !structuralErrors,
    configurationValid: !domainErrors,
    isValid: !anyErrors,
  };
}
