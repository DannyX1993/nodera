/**
 * Edge authoring: the published SDK vocabulary translated into the domain's
 * declarative edge definition.
 *
 * Two things only the SDK does: `label` becomes the definition name, and the
 * free-form `style` object is split into the visual keys the domain declares
 * and the renderer-only hints it does not, so nothing an author writes is
 * silently dropped.
 */

import { err, ok, type Result } from "@nodera/contracts";
import { validateEdgeDefinition } from "@nodera/edge-registry";
import type { EdgeDefinition, EdgeVisual } from "@nodera/edge-registry";
import { sdkError, isQualifiedId, type SdkIssue, type SdkIssues } from "../errors.js";
import { DEFAULT_DEFINITION_VERSION } from "./nodes.js";
import type { RendererBinding } from "./renderer-binding.js";
import { fromDomainValidationIssues } from "./validation-issues.js";

/**
 * Presentation style of an edge. The declared `EdgeVisual` keys are typed;
 * every other key is a renderer-only hint (for example `strokeWidth`) that the
 * domain stores under `visual.metadata.style`.
 */
export interface EdgeStyleInput {
  readonly lineStyle?: EdgeVisual["lineStyle"];
  readonly geometry?: EdgeVisual["geometry"];
  readonly arrowStart?: boolean;
  readonly arrowEnd?: boolean;
  readonly color?: string;
  readonly animation?: EdgeVisual["animation"];
  readonly stateIndicatorIds?: readonly string[];
  readonly [hint: string]: unknown;
}

/** One edge definition as the host declares it. */
export interface EdgeDefinitionInput {
  /** Globally qualified type, e.g. `vendor.data-flow`. Becomes the definition id. */
  readonly type: string;
  /** Definition version. Defaults to `1.0.0`. */
  readonly version?: string;
  /** Human-readable label. Becomes the definition name. */
  readonly label: string;
  readonly description?: string;
  /** Presentation contribution, opaque to the SDK. */
  readonly renderer?: unknown;
  /** Visual hints: declared keys plus renderer-only style hints. */
  readonly style?: EdgeStyleInput;
  /** Visual hints declared with the domain's own vocabulary. */
  readonly visual?: EdgeVisual;
  readonly connectionTypes?: readonly string[];
  readonly allowedSourceNodeDefinitionIds?: readonly string[];
  readonly allowedTargetNodeDefinitionIds?: readonly string[];
  readonly customConditionId?: string;
  readonly contextualActions?: EdgeDefinition["contextualActions"];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A translated edge definition plus the renderer it must bind. */
export interface EdgeDefinitionTranslation {
  readonly definition: EdgeDefinition;
  readonly renderer?: RendererBinding;
}

const VISUAL_STYLE_KEYS: readonly string[] = [
  "lineStyle",
  "geometry",
  "arrowStart",
  "arrowEnd",
  "color",
  "animation",
  "stateIndicatorIds",
];

function splitStyle(style: EdgeStyleInput | undefined): {
  readonly known: Partial<EdgeVisual>;
  readonly hints: Readonly<Record<string, unknown>>;
} {
  const known: Record<string, unknown> = {};
  const hints: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (VISUAL_STYLE_KEYS.includes(key)) {
      known[key] = value;
    } else {
      hints[key] = value;
    }
  }
  return { known: known as Partial<EdgeVisual>, hints };
}

function toVisual(input: EdgeDefinitionInput): EdgeVisual | undefined {
  const { known, hints } = splitStyle(input.style);
  const hasKnown = Object.keys(known).length > 0;
  const hasHints = Object.keys(hints).length > 0;
  if (input.visual === undefined && !hasKnown && !hasHints) {
    return undefined;
  }
  const metadata: Record<string, unknown> = { ...(input.visual?.metadata ?? {}) };
  if (hasHints) {
    metadata["style"] = hints;
  }
  return {
    ...(input.visual ?? {}),
    ...known,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

/**
 * Translates one authored edge definition, reporting every invalid part of the
 * input at once.
 */
export function toEdgeDefinition(
  input: EdgeDefinitionInput,
): Result<EdgeDefinitionTranslation, SdkIssues> {
  const issues: SdkIssue[] = [];

  if (!isQualifiedId(input.type)) {
    issues.push({
      ...sdkError(
        "sdk.invalid-id",
        `Edge type "${input.type}" must be globally qualified, e.g. "vendor.feature-name"`,
        { path: ["type"], metadata: { value: input.type } },
      ),
      severity: "error",
    });
  }
  if (input.label.trim().length === 0) {
    issues.push({
      ...sdkError("sdk.invalid-input", "Edge definition must declare a non-empty label", {
        path: ["label"],
      }),
      severity: "error",
    });
  }
  if (issues.length > 0) {
    return err(issues);
  }

  const visual = toVisual(input);
  const definition: EdgeDefinition = {
    id: input.type,
    name: input.label,
    version: input.version ?? DEFAULT_DEFINITION_VERSION,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.renderer === undefined ? {} : { renderer: input.type }),
    ...(visual === undefined ? {} : { visual }),
    ...(input.connectionTypes === undefined
      ? {}
      : { connectionTypes: input.connectionTypes }),
    ...(input.allowedSourceNodeDefinitionIds === undefined
      ? {}
      : { allowedSourceNodeDefinitionIds: input.allowedSourceNodeDefinitionIds }),
    ...(input.allowedTargetNodeDefinitionIds === undefined
      ? {}
      : { allowedTargetNodeDefinitionIds: input.allowedTargetNodeDefinitionIds }),
    ...(input.customConditionId === undefined
      ? {}
      : { customConditionId: input.customConditionId }),
    ...(input.contextualActions === undefined
      ? {}
      : { contextualActions: input.contextualActions }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };

  const domainIssues = fromDomainValidationIssues(validateEdgeDefinition(definition));
  if (domainIssues.length > 0) {
    return err(domainIssues);
  }

  return ok({
    definition,
    ...(input.renderer === undefined
      ? {}
      : { renderer: { id: input.type, value: input.renderer } }),
  });
}
