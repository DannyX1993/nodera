/**
 * Node authoring: the published SDK vocabulary translated into the domain's
 * declarative node definition.
 *
 * The public vocabulary says `type` and `label`; the domain says `id` and
 * `name`. The translation happens here, once, and the result is validated with
 * the domain's own `validateNodeDefinition` so the SDK never reimplements a
 * rule the core already owns.
 */

import { err, ok, type Result } from "@nodera/contracts";
import { validateNodeDefinition } from "@nodera/node-registry";
import type { NodeDefinition } from "@nodera/node-registry";
import type { PropertyDefinition } from "@nodera/property-system";
import {
  isPlainObject,
  isQualifiedId,
  sdkError,
  shapeIssue,
  stringFieldIssue,
  type SdkIssue,
  type SdkIssues,
} from "../errors.js";
import { toPortDeclarations, type PortGroupInput } from "./ports.js";
import { toPropertyDefinition, type PropertyInput } from "./properties.js";
import type { RendererBinding } from "./renderer-binding.js";
import { fromDomainValidationIssues } from "./validation-issues.js";

/** Version given to a definition that does not declare one. */
export const DEFAULT_DEFINITION_VERSION = "1.0.0";

/** One node definition as the host declares it. */
export interface NodeDefinitionInput {
  /** Globally qualified type, e.g. `http.request`. Becomes the definition id. */
  readonly type: string;
  /** Definition version. Defaults to `1.0.0`. */
  readonly version?: string;
  /** Human-readable label. Becomes the definition name. */
  readonly label: string;
  readonly description?: string;
  /** Category used to group definitions in palettes and registries. */
  readonly category: string;
  readonly icon?: string;
  readonly ports?: PortGroupInput;
  readonly properties?: readonly PropertyInput[];
  readonly connectionPolicy?: NodeDefinition["connectionPolicy"];
  readonly visual?: NodeDefinition["visual"];
  readonly validationRuleIds?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  /**
   * Presentation contribution, opaque to the SDK. Never stored in the
   * definition: the definition carries the derived renderer id instead.
   */
  readonly renderer?: unknown;
}

/** A translated node definition plus the renderers it must bind. */
export interface NodeDefinitionTranslation {
  readonly definition: NodeDefinition;
  /** Renderer of the node itself, when the host supplied one. */
  readonly renderer?: RendererBinding;
  /** Renderers of `custom` properties, derived from the node type. */
  readonly components: readonly RendererBinding[];
}

/** Text fields of a node definition, once each one proved to be a string. */
interface NodeTextFields {
  readonly type: string;
  readonly label: string;
  readonly category: string;
  readonly version: string | undefined;
}

/**
 * Reads the required text fields of a node definition.
 *
 * Returns `undefined` when one of them is missing or is not a string, so the
 * caller never builds a definition from a value it only hoped was text.
 */
function readTextFields(
  input: NodeDefinitionInput,
  issues: SdkIssue[],
): NodeTextFields | undefined {
  const { type, label, category, version } = input;
  let complete = true;

  if (typeof type !== "string") {
    issues.push(
      shapeIssue("Node definition must declare type as a string", type, ["type"]),
    );
    complete = false;
  } else if (!isQualifiedId(type)) {
    issues.push({
      ...sdkError(
        "sdk.invalid-id",
        `Node type "${type}" must be globally qualified, e.g. "vendor.feature-name"`,
        { path: ["type"], metadata: { value: type } },
      ),
      severity: "error",
    });
  }

  if (typeof label !== "string" || label.trim().length === 0) {
    issues.push(stringFieldIssue("Node definition", "label", label, ["label"]));
    complete = false;
  }
  if (typeof category !== "string" || category.trim().length === 0) {
    issues.push(stringFieldIssue("Node definition", "category", category, ["category"]));
    complete = false;
  }
  if (version !== undefined && typeof version !== "string") {
    issues.push(shapeIssue("Node definition must declare version as a string", version, ["version"]));
    complete = false;
  }

  if (!complete || typeof type !== "string" || typeof label !== "string" || typeof category !== "string") {
    return undefined;
  }
  return { type, label, category, version: typeof version === "string" ? version : undefined };
}

/**
 * Translates one authored node definition.
 *
 * Every invalid part of the input is reported at once: an author fixing a
 * definition sees all its problems, not one per attempt.
 */
export function toNodeDefinition(
  input: NodeDefinitionInput,
): Result<NodeDefinitionTranslation, SdkIssues> {
  if (!isPlainObject(input)) {
    return err([
      shapeIssue(
        "Node definition must be an object declaring type, label and category",
        input,
        ["node"],
      ),
    ]);
  }

  const issues: SdkIssue[] = [];
  const fields = readTextFields(input, issues);

  if (input.ports !== undefined && !isPlainObject(input.ports)) {
    issues.push(
      shapeIssue(
        "Node ports must be an object grouping inputs, outputs and bidirectional",
        input.ports,
        ["ports"],
      ),
    );
  }

  const declaredProperties = input.properties;
  if (declaredProperties !== undefined && !Array.isArray(declaredProperties)) {
    issues.push(
      shapeIssue("Node properties must be an array of property definitions", declaredProperties, [
        "properties",
      ]),
    );
  }
  const propertyInputs: readonly PropertyInput[] = Array.isArray(declaredProperties)
    ? declaredProperties
    : [];

  const ports = toPortDeclarations(input.ports ?? {});
  if (!ports.ok) {
    issues.push(...ports.error);
  }

  const properties: PropertyDefinition[] = [];
  const components: RendererBinding[] = [];
  for (const property of propertyInputs) {
    const translated = toPropertyDefinition(property, {
      ownerType: fields?.type ?? "",
    });
    if (!translated.ok) {
      issues.push(...translated.error);
      continue;
    }
    properties.push(translated.value.definition);
    if (translated.value.component !== undefined) {
      components.push(translated.value.component);
    }
  }

  if (issues.length > 0 || fields === undefined) {
    return err(issues);
  }

  const definition: NodeDefinition = {
    id: fields.type,
    name: fields.label,
    category: fields.category,
    version: fields.version ?? DEFAULT_DEFINITION_VERSION,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.icon === undefined ? {} : { icon: input.icon }),
    ...(input.renderer === undefined ? {} : { renderer: fields.type }),
    ports: ports.ok ? ports.value : [],
    properties,
    ...(input.connectionPolicy === undefined
      ? {}
      : { connectionPolicy: input.connectionPolicy }),
    ...(input.visual === undefined ? {} : { visual: input.visual }),
    ...(input.validationRuleIds === undefined
      ? {}
      : { validationRuleIds: input.validationRuleIds }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };

  const domainIssues = fromDomainValidationIssues(validateNodeDefinition(definition));
  if (domainIssues.length > 0) {
    return err(domainIssues);
  }

  return ok({
    definition,
    ...(input.renderer === undefined
      ? {}
      : { renderer: { id: fields.type, value: input.renderer } }),
    components,
  });
}
