/**
 * Property authoring: the public, developer-facing property vocabulary.
 *
 * The public vocabulary accepts shorthand the domain deliberately does not:
 * a plain string option list (`["GET", "POST"]`) and an opaque renderer
 * component. Both are normalized here into the declarative property contract
 * of `@nodera/property-system`.
 */

import { err, ok, type Result } from "@nodera/contracts";
import {
  PROPERTY_TYPES,
  isPropertyType,
  type PropertyDefinition,
  type PropertyOption,
} from "@nodera/property-system";
import type { RendererBinding } from "./renderer-binding.js";
import { sdkError, type SdkIssue, type SdkIssues } from "../errors.js";

/** One property as the host declares it. */
export interface PropertyInput {
  /** Stable identifier within its owner, e.g. `url`. */
  readonly id: string;
  /** Declarative data type; see `PROPERTY_TYPES`. */
  readonly type: PropertyDefinition["type"];
  readonly label?: string;
  readonly description?: string;
  readonly defaultValue?: unknown;
  readonly required?: boolean;
  readonly editable?: boolean;
  readonly visible?: boolean;
  readonly order?: number;
  readonly group?: string;
  /** Options as plain strings or full `{ value, label }` pairs. */
  readonly options?: readonly (string | PropertyOption)[];
  readonly schema?: PropertyDefinition["schema"];
  readonly validations?: PropertyDefinition["validations"];
  readonly visibleWhen?: PropertyDefinition["visibleWhen"];
  readonly enabledWhen?: PropertyDefinition["enabledWhen"];
  readonly dependsOn?: readonly string[];
  readonly optionSets?: PropertyDefinition["optionSets"];
  /** Opaque renderer component (bound) or an already registered component id. */
  readonly component?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Options that shape one property translation. */
export interface PropertyTranslationOptions {
  /** Owner definition type, used to derive a stable component id. */
  readonly ownerType?: string;
}

/** A translated property plus the opaque renderer it must bind, if any. */
export interface PropertyTranslation {
  readonly definition: PropertyDefinition;
  readonly component?: RendererBinding;
}

/** A property id is a short local identifier, optionally dot-qualified. */
const PROPERTY_ID_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

function toOptions(
  options: readonly (string | PropertyOption)[],
): readonly PropertyOption[] {
  return options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
}

/**
 * Translates one authored property, reporting every structural violation of
 * the public vocabulary instead of deferring it to a validator the caller may
 * never run (properties are also registered on their own, without a node).
 */
export function toPropertyDefinition(
  input: PropertyInput,
  options: PropertyTranslationOptions = {},
): Result<PropertyTranslation, SdkIssues> {
  const issues: SdkIssue[] = [];
  const base = ["properties", input.id];

  if (!PROPERTY_ID_PATTERN.test(input.id)) {
    issues.push({
      ...sdkError(
        "sdk.invalid-id",
        `Property id "${input.id}" must be a non-empty identifier without whitespace`,
        { path: ["properties", input.id] },
      ),
      severity: "error",
    });
  }

  if (!isPropertyType(input.type)) {
    issues.push({
      ...sdkError(
        "sdk.invalid-input",
        `Unknown property type "${String(input.type)}"; expected one of: ${PROPERTY_TYPES.join(", ")}`,
        { path: [...base, "type"], metadata: { value: input.type } },
      ),
      severity: "error",
    });
  } else if (input.type === "select" || input.type === "multi-select") {
    if (input.options === undefined || input.options.length === 0) {
      issues.push({
        ...sdkError(
          "sdk.invalid-input",
          `Property "${input.id}" of type "${input.type}" must declare at least one option`,
          { path: [...base, "options"] },
        ),
        severity: "error",
      });
    }
  }

  let component: RendererBinding | undefined;
  let componentId: string | undefined;
  if (input.component !== undefined) {
    if (typeof input.component === "string") {
      componentId = input.component;
    } else {
      componentId =
        options.ownerType === undefined
          ? input.id
          : `${options.ownerType}.${input.id}`;
      component = { id: componentId, value: input.component };
    }
  }
  if (input.type === "custom" && componentId === undefined) {
    issues.push({
      ...sdkError(
        "sdk.invalid-input",
        `Property "${input.id}" of type "custom" must declare a component`,
        { path: [...base, "component"] },
      ),
      severity: "error",
    });
  }

  if (issues.length > 0) {
    return err(issues);
  }

  const definition: PropertyDefinition = {
    id: input.id,
    type: input.type,
    ...(input.label === undefined ? {} : { label: input.label }),
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.defaultValue === undefined ? {} : { defaultValue: input.defaultValue }),
    ...(input.required === undefined ? {} : { required: input.required }),
    ...(input.editable === undefined ? {} : { editable: input.editable }),
    ...(input.visible === undefined ? {} : { visible: input.visible }),
    ...(input.order === undefined ? {} : { order: input.order }),
    ...(input.group === undefined ? {} : { group: input.group }),
    ...(input.options === undefined ? {} : { options: toOptions(input.options) }),
    ...(input.schema === undefined ? {} : { schema: input.schema }),
    ...(input.validations === undefined ? {} : { validations: input.validations }),
    ...(input.visibleWhen === undefined ? {} : { visibleWhen: input.visibleWhen }),
    ...(input.enabledWhen === undefined ? {} : { enabledWhen: input.enabledWhen }),
    ...(input.dependsOn === undefined ? {} : { dependsOn: input.dependsOn }),
    ...(input.optionSets === undefined ? {} : { optionSets: input.optionSets }),
    ...(componentId === undefined ? {} : { component: componentId }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };

  return ok(component === undefined ? { definition } : { definition, component });
}
