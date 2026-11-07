import {
  err,
  ok,
  type Result,
  type ValidationIssue,
} from "@nodera/contracts";
import {
  findDocumentIssues,
  normalizeGraphDocument,
  type GraphDocument,
} from "@nodera/document";

/** Serialized output: pretty JSON text, or parse-grade diagnostics. */
export type SerializationResult = Result<string, readonly ValidationIssue[]>;

/** Parsed input: a normalized portable document, or its diagnostics. */
export type ParseResult = Result<GraphDocument, readonly ValidationIssue[]>;

/**
 * Serializes a portable document as pretty JSON.
 *
 * The shared structural validator runs first so non-portable values are
 * rejected with the same `document.*` diagnostics the rest of the system
 * uses, never silently dropped.
 */
export function serializeJson(document: GraphDocument): SerializationResult {
  const issues = findDocumentIssues(document);
  if (issues.length > 0) {
    return err(issues);
  }
  try {
    return ok(JSON.stringify(document, null, 2));
  } catch (error) {
    return err([
      {
        code: "serialize.non-portable-value",
        severity: "error",
        message:
          error instanceof Error
            ? `JSON serialization failed: ${error.message}`
            : "JSON serialization failed with a non-portable value",
        propertyPath: ["format"],
      },
    ]);
  }
}

/**
 * Parses JSON text into a normalized portable document.
 *
 * Text-level failures produce a `parse.*` diagnostic; structurally invalid
 * documents carry the shared `document.*` diagnostics unchanged.
 */
export function parseJsonDocument(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return err([
      {
        code: "parse.invalid-json",
        severity: "error",
        message:
          error instanceof Error ? error.message : "Text is not valid JSON",
      },
    ]);
  }
  return normalizeGraphDocument(raw);
}
