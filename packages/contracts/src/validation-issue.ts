import type { ElementId } from "./ids.js";
import type { ValidationSeverity } from "./severity.js";

/**
 * Path of property segments that locates the value an issue refers to, e.g.
 * `["properties", "endpoint", "url"]`. Segments are stable property
 * identifiers, never array indices.
 */
export type PropertyPath = readonly string[];

/**
 * A normalized validation diagnostic.
 *
 * Validation must produce results independent of any visual representation:
 * an issue says what is wrong and where, never how to render it.
 */
export interface ValidationIssue {
  /** Stable machine-readable code, e.g. `structural.duplicate-node-id`. */
  readonly code: string;
  /** How severe the issue is. */
  readonly severity: ValidationSeverity;
  /** Human-readable explanation. Not for programmatic decisions. */
  readonly message: string;
  /** Identifier of the element the issue refers to, when applicable. */
  readonly elementId?: ElementId;
  /** Path of the property the issue refers to, when applicable. */
  readonly propertyPath?: PropertyPath;
  /** Additional structured context for the issue. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Builds a {@link ValidationIssue}, omitting absent optional context. */
export function createValidationIssue(
  issue: ValidationIssue,
): ValidationIssue {
  return issue;
}
