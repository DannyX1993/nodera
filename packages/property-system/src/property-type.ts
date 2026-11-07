/**
 * Property types supported by the declarative property system.
 * The list mirrors the Fase 1 definition; presentation widgets are a
 * renderer concern mapped through the UI metamodel, never the type itself.
 */

export const PROPERTY_TYPES = [
  "string",
  "number",
  "boolean",
  "select",
  "multi-select",
  "textarea",
  "code-editor",
  "json-editor",
  "yaml-editor",
  "date",
  "datetime",
  "color",
  "file-reference",
  "object",
  "array",
  "custom",
] as const;

/** Data type of a declarative property. */
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Checks whether a raw value is a known property type. */
export function isPropertyType(value: unknown): value is PropertyType {
  return typeof value === "string" && (PROPERTY_TYPES as readonly string[]).includes(value);
}

/** Property types whose values are plain strings. */
const STRING_LIKE_TYPES: readonly PropertyType[] = [
  "string",
  "textarea",
  "code-editor",
  "json-editor",
  "yaml-editor",
  "date",
  "datetime",
  "color",
  "file-reference",
];

/**
 * Structural shape a value must have for a property type, independent of any
 * widget: a `json-editor` still holds a serialized string, an `array` holds a
 * real array and a `custom` type is validated by its own component contract.
 */
export function matchesPropertyType(type: PropertyType, value: unknown): boolean {
  switch (type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "select":
      return typeof value === "string";
    case "multi-select":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "custom":
      return true;
    default:
      return STRING_LIKE_TYPES.includes(type)
        ? typeof value === "string"
        : false;
  }
}
