import type { PortDeclaration } from "@nodera/graph-model";
import type { PropertyDefinition } from "@nodera/property-system";

/**
 * Whether instances of a node definition accept incoming or outgoing
 * connections at node level. Port-level rules are declared on ports.
 */
export interface NodeConnectionPolicy {
  readonly incoming: "allow" | "forbid";
  readonly outgoing: "allow" | "forbid";
}

/**
 * Visual configuration hints for instances of a node definition. Pure
 * presentation metadata: renderers interpret or ignore it, the domain never
 * does.
 */
export interface NodeVisual {
  readonly color?: string;
  readonly icon?: string;
  /** Additional presentation metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * A declarative node definition: everything an application needs to know
 * about a reusable node type.
 *
 * A definition is independent of its instances: `http.request` is the
 * definition, `node-123` is one instance of it inside a graph. All fields
 * are serializable data; renderer, visual and validation references are
 * stable identifiers resolved by their respective layers.
 */
export interface NodeDefinition {
  /** Globally qualified, stable identifier, e.g. `vendor.http-request`. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Human-readable description. */
  readonly description?: string;
  /** Category used for grouping in registries and palettes. */
  readonly category: string;
  /** Icon identifier for the presentation layer. */
  readonly icon?: string;
  /** Definition version, semver-shaped. */
  readonly version: string;
  /** Renderer id resolved by the presentation layer. */
  readonly renderer?: string;
  /** Port declarations instances of this definition expose. */
  readonly ports: readonly PortDeclaration[];
  /** Property definitions instances of this definition configure. */
  readonly properties: readonly PropertyDefinition[];
  /** Node-level connection policy; default allows everything. */
  readonly connectionPolicy?: NodeConnectionPolicy;
  /** Visual configuration hints. */
  readonly visual?: NodeVisual;
  /** Ids of custom validators contributed by extensions. */
  readonly validationRuleIds?: readonly string[];
  /** Additional definition metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
