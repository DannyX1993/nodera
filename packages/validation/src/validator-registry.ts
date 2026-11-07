import {
  duplicateIdError,
  err,
  notFoundError,
  RegistryStore,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";
import type { GraphValidator, NodeRule } from "./context.js";

/**
 * Registry of validators: built-in validators, graph-level validators
 * contributed by extensions, and custom node rules referenced by node
 * definitions through stable ids.
 */
export class ValidatorRegistry
  implements DefinitionRegistry<GraphValidator>
{
  private readonly graphValidators = new RegistryStore<GraphValidator>(
    "ValidatorRegistry",
  );
  private readonly nodeRules = new Map<string, NodeRule>();

  /** Registers a graph-level validator. Duplicate ids are conflicts. */
  registerValidator(validator: GraphValidator): Result<GraphValidator, RegistryError> {
    return this.graphValidators.register(validator);
  }

  unregisterValidator(id: string): Result<GraphValidator, RegistryError> {
    return this.graphValidators.unregister(id);
  }

  getValidator(id: string): GraphValidator | undefined {
    return this.graphValidators.get(id);
  }

  requireValidator(id: string): Result<GraphValidator, RegistryError> {
    return this.graphValidators.require(id);
  }

  allValidators(): readonly GraphValidator[] {
    return this.graphValidators.all();
  }

  get validatorCount(): number {
    return this.graphValidators.size;
  }

  /**
   * Registers a custom node rule. Duplicate ids are conflicts: the rule id
   * is the stable contract node definitions reference.
   */
  registerNodeRule(rule: NodeRule): Result<NodeRule, RegistryError> {
    if (this.nodeRules.has(rule.id)) {
      return err(duplicateIdError(rule.id, "ValidatorRegistry node rules"));
    }
    this.nodeRules.set(rule.id, rule);
    return { ok: true, value: rule };
  }

  unregisterNodeRule(id: string): Result<NodeRule, RegistryError> {
    const existing = this.nodeRules.get(id);
    if (existing === undefined) {
      return err(notFoundError(id, "ValidatorRegistry node rules"));
    }
    this.nodeRules.delete(id);
    return { ok: true, value: existing };
  }

  /** Returns a node rule by id, if registered. */
  getNodeRule(id: string): NodeRule | undefined {
    return this.nodeRules.get(id);
  }

  nodeRuleCount(): number {
    return this.nodeRules.size;
  }

  // DefinitionRegistry conformance (graph validators).
  register(entry: GraphValidator): Result<GraphValidator, RegistryError> {
    return this.registerValidator(entry);
  }

  unregister(id: string): Result<GraphValidator, RegistryError> {
    return this.unregisterValidator(id);
  }

  get(id: string): GraphValidator | undefined {
    return this.getValidator(id);
  }

  require(id: string): Result<GraphValidator, RegistryError> {
    return this.requireValidator(id);
  }

  has(id: string): boolean {
    return this.graphValidators.has(id);
  }

  all(): readonly GraphValidator[] {
    return this.allValidators();
  }

  get size(): number {
    return this.validatorCount;
  }
}
