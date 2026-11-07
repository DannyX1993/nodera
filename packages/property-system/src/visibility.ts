import type {
  PropertyDefinition,
  PropertyOption,
  PropertyVisibilityCondition,
} from "./property-definition.js";

/** Property values keyed by property id, as stored on node instances. */
export type PropertyValues = Readonly<Record<string, unknown>>;

/**
 * Evaluates a visibility condition against property values.
 *
 * The result is a plain boolean independent of any representation: the same
 * evaluation serves validation, documents and every renderer. `custom`
 * conditions are not decided here — they resolve to false for evaluation
 * purposes and are handled by their registered condition handlers.
 */
export function isPropertyVisible(
  condition: PropertyVisibilityCondition,
  values: PropertyValues,
): boolean {
  switch (condition.kind) {
    case "propertyEquals":
      return values[condition.propertyId] === condition.value;
    case "propertyNotEquals":
      return values[condition.propertyId] !== condition.value;
    case "propertyDefined":
      return values[condition.propertyId] !== undefined;
    case "allOf":
      return condition.conditions.every((c) => isPropertyVisible(c, values));
    case "anyOf":
      return condition.conditions.some((c) => isPropertyVisible(c, values));
    case "custom":
      return false;
  }
}

/**
 * Resolves the effective editability of a property: the static `editable`
 * flag first, then its dynamic condition when present.
 */
export function isDefinitionEnabled(
  definition: PropertyDefinition,
  values: PropertyValues,
): boolean {
  if (definition.editable === false) {
    return false;
  }
  if (definition.enabledWhen === undefined) {
    return true;
  }
  return isPropertyVisible(definition.enabledWhen, values);
}

/**
 * Resolves the effective options of a `select` / `multi-select` property:
 * the static `options` as base, replaced by the first matching entry of
 * `optionSets` when one applies.
 */
export function effectiveOptions(
  definition: PropertyDefinition,
  values: PropertyValues,
): readonly PropertyOption[] | undefined {
  const optionSets = definition.optionSets;
  if (optionSets !== undefined) {
    for (const set of optionSets) {
      if (isPropertyVisible(set.when, values)) {
        return set.options;
      }
    }
  }
  return definition.options;
}

/**
 * Resolves the effective visibility of a property: its static `visible`
 * flag first, then its dynamic condition when present.
 */
export function isDefinitionVisible(
  definition: PropertyDefinition,
  values: PropertyValues,
): boolean {
  if (definition.visible === false) {
    return false;
  }
  if (definition.visibleWhen === undefined) {
    return true;
  }
  return isPropertyVisible(definition.visibleWhen, values);
}
