import {
  duplicateIdError,
  err,
  notFoundError,
  RegistryStore,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";
import type {
  ConnectionCondition,
  GraphValidator,
  NodeRule,
  PropertyCondition,
  PropertyRule,
} from "./context.js";

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
  private readonly connectionConditions = new Map<string, ConnectionCondition>();
  private readonly propertyConditions = new Map<string, PropertyCondition>();
  private readonly propertyRules = new Map<string, PropertyRule>();

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

  /**
   * Registers a custom connection condition. Duplicate ids are conflicts:
   * the id is the stable contract ports and edge definitions reference.
   */
  registerConnectionCondition(
    condition: ConnectionCondition,
  ): Result<ConnectionCondition, RegistryError> {
    if (this.connectionConditions.has(condition.id)) {
      return err(duplicateIdError(condition.id, "ValidatorRegistry connection conditions"));
    }
    this.connectionConditions.set(condition.id, condition);
    return { ok: true, value: condition };
  }

  unregisterConnectionCondition(id: string): Result<ConnectionCondition, RegistryError> {
    const existing = this.connectionConditions.get(id);
    if (existing === undefined) {
      return err(notFoundError(id, "ValidatorRegistry connection conditions"));
    }
    this.connectionConditions.delete(id);
    return { ok: true, value: existing };
  }

  getConnectionCondition(id: string): ConnectionCondition | undefined {
    return this.connectionConditions.get(id);
  }

  /** Registers a custom property condition (visibility/editability). */
  registerPropertyCondition(
    condition: PropertyCondition,
  ): Result<PropertyCondition, RegistryError> {
    if (this.propertyConditions.has(condition.id)) {
      return err(duplicateIdError(condition.id, "ValidatorRegistry property conditions"));
    }
    this.propertyConditions.set(condition.id, condition);
    return { ok: true, value: condition };
  }

  unregisterPropertyCondition(id: string): Result<PropertyCondition, RegistryError> {
    const existing = this.propertyConditions.get(id);
    if (existing === undefined) {
      return err(notFoundError(id, "ValidatorRegistry property conditions"));
    }
    this.propertyConditions.delete(id);
    return { ok: true, value: existing };
  }

  getPropertyCondition(id: string): PropertyCondition | undefined {
    return this.propertyConditions.get(id);
  }

  /** Registers a custom property validation rule. */
  registerPropertyRule(rule: PropertyRule): Result<PropertyRule, RegistryError> {
    if (this.propertyRules.has(rule.id)) {
      return err(duplicateIdError(rule.id, "ValidatorRegistry property rules"));
    }
    this.propertyRules.set(rule.id, rule);
    return { ok: true, value: rule };
  }

  unregisterPropertyRule(id: string): Result<PropertyRule, RegistryError> {
    const existing = this.propertyRules.get(id);
    if (existing === undefined) {
      return err(notFoundError(id, "ValidatorRegistry property rules"));
    }
    this.propertyRules.delete(id);
    return { ok: true, value: existing };
  }

  getPropertyRule(id: string): PropertyRule | undefined {
    return this.propertyRules.get(id);
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
