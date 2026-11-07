import type { JsonSchema } from "./json-schema.js";
import type { PropertyType } from "./property-type.js";

/** One option of a `select` / `multi-select` property. */
export interface PropertyOption {
  /** Serializable value stored in the document. */
  readonly value: string;
  /** Human-readable label. */
  readonly label: string;
}

/**
 * Declarative validation rules beyond structure. Values and bounds are data;
 * custom rules are stable identifiers resolved by validators or plugins, so
 * definitions never embed functions.
 */
export type PropertyValidation =
  | { readonly kind: "min"; readonly value: number }
  | { readonly kind: "max"; readonly value: number }
  | { readonly kind: "minLength"; readonly value: number }
  | { readonly kind: "maxLength"; readonly value: number }
  | { readonly kind: "pattern"; readonly value: string }
  | { readonly kind: "custom"; readonly validatorId: string };

/**
 * Serializable, representation-independent visibility condition used for
 * dynamic properties: fields can be shown or hidden based on the values of
 * other fields.
 */
export type PropertyVisibilityCondition =
  | { readonly kind: "propertyEquals"; readonly propertyId: string; readonly value: unknown }
  | { readonly kind: "propertyNotEquals"; readonly propertyId: string; readonly value: unknown }
  | { readonly kind: "propertyDefined"; readonly propertyId: string }
  | { readonly kind: "allOf"; readonly conditions: readonly PropertyVisibilityCondition[] }
  | { readonly kind: "anyOf"; readonly conditions: readonly PropertyVisibilityCondition[] }
  | { readonly kind: "custom"; readonly conditionId: string };

/**
 * An alternative option set applied dynamically. Conditions use the same
 * serializable, representation-independent evaluation as visibility.
 */
export interface PropertyOptionSet {
  readonly when: PropertyVisibilityCondition;
  readonly options: readonly PropertyOption[];
}

/**
 * A declarative property definition.
 *
 * The data contract (type plus optional JSON Schema constraints) stays
 * separate from the presentation hints; a renderer reads the UI fields but
 * the domain only reads data.
 */
export interface PropertyDefinition {
  /** Stable property identifier within its node definition. */
  readonly id: string;
  /** Data type of the property. */
  readonly type: PropertyType;
  /** Human-readable label. */
  readonly label?: string;
  /** Human-readable description. */
  readonly description?: string;
  /** Value used when an instance does not define one. */
  readonly defaultValue?: unknown;
  /** Whether the value must be provided. Default: false. */
  readonly required?: boolean;
  /** Whether instances may edit the value. Default: true. */
  readonly editable?: boolean;
  /** Whether the property is shown at all. Default: true. */
  readonly visible?: boolean;
  /** Presentation order within its group. */
  readonly order?: number;
  /** Grouping key so renderers can cluster related properties. */
  readonly group?: string;
  /** Options for `select` and `multi-select` properties. */
  readonly options?: readonly PropertyOption[];
  /** JSON Schema (Draft 2020-12) constraints refining the data contract. */
  readonly schema?: JsonSchema;
  /** Additional declarative validation rules. */
  readonly validations?: readonly PropertyValidation[];
  /** Dynamic visibility condition evaluated against other property values. */
  readonly visibleWhen?: PropertyVisibilityCondition;
  /**
   * Dynamic editability: the property is only editable when the condition
   * holds. Stored values stay valid; this gates modification, not validity.
   */
  readonly enabledWhen?: PropertyVisibilityCondition;
  /** Ids of other properties this one depends on (renderer reactivity). */
  readonly dependsOn?: readonly string[];
  /**
   * Alternative option sets for `select` / `multi-select`: the first set
   * whose condition holds replaces the static `options`. Lets one field
   * modify another dynamically while staying fully serializable.
   */
  readonly optionSets?: readonly PropertyOptionSet[];
  /** Registered custom component id; required for `custom` type. */
  readonly component?: string;
  /** Additional definition metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
