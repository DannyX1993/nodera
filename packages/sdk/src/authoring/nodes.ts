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
import { sdkError, isQualifiedId, type SdkIssue, type SdkIssues } from "../errors.js";
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

/**
 * Translates one authored node definition.
 *
 * Every invalid part of the input is reported at once: an author fixing a
 * definition sees all its problems, not one per attempt.
 */
export function toNodeDefinition(
  input: NodeDefinitionInput,
): Result<NodeDefinitionTranslation, SdkIssues> {
  const issues: SdkIssue[] = [];

  if (!isQualifiedId(input.type)) {
    issues.push({
      ...sdkError(
        "sdk.invalid-id",
        `Node type "${input.type}" must be globally qualified, e.g. "vendor.feature-name"`,
        { path: ["type"], metadata: { value: input.type } },
      ),
      severity: "error",
    });
  }
  if (input.label.trim().length === 0) {
    issues.push({
      ...sdkError("sdk.invalid-input", "Node definition must declare a non-empty label", {
        path: ["label"],
      }),
      severity: "error",
    });
  }
  if (input.category.trim().length === 0) {
    issues.push({
      ...sdkError("sdk.invalid-input", "Node definition must declare a non-empty category", {
        path: ["category"],
      }),
      severity: "error",
    });
  }

  const ports = toPortDeclarations(input.ports ?? {});
  if (!ports.ok) {
    issues.push(...ports.error);
  }

  const properties: PropertyDefinition[] = [];
  const components: RendererBinding[] = [];
  for (const property of input.properties ?? []) {
    const translated = toPropertyDefinition(property, { ownerType: input.type });
    if (!translated.ok) {
      issues.push(...translated.error);
      continue;
    }
    properties.push(translated.value.definition);
    if (translated.value.component !== undefined) {
      components.push(translated.value.component);
    }
  }

  if (issues.length > 0) {
    return err(issues);
  }

  const definition: NodeDefinition = {
    id: input.type,
    name: input.label,
    category: input.category,
    version: input.version ?? DEFAULT_DEFINITION_VERSION,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.icon === undefined ? {} : { icon: input.icon }),
    ...(input.renderer === undefined ? {} : { renderer: input.type }),
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
      : { renderer: { id: input.type, value: input.renderer } }),
    components,
  });
}
