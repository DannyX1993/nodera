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
import {
  identifierFieldIssue,
  isPlainObject,
  shapeIssue,
  sdkError,
  type SdkIssue,
  type SdkIssues,
} from "../errors.js";

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

/** Options entry that is neither a string nor a `{ value, label }` pair. */
function isOptionInput(option: unknown): boolean {
  return (
    typeof option === "string" ||
    (isPlainObject(option) &&
      "value" in option &&
      "label" in option &&
      typeof option.value === "string" &&
      typeof option.label === "string")
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
  if (!isPlainObject(input)) {
    return err([
      shapeIssue(
        "Property definition must be an object declaring at least an id and a type",
        input,
        ["property"],
      ),
    ]);
  }

  const issues: SdkIssue[] = [];
  const id = typeof input.id === "string" ? input.id : undefined;
  const base = id === undefined ? ["properties"] : ["properties", id];

  if (id === undefined || !PROPERTY_ID_PATTERN.test(id)) {
    issues.push(
      identifierFieldIssue("Property definition", "id", input.id, ["properties"]),
    );
  }

  if (typeof input.type !== "string" || !isPropertyType(input.type)) {
    issues.push({
      ...sdkError(
        "sdk.invalid-input",
        `Unknown property type "${String(input.type)}"; expected one of: ${PROPERTY_TYPES.join(", ")}`,
        { path: [...base, "type"], metadata: { value: input.type } },
      ),
      severity: "error",
    });
  } else if (input.type === "select" || input.type === "multi-select") {
    if (!Array.isArray(input.options) || input.options.length === 0) {
      issues.push({
        ...sdkError(
          "sdk.invalid-input",
          `Property "${String(input.id)}" of type "${input.type}" must declare at least one option`,
          { path: [...base, "options"] },
        ),
        severity: "error",
      });
    }
  }

  if (input.options !== undefined) {
    const declaredOptions = input.options;
    if (!Array.isArray(declaredOptions)) {
      issues.push(
        shapeIssue(
          `Property "${String(input.id)}" must declare its options as an array`,
          declaredOptions,
          [...base, "options"],
        ),
      );
    } else {
      const optionInputs: readonly (string | PropertyOption)[] = declaredOptions;
      optionInputs.forEach((option, index) => {
        if (!isOptionInput(option)) {
          issues.push(
            shapeIssue(
              "A property option must be a string or a { value, label } pair of strings",
              option,
              [...base, "options", String(index)],
            ),
          );
        }
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
  if (typeof input.type === "string" && input.type === "custom" && componentId === undefined) {
    issues.push({
      ...sdkError(
        "sdk.invalid-input",
        `Property "${String(input.id)}" of type "custom" must declare a component`,
        { path: [...base, "component"] },
      ),
      severity: "error",
    });
  }

  if (issues.length > 0 || id === undefined) {
    return err(issues);
  }

  const definition: PropertyDefinition = {
    id,
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
