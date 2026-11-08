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
import {
  isPlainObject,
  isQualifiedId,
  sdkError,
  shapeIssue,
  stringFieldIssue,
  type SdkIssue,
  type SdkIssues,
} from "../errors.js";
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
  const style = isPlainObject(input.style) ? input.style : undefined;
  const { known, hints } = splitStyle(style);
  const hasKnown = Object.keys(known).length > 0;
  const hasHints = Object.keys(hints).length > 0;
  if (input.visual === undefined && !hasKnown && !hasHints) {
    return undefined;
  }
  const metadata: Record<string, unknown> = { ...(input.visual?.metadata ?? {}) };
  if (hasHints) {
    // A host may declare `visual.metadata.style` directly; its keys are merged
    // with the `style` shorthand instead of being replaced, so no authored hint
    // is ever lost. The shorthand wins on a key declared in both places.
    const declared = metadata["style"];
    metadata["style"] =
      declared !== null && typeof declared === "object" && !Array.isArray(declared)
        ? { ...declared, ...hints }
        : hints;
  }
  return {
    ...(input.visual ?? {}),
    ...known,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

/** Text fields of an edge definition, once each one proved to be a string. */
interface EdgeTextFields {
  readonly type: string;
  readonly label: string;
  readonly version: string | undefined;
}

/**
 * Reads the required text fields of an edge definition, or `undefined` when
 * one of them is missing or is not a string.
 */
function readTextFields(
  input: EdgeDefinitionInput,
  issues: SdkIssue[],
): EdgeTextFields | undefined {
  const { type, label, version } = input;
  let complete = true;

  if (typeof type !== "string") {
    issues.push(
      shapeIssue("Edge definition must declare type as a string", type, ["type"]),
    );
    complete = false;
  } else if (!isQualifiedId(type)) {
    issues.push({
      ...sdkError(
        "sdk.invalid-id",
        `Edge type "${type}" must be globally qualified, e.g. "vendor.feature-name"`,
        { path: ["type"], metadata: { value: type } },
      ),
      severity: "error",
    });
  }

  if (typeof label !== "string" || label.trim().length === 0) {
    issues.push(stringFieldIssue("Edge definition", "label", label, ["label"]));
    complete = false;
  }
  if (version !== undefined && typeof version !== "string") {
    issues.push(
      shapeIssue("Edge definition must declare version as a string", version, ["version"]),
    );
    complete = false;
  }

  if (!complete || typeof type !== "string" || typeof label !== "string") {
    return undefined;
  }
  return { type, label, version: typeof version === "string" ? version : undefined };
}

/**
 * Translates one authored edge definition, reporting every invalid part of the
 * input at once.
 */
export function toEdgeDefinition(
  input: EdgeDefinitionInput,
): Result<EdgeDefinitionTranslation, SdkIssues> {
  if (!isPlainObject(input)) {
    return err([
      shapeIssue(
        "Edge definition must be an object declaring at least a type and a label",
        input,
        ["edge"],
      ),
    ]);
  }

  const issues: SdkIssue[] = [];
  const fields = readTextFields(input, issues);

  if (input.style !== undefined && !isPlainObject(input.style)) {
    issues.push(
      shapeIssue("Edge style must be an object of visual hints", input.style, ["style"]),
    );
  }
  if (input.visual !== undefined && !isPlainObject(input.visual)) {
    issues.push(
      shapeIssue("Edge visual must be an object of declared visual keys", input.visual, [
        "visual",
      ]),
    );
  }

  if (issues.length > 0 || fields === undefined) {
    return err(issues);
  }

  const visual = toVisual(input);
  const definition: EdgeDefinition = {
    id: fields.type,
    name: fields.label,
    version: fields.version ?? DEFAULT_DEFINITION_VERSION,
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.renderer === undefined ? {} : { renderer: fields.type }),
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
      : { renderer: { id: fields.type, value: input.renderer } }),
  });
}
