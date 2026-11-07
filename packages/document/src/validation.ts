import { findDocumentIssues, type DocumentIssues } from "./normalize.js";

/**
 * Outcome of validating a document's structure.
 *
 * A document can be structurally invalid and its graph payload still look
 * fine; both facts travel together but never merge into one boolean.
 */
export interface DocumentValidationReport {
  /** All issues found, in deterministic discovery order. */
  readonly issues: DocumentIssues;
  /** True when the document passes every structural `document.*` rule. */
  readonly documentValid: boolean;
  /** True when no error-severity issue was found. */
  readonly isValid: boolean;
}

/**
 * Validates the structure of a raw document object: required fields, field
 * shapes, versions and portability rules.
 *
 * This is document-level validation only: whether the graph it describes is
 * semantically correct for a consumer's definitions is domain and extension
 * validation, always a separate concern. The inspected object is read-only:
 * validation never mutates, repairs or rewrites documents.
 */
export function validateGraphDocument(raw: unknown): DocumentValidationReport {
  const issues = findDocumentIssues(raw);
  return {
    issues,
    documentValid: issues.length === 0,
    isValid: issues.length === 0,
  };
}
