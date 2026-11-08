/**
 * The engine-agnostic presentation port.
 *
 * The SDK never imports a canvas library, a framework or a renderer. A host
 * selects the engine behind the builder by supplying an adapter that declares,
 * as data, what it can present. A new graph engine is therefore a new adapter
 * package, never a change to the SDK.
 */

import { err, ok, type Result } from "@nodera/contracts";
import type { EdgeVisual } from "@nodera/edge-registry";
import {
  isPlainObject,
  isQualifiedId,
  sdkError,
  shapeIssue,
  stringFieldIssue,
  type SdkIssue,
  type SdkIssues,
} from "../errors.js";

/** Every capability an adapter may declare. */
export const ADAPTER_CAPABILITIES = [
  "canvas",
  "minimap",
  "controls",
  "zoomPan",
  "dragAndDrop",
  "nodeRenderers",
  "edgeRenderers",
  "portRenderers",
  "propertyRenderers",
  "edgeStyles",
  "customPanels",
] as const;

/** One presentation capability. */
export type AdapterCapability = (typeof ADAPTER_CAPABILITIES)[number];

/** What an adapter can present, fully resolved. */
export type AdapterCapabilities = Readonly<Record<AdapterCapability, boolean>>;

/** A presentation engine the builder can be configured with. */
export interface BuilderAdapter {
  /** Globally qualified id, e.g. `nodera.react-flow`. */
  readonly id: string;
  /** Human-readable engine name. */
  readonly label: string;
  readonly capabilities: AdapterCapabilities;
}

/** What a host declares when configuring an adapter. */
export interface BuilderAdapterInput {
  readonly id: string;
  readonly label: string;
  /** Omitted capabilities are `false`; `canvas` is the only default `true`. */
  readonly capabilities?: Partial<AdapterCapabilities>;
}

const DEFAULT_CAPABILITIES: AdapterCapabilities = {
  canvas: true,
  minimap: false,
  controls: false,
  zoomPan: false,
  dragAndDrop: false,
  nodeRenderers: false,
  edgeRenderers: false,
  portRenderers: false,
  propertyRenderers: false,
  edgeStyles: false,
  customPanels: false,
};

/** Whether a key is a capability the port declares. */
function isCapability(key: string): key is AdapterCapability {
  return (ADAPTER_CAPABILITIES as readonly string[]).includes(key);
}

/** Validates an adapter declaration and resolves its capabilities. */
export function normalizeAdapter(
  input: BuilderAdapterInput,
): Result<BuilderAdapter, SdkIssues> {
  if (!isPlainObject(input)) {
    return err([
      shapeIssue(
        "Adapter must be an object declaring an id, a label and its capabilities",
        input,
        ["adapter"],
      ),
    ]);
  }

  const issues: SdkIssue[] = [];
  const id = typeof input.id === "string" ? input.id : undefined;
  const label =
    typeof input.label === "string" && input.label.trim().length > 0
      ? input.label
      : undefined;

  if (id === undefined) {
    issues.push(
      shapeIssue("Adapter must declare id as a string", input.id, ["adapter", "id"]),
    );
  } else if (!isQualifiedId(id)) {
    issues.push({
      ...sdkError(
        "sdk.invalid-id",
        `Adapter id "${id}" must be globally qualified, e.g. "vendor.canvas-engine"`,
        { path: ["adapter", "id"], metadata: { value: id } },
      ),
      severity: "error",
    });
  }
  if (label === undefined) {
    issues.push(stringFieldIssue("Adapter", "label", input.label, ["adapter", "label"]));
  }

  const overrides: Partial<Record<AdapterCapability, boolean>> = {};
  if (input.capabilities !== undefined) {
    if (!isPlainObject(input.capabilities)) {
      issues.push(
        shapeIssue(
          "Adapter capabilities must be an object of booleans",
          input.capabilities,
          ["adapter", "capabilities"],
        ),
      );
    } else {
      for (const [capability, value] of Object.entries(input.capabilities)) {
        if (!isCapability(capability)) {
          issues.push(
            shapeIssue(
              `Adapter capability "${capability}" is not one of: ${ADAPTER_CAPABILITIES.join(", ")}`,
              value,
              ["adapter", "capabilities", capability],
            ),
          );
          continue;
        }
        if (value !== undefined && typeof value !== "boolean") {
          issues.push(
            shapeIssue(
              `Adapter capability "${capability}" must be a boolean`,
              value,
              ["adapter", "capabilities", capability],
            ),
          );
          continue;
        }
        if (typeof value === "boolean") {
          overrides[capability] = value;
        }
      }
    }
  }

  if (issues.length > 0 || id === undefined || label === undefined) {
    return err(issues);
  }
  const capabilities: AdapterCapabilities = { ...DEFAULT_CAPABILITIES, ...overrides };
  return ok({ id, label, capabilities });
}

/** Presentation surface a set of authored definitions actually needs. */
export interface AdapterRequirements {
  readonly nodeRenderers: boolean;
  readonly edgeRenderers: boolean;
  readonly portRenderers: boolean;
  readonly propertyRenderers: boolean;
  readonly edgeStyles: boolean;
}

/** Minimal structural view of a node definition needed to derive requirements. */
export interface RequirementNode {
  readonly renderer?: string;
  readonly ports?: readonly {
    readonly visual?: { readonly renderer?: string };
  }[];
  readonly properties?: readonly { readonly component?: string }[];
}

/** Minimal structural view of an edge definition needed to derive requirements. */
export interface RequirementEdge {
  readonly renderer?: string;
  readonly visual?: EdgeVisual;
}

/** Derives the presentation surface the authored definitions rely on. */
export function requirementsFrom(input: {
  readonly nodes: readonly RequirementNode[];
  readonly edges: readonly RequirementEdge[];
}): AdapterRequirements {
  return {
    nodeRenderers: input.nodes.some((node) => node.renderer !== undefined),
    edgeRenderers: input.edges.some((edge) => edge.renderer !== undefined),
    portRenderers: input.nodes.some((node) =>
      (node.ports ?? []).some((port) => port.visual?.renderer !== undefined),
    ),
    propertyRenderers: input.nodes.some((node) =>
      (node.properties ?? []).some((property) => property.component !== undefined),
    ),
    edgeStyles: input.edges.some((edge) => edge.visual !== undefined),
  };
}

/**
 * Reports the capabilities the selected engine cannot honour.
 *
 * These are warnings, not errors: the definition stays registered and a host
 * may still wire that renderer itself. Silently ignoring the gap is what the
 * SDK refuses to do.
 */
export function capabilityGaps(
  adapter: BuilderAdapter | undefined,
  requirements: AdapterRequirements,
): SdkIssues {
  if (adapter === undefined) {
    return [];
  }
  const gaps: SdkIssue[] = [];
  for (const capability of Object.keys(requirements) as (keyof AdapterRequirements)[]) {
    if (!requirements[capability] || adapter.capabilities[capability]) {
      continue;
    }
    gaps.push({
      ...sdkError(
        "sdk.renderer-unsupported",
        `Adapter "${adapter.id}" does not declare the "${capability}" capability the authored definitions need`,
        { metadata: { adapterId: adapter.id, capability } },
      ),
      severity: "warning",
    });
  }
  return gaps;
}
