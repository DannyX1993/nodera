# @nodera/property-system

Declarative property definitions with a JSON Schema based data model and a
renderer-free UI metamodel.

- `PROPERTY_TYPES` — the closed set of sixteen types (`string`, `number`,
  `boolean`, `select`, `multi-select`, `textarea`, `code-editor`,
  `json-editor`, `yaml-editor`, `date`, `datetime`, `color`, `file-reference`,
  `object`, `array`, `custom`), with `isPropertyType` and
  `matchesPropertyType`.
- `PropertyDefinition` — id, type, label, default, `PropertyOption`s
  (`PropertyOptionSet`), `JsonSchema`, and rules. `PropertyValidation` covers
  `min`, `max`, `minLength`, `maxLength`, `pattern` and `custom` (a stable
  `validatorId`, never a function).
- `PropertyVisibilityCondition` / `isPropertyVisible` / `isDefinitionVisible` /
  `isDefinitionEnabled` / `effectiveOptions` — serializable, data-only rules
  for dynamic fields and dynamic option sets.
- `validatePropertyValue` / `validatePropertyValues` — return
  `ValidationIssue[]` from `@nodera/contracts`; they never throw on user data.

Definitions hold data only: widgets and renderers belong to the presentation
layer, which maps these types to components.
