/**
 * JSON text helpers of the `json-editor`, `object` and `array` renderers.
 *
 * They translate between the editor text and the structured value the document
 * stores. Parsing a document value is data handling only: whether the stored
 * value satisfies the property definition stays a property-system decision.
 */

/** Result of parsing editor text. */
export type JsonTextResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

/** Text the editor shows for a stored value. */
export function formatJsonText(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  const formatted = JSON.stringify(value, null, 2);
  return formatted ?? "";
}

/**
 * Parses editor text into a value.
 *
 * An empty text is the "no value" case (an optional structured property the
 * user cleared), not a syntax error; anything else must be valid JSON.
 */
export function parseJsonText(text: string): JsonTextResult {
  if (text.trim() === "") {
    return { ok: true, value: undefined };
  }
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "not valid JSON";
    return { ok: false, message: `Invalid JSON: ${detail}` };
  }
}

/** Whether two values serialize to the same JSON, used to avoid text churn. */
export function jsonEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
