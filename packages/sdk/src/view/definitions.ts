/**
 * Definition views: the §9 vocabulary of PRODUCT-DESCRIPTION for everything a
 * host reads out of a definition registry.
 *
 * The core definitions speak `id`/`name`; §9 ("Contratos públicos y tipado")
 * speaks `type`/`label`. The authoring layer already translates one into the
 * other on the way in, so a view translates it back on the way out: a host that
 * wrote `{ type, label }` reads `{ type, label }`, and no core name ever reaches
 * a public signature.
 *
 * Two mapping rules are not mechanical renames:
 *
 * - `required` is derived (`minConnections >= 1`). §9's port vocabulary has a
 *   boolean where the domain has a numeric threshold; a port without a minimum
 *   is simply not required, which is what a renderer needs to draw an asterisk.
 * - `customConditionId` is the authoring name of the domain's `conditionId`,
 *   echoed here so a host learns one spelling for it, not two.
 *
 * The functions are pure: they never throw, never mutate the definition, and
 * every optional key is omitted rather than set to `undefined`, because the
 * SDK compiles with `exactOptionalPropertyTypes`.
 */

import type { EdgeDefinition } from "@nodera/edge-registry";
import type { PortDeclaration, PortDirection } from "@nodera/graph-model";
import type { NodeDefinition } from "@nodera/node-registry";
import type { PropertyDefinition } from "@nodera/property-system";

/** One port of a node definition, as §9 describes it. */
export interface PortView {
  /** Stable port id within its definition. */
  readonly id: string;
  /** Direction the port faces. */
  readonly direction: PortDirection;
  /** Human-readable port name. */
  readonly name?: string;
  /** Semantic data type exchanged; absent means polymorphic. */
  readonly dataType?: string;
  /** How many connections the port accepts. Default in the domain: `single`. */
  readonly multiplicity?: "single" | "multiple";
  /** Minimum number of connections the domain declares, when it declares one. */
  readonly minConnections?: number;
  /** Maximum number of connections; `null` means unbounded. */
  readonly maxConnections?: number | null;
  /**
   * Whether the port demands at least one connection.
   *
   * Derived from `minConnections >= 1`. A port with no declared minimum is not
   * required, so this is always a boolean and never a threshold.
   */
  readonly required: boolean;
  /** Renderer id the presentation layer resolves for this port. */
  readonly renderer?: string;
}

/** One node definition, in the §9 vocabulary a host authored. */
export interface NodeDefinitionView {
  /** Globally qualified definition type; the core definition's `id`. */
  readonly type: string;
  /** Definition version, semver-shaped. */
  readonly version: string;
  /** Human-readable label; the core definition's `name`. */
  readonly label: string;
  readonly description?: string;
  readonly category: string;
  readonly icon?: string;
  readonly ports: readonly PortView[];
  /** Property definitions, already declared with §9-compatible names. */
  readonly properties: readonly PropertyDefinition[];
  /** Renderer id the presentation layer resolves for nodes of this type. */
  readonly renderer?: string;
  readonly connectionPolicy?: NodeDefinition["connectionPolicy"];
  readonly visual?: NodeDefinition["visual"];
  /** Ids of custom validators contributed by extensions. */
  readonly validationRuleIds?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** One edge definition, in the §9 vocabulary a host authored. */
export interface EdgeDefinitionView {
  /** Globally qualified definition type; the core definition's `id`. */
  readonly type: string;
  /** Definition version, semver-shaped. */
  readonly version: string;
  /** Human-readable label; the core definition's `name`. */
  readonly label: string;
  readonly description?: string;
  /**
   * Label an instance of this type may inherit.
   *
   * Distinct from {@link NodeDefinitionView.label} and from an instance's own
   * `label`: this is the authored default the host wrote, kept because dropping
   * authored data would be a silent loss.
   */
  readonly defaultLabel?: string;
  /** Renderer id the presentation layer resolves for edges of this type. */
  readonly renderer?: string;
  /** Semantic connection types this definition models. */
  readonly connectionTypes?: readonly string[];
  readonly allowedSourceNodeDefinitionIds?: readonly string[];
  readonly allowedTargetNodeDefinitionIds?: readonly string[];
  /** Custom condition a connection of this type must satisfy; the core `conditionId`. */
  readonly customConditionId?: string;
  readonly visual?: EdgeDefinition["visual"];
  readonly contextualActions?: EdgeDefinition["contextualActions"];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Maps one port declaration to its §9 view. */
export function toPortView(port: PortDeclaration): PortView {
  return {
    id: port.id,
    direction: port.direction,
    ...(port.name === undefined ? {} : { name: port.name }),
    ...(port.dataType === undefined ? {} : { dataType: port.dataType }),
    ...(port.multiplicity === undefined ? {} : { multiplicity: port.multiplicity }),
    ...(port.minConnections === undefined ? {} : { minConnections: port.minConnections }),
    ...(port.maxConnections === undefined ? {} : { maxConnections: port.maxConnections }),
    required: (port.minConnections ?? 0) >= 1,
    ...(port.visual?.renderer === undefined ? {} : { renderer: port.visual.renderer }),
  };
}

/** Maps one node definition to its §9 view. */
export function toNodeDefinitionView(definition: NodeDefinition): NodeDefinitionView {
  return {
    type: definition.id,
    version: definition.version,
    label: definition.name,
    ...(definition.description === undefined ? {} : { description: definition.description }),
    category: definition.category,
    ...(definition.icon === undefined ? {} : { icon: definition.icon }),
    ports: definition.ports.map(toPortView),
    properties: definition.properties,
    ...(definition.renderer === undefined ? {} : { renderer: definition.renderer }),
    ...(definition.connectionPolicy === undefined
      ? {}
      : { connectionPolicy: definition.connectionPolicy }),
    ...(definition.visual === undefined ? {} : { visual: definition.visual }),
    ...(definition.validationRuleIds === undefined
      ? {}
      : { validationRuleIds: definition.validationRuleIds }),
    ...(definition.metadata === undefined ? {} : { metadata: definition.metadata }),
  };
}

/** Maps one edge definition to its §9 view. */
export function toEdgeDefinitionView(definition: EdgeDefinition): EdgeDefinitionView {
  return {
    type: definition.id,
    version: definition.version,
    label: definition.name,
    ...(definition.description === undefined ? {} : { description: definition.description }),
    ...(definition.label === undefined ? {} : { defaultLabel: definition.label }),
    ...(definition.renderer === undefined ? {} : { renderer: definition.renderer }),
    ...(definition.connectionTypes === undefined
      ? {}
      : { connectionTypes: definition.connectionTypes }),
    ...(definition.allowedSourceNodeDefinitionIds === undefined
      ? {}
      : { allowedSourceNodeDefinitionIds: definition.allowedSourceNodeDefinitionIds }),
    ...(definition.allowedTargetNodeDefinitionIds === undefined
      ? {}
      : { allowedTargetNodeDefinitionIds: definition.allowedTargetNodeDefinitionIds }),
    ...(definition.conditionId === undefined
      ? {}
      : { customConditionId: definition.conditionId }),
    ...(definition.visual === undefined ? {} : { visual: definition.visual }),
    ...(definition.contextualActions === undefined
      ? {}
      : { contextualActions: definition.contextualActions }),
    ...(definition.metadata === undefined ? {} : { metadata: definition.metadata }),
  };
}
