import type { PropertyDefinition } from "@nodera/property-system";

/** Title of the section that collects properties without a `group`. */
export const UNGROUPED_PROPERTY_SECTION_TITLE = "General";

/** One display group of property definitions. */
export interface PropertySection {
  /** Group id, or an empty string for the ungrouped section. */
  readonly group: string;
  /** Heading text shown by the panel. */
  readonly title: string;
  readonly properties: readonly PropertyDefinition[];
}

/**
 * Orders property definitions for display.
 *
 * `order` wins when declared (ascending); definitions without one come after
 * every ordered one and keep their declaration order. The sort is stable, so
 * two definitions with the same `order` stay in the order the definition
 * declares them: the panel reorders nothing the definition did not ask for.
 */
export function orderProperties(
  definitions: readonly PropertyDefinition[],
): readonly PropertyDefinition[] {
  return definitions
    .map((definition, index) => ({ definition, index }))
    .sort((left, right) => {
      const orderLeft = left.definition.order ?? Number.POSITIVE_INFINITY;
      const orderRight = right.definition.order ?? Number.POSITIVE_INFINITY;
      if (orderLeft !== orderRight) {
        return orderLeft - orderRight;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.definition);
}

/**
 * Orders and groups property definitions for the properties panel (D11).
 *
 * Named groups appear in the order their first property appears, and the
 * ungrouped section is always last: a panel that mixes grouped and loose
 * properties stays predictable without the definition declaring group order.
 */
export function groupPropertiesForDisplay(
  definitions: readonly PropertyDefinition[],
): readonly PropertySection[] {
  const sections: PropertySection[] = [];
  const byGroup = new Map<string, PropertyDefinition[]>();
  const ungrouped: PropertyDefinition[] = [];

  for (const definition of orderProperties(definitions)) {
    const group = definition.group;
    if (group === undefined) {
      ungrouped.push(definition);
      continue;
    }
    const existing = byGroup.get(group);
    if (existing === undefined) {
      const properties = [definition];
      byGroup.set(group, properties);
      sections.push({ group, title: group, properties });
      continue;
    }
    existing.push(definition);
  }

  if (ungrouped.length > 0) {
    sections.push({
      group: "",
      title: UNGROUPED_PROPERTY_SECTION_TITLE,
      properties: ungrouped,
    });
  }

  return sections;
}
