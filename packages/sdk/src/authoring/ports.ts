/**
 * Port authoring: the public, developer-facing port vocabulary.
 *
 * The SDK exposes ports grouped by direction (`inputs`, `outputs`,
 * `bidirectional`) because that is how people describe a node, while the
 * domain stores one flat list of declarations carrying an explicit direction.
 * The translation lives here and nowhere else.
 */

import { err, ok, type Result } from "@nodera/contracts";
import type {
  PortDeclaration,
  PortDirection,
  PortMultiplicity,
} from "@nodera/graph-model";
import { sdkError, type SdkIssue, type SdkIssues } from "../errors.js";

/** One port as the host declares it. */
export interface PortInput {
  /** Stable identifier within the declaring definition, e.g. `trigger`. */
  readonly id: string;
  /** Human-readable port name. */
  readonly name?: string;
  /** Semantic data type exchanged, e.g. `event`. */
  readonly dataType?: string;
  /** How many connections the port accepts. Default: `single`. */
  readonly multiplicity?: PortMultiplicity;
  /** Shorthand for `minConnections: 1`. */
  readonly required?: boolean;
  /** Maximum number of connections; `null` means unbounded. */
  readonly maxConnections?: number | null;
  /** Data types this port accepts, when narrower than its own. */
  readonly allowedDataTypes?: readonly string[];
  /** Node definition types this port may connect to, when restricted. */
  readonly allowedNodeDefinitionIds?: readonly string[];
  /** Identifier of a custom connection condition. */
  readonly customConditionId?: string;
  /** Renderer id the presentation layer resolves for this port. */
  readonly renderer?: string;
  /** Additional declaration metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Ports of a definition, grouped by direction. */
export interface PortGroupInput {
  readonly inputs?: readonly PortInput[];
  readonly outputs?: readonly PortInput[];
  readonly bidirectional?: readonly PortInput[];
}

const GROUPS: readonly (readonly [keyof PortGroupInput, PortDirection])[] = [
  ["inputs", "input"],
  ["outputs", "output"],
  ["bidirectional", "bidirectional"],
];

/** A port id is a short local identifier, not a qualified one. */
const PORT_ID_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;

function toDeclaration(port: PortInput, direction: PortDirection): PortDeclaration {
  return {
    id: port.id,
    direction,
    ...(port.name === undefined ? {} : { name: port.name }),
    ...(port.dataType === undefined ? {} : { dataType: port.dataType }),
    ...(port.multiplicity === undefined ? {} : { multiplicity: port.multiplicity }),
    ...(port.required === true ? { minConnections: 1 } : {}),
    ...(port.maxConnections === undefined ? {} : { maxConnections: port.maxConnections }),
    ...(port.allowedDataTypes === undefined
      ? {}
      : { allowedDataTypes: port.allowedDataTypes }),
    ...(port.allowedNodeDefinitionIds === undefined
      ? {}
      : { allowedNodeDefinitionIds: port.allowedNodeDefinitionIds }),
    ...(port.customConditionId === undefined
      ? {}
      : { customConditionId: port.customConditionId }),
    ...(port.renderer === undefined ? {} : { visual: { renderer: port.renderer } }),
    ...(port.metadata === undefined ? {} : { metadata: port.metadata }),
  };
}

/**
 * Translates grouped authoring ports into flat declarations, reporting every
 * invalid or repeated id instead of silently dropping it.
 */
export function toPortDeclarations(
  group: PortGroupInput = {},
): Result<readonly PortDeclaration[], SdkIssues> {
  const issues: SdkIssue[] = [];
  const declarations: PortDeclaration[] = [];
  const firstGroupById = new Map<string, keyof PortGroupInput>();

  for (const [groupName, direction] of GROUPS) {
    const ports = group[groupName];
    if (ports === undefined) {
      continue;
    }
    for (const port of ports) {
      const path = ["ports", groupName, port.id];
      if (!PORT_ID_PATTERN.test(port.id)) {
        issues.push({
          ...sdkError(
            "sdk.invalid-id",
            `Port id "${port.id}" of the "${groupName}" group must be a short identifier without whitespace`,
            { path },
          ),
          severity: "error",
        });
        continue;
      }
      const firstGroup = firstGroupById.get(port.id);
      if (firstGroup !== undefined) {
        issues.push({
          ...sdkError(
            "sdk.duplicate-id",
            `Port id "${port.id}" is declared in both "${firstGroup}" and "${groupName}"`,
            { path, metadata: { portId: port.id, firstGroup } },
          ),
          severity: "error",
        });
        continue;
      }
      firstGroupById.set(port.id, groupName);
      declarations.push(toDeclaration(port, direction));
    }
  }

  return issues.length > 0 ? err(issues) : ok(declarations);
}
