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
  PortPlacement,
} from "@nodera/graph-model";
import {
  isPlainObject,
  sdkError,
  shapeIssue,
  type SdkIssue,
  type SdkIssues,
} from "../errors.js";

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
  /**
   * Side of the node the port is drawn on.
   *
   * Omitted, the presentation layer derives it from the port direction and the
   * layout axis. Set it to pin a port regardless of the layout, e.g. an output
   * that must always leave to the right.
   */
  readonly placement?: PortPlacement;
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

/** Every side a port may be drawn on, in the order diagnostics list them. */
const PORT_PLACEMENTS: readonly PortPlacement[] = ["left", "right", "top", "bottom"];

function isPortPlacement(value: unknown): value is PortPlacement {
  return PORT_PLACEMENTS.some((placement) => placement === value);
}

/**
 * Visual hints of a port, present only when the author declared any.
 *
 * Both hints share one `visual` entry, so declaring one must never drop the
 * other.
 */
function toVisual(port: PortInput): PortDeclaration["visual"] {
  if (port.renderer === undefined && port.placement === undefined) {
    return undefined;
  }
  return {
    ...(port.renderer === undefined ? {} : { renderer: port.renderer }),
    ...(port.placement === undefined ? {} : { placement: port.placement }),
  };
}

function toDeclaration(port: PortInput, direction: PortDirection): PortDeclaration {
  const visual = toVisual(port);
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
    ...(visual === undefined ? {} : { visual }),
    ...(port.metadata === undefined ? {} : { metadata: port.metadata }),
  };
}

/**
 * Translates grouped authoring ports into flat declarations, reporting every
 * invalid or repeated id instead of silently dropping it.
 *
 * Ports are data, so the group and each declaration are shape-checked here:
 * the flat declarations below dereference every field, and a port that is not
 * an object must never reach them.
 */
export function toPortDeclarations(
  group: PortGroupInput = {},
): Result<readonly PortDeclaration[], SdkIssues> {
  if (!isPlainObject(group)) {
    return err([
      shapeIssue(
        "Ports must be an object grouping inputs, outputs and bidirectional",
        group,
        ["ports"],
      ),
    ]);
  }

  const issues: SdkIssue[] = [];
  const declarations: PortDeclaration[] = [];
  const firstGroupById = new Map<string, keyof PortGroupInput>();

  for (const [groupName, direction] of GROUPS) {
    const declaredPorts = group[groupName];
    if (declaredPorts === undefined) {
      continue;
    }
    if (!Array.isArray(declaredPorts)) {
      issues.push(
        shapeIssue(
          `Ports "${groupName}" must be an array of port declarations`,
          declaredPorts,
          ["ports", groupName],
        ),
      );
      continue;
    }
    const portInputs: readonly PortInput[] = declaredPorts;
    portInputs.forEach((port, index) => {
      if (!isPlainObject(port)) {
        issues.push(
          shapeIssue(
            `Port "${groupName}" must be an object declaring at least an id`,
            port,
            ["ports", groupName, String(index)],
          ),
        );
        return;
      }
      const path = ["ports", groupName, port.id];
      if (typeof port.id !== "string" || !PORT_ID_PATTERN.test(port.id)) {
        issues.push({
          ...sdkError(
            "sdk.invalid-id",
            `Port id "${String(port.id)}" of the "${groupName}" group must be a short identifier without whitespace`,
            { path: ["ports", groupName, String(port.id ?? index)] },
          ),
          severity: "error",
        });
        return;
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
        return;
      }
      firstGroupById.set(port.id, groupName);
      if (port.placement !== undefined && !isPortPlacement(port.placement)) {
        issues.push(
          shapeIssue(
            `Port "${port.id}" must declare placement as one of "left", "right", "top" or "bottom"`,
            port.placement,
            path,
          ),
        );
        return;
      }
      declarations.push(toDeclaration(port, direction));
    });
  }

  return issues.length > 0 ? err(issues) : ok(declarations);
}
