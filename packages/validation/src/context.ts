import type { ValidationIssue } from "@nodera/contracts";
import type { Graph } from "@nodera/graph-model";
import type { EdgeRegistry, EdgeDefinition } from "@nodera/edge-registry";
import type { NodeRegistry, NodeDefinition } from "@nodera/node-registry";
import type { ValidatorRegistry } from "./validator-registry.js";

/** Validation levels defined by the architecture. */
export type ValidationLevel = "structural" | "domain" | "extension";

/** Everything a validator may inspect. Read-only by contract. */
export interface ValidationContext {
  readonly graph: Graph;
  readonly nodes: NodeRegistry;
  readonly edges: EdgeRegistry;
  /** Registry the context's custom rules are resolved from. */
  readonly validators: ValidatorRegistry;
}

/** A graph-level validator. */
export interface GraphValidator {
  /** Stable validator id, e.g. `nodera.structural`. */
  readonly id: string;
  /** Level this validator reports under. */
  readonly level: ValidationLevel;
  /** Produces normalized, representation-independent issues. */
  validate(context: ValidationContext): readonly ValidationIssue[];
}

/** Input of a custom node rule referenced by a node definition. */
export interface NodeRuleInput {
  readonly node: { readonly id: string };
  readonly definition: NodeDefinition;
  readonly graph: Graph;
  readonly edges: EdgeRegistry;
}

/**
 * A custom node validation rule contributed by an extension. Node
 * definitions reference it by id through `validationRuleIds`; the rule
 * itself is runtime code, never serialized data.
 */
export interface NodeRule {
  /** Stable rule id referenced by node definitions. */
  readonly id: string;
  /** Severity issues from this rule are reported with. */
  readonly severity: "error" | "warning" | "info";
  validate(input: NodeRuleInput): readonly Omit<ValidationIssue, "severity" | "elementId">[];
}

/** Edge definition type re-exported for validator authors. */
export type { EdgeDefinition, NodeDefinition };
