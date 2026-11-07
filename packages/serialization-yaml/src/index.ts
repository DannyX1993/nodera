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
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/** Serialized output: YAML text, or parse-grade diagnostics. */
export type SerializationResult = Result<string, readonly ValidationIssue[]>;

/** Parsed input: a normalized portable document, or its diagnostics. */
export type ParseResult = Result<GraphDocument, readonly ValidationIssue[]>;

/**
 * Serializes a portable document as YAML.
 *
 * The shared structural validator runs first so non-portable values are
 * rejected with the same `document.*` diagnostics the rest of the system
 * uses, never silently dropped. YAML serializes exactly the same logical
 * model as the JSON format.
 */
export function serializeYaml(document: GraphDocument): SerializationResult {
  const issues = findDocumentIssues(document);
  if (issues.length > 0) {
    return err(issues);
  }
  try {
    return ok(stringifyYaml(document));
  } catch (error) {
    return err([
      {
        code: "serialize.non-portable-value",
        severity: "error",
        message:
          error instanceof Error
            ? `YAML serialization failed: ${error.message}`
            : "YAML serialization failed with a non-portable value",
        propertyPath: ["format"],
      },
    ]);
  }
}

/**
 * Parses YAML text into a normalized portable document.
 *
 * Text-level failures produce a `parse.*` diagnostic; structurally invalid
 * or non-object payloads carry the shared `document.*` diagnostics unchanged.
 */
export function parseYamlDocument(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    return err([
      {
        code: "parse.invalid-yaml",
        severity: "error",
        message:
          error instanceof Error ? error.message : "Text is not valid YAML",
      },
    ]);
  }
  return normalizeGraphDocument(raw);
}
