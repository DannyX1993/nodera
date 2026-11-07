import type { ValidationIssue } from "@nodera/contracts";
import type { Graph } from "@nodera/graph-model";
import type { EdgeRegistry, EdgeDefinition } from "@nodera/edge-registry";
import type { NodeRegistry, NodeDefinition } from "@nodera/node-registry";
import type { PropertyDefinition } from "@nodera/property-system";
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

/** Input of a custom connection condition. */
export interface ConnectionConditionInput {
  readonly edgeId: string;
  readonly sourceNodeId: string;
  readonly sourcePortId: string;
  readonly targetNodeId: string;
  readonly targetPortId: string;
}

/**
 * A custom connection condition contributed by an extension. Ports declare
 * it through `customConditionId` and edge definitions through `conditionId`;
 * the evaluator is runtime code, never serialized data.
 */
export interface ConnectionCondition {
  /** Stable id referenced by port declarations and edge definitions. */
  readonly id: string;
  /** True when the connection satisfies the condition. */
  evaluate(input: ConnectionConditionInput): boolean;
}

/** A custom property visibility/editability condition, evaluated by values. */
export interface PropertyCondition {
  /** Stable id referenced by `custom` visibility/enabled conditions. */
  readonly id: string;
  evaluate(values: Readonly<Record<string, unknown>>): boolean;
}

/** Input of a custom property validation rule. */
export interface PropertyRuleInput {
  readonly definition: PropertyDefinition;
  readonly value: unknown;
}

/**
 * A custom property validation rule. Property definitions reference it
 * through `{ kind: "custom", validatorId }` validations.
 */
export interface PropertyRule {
  /** Stable id referenced by property definitions. */
  readonly id: string;
  /** Severity issues from this rule are reported with. */
  readonly severity: "error" | "warning" | "info";
  validate(input: PropertyRuleInput): readonly Omit<ValidationIssue, "severity" | "elementId">[];
}

/** Edge definition type re-exported for validator authors. */
export type { EdgeDefinition, NodeDefinition };
