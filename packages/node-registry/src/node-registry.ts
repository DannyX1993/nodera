import {
  duplicateIdError,
  err,
  notFoundError,
  RegistryStore,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";
import type { NodeDefinition } from "./node-definition.js";

/**
 * Registry of node definitions: register, query by id and category,
 * update (explicit replace) and remove.
 *
 * Registration never overwrites silently: replacing a definition requires an
 * explicit `replace`, and registering a used id is a duplicate conflict.
 */
export class NodeRegistry implements DefinitionRegistry<NodeDefinition> {
  private readonly store = new RegistryStore<NodeDefinition>("NodeRegistry");

  register(definition: NodeDefinition): Result<NodeDefinition, RegistryError> {
    return this.store.register(definition);
  }

  /**
   * Explicitly replaces an existing definition with the same id. Fails with
   * `not-found` when the id is not registered, so updates never become
   * accidental inserts.
   */
  replace(definition: NodeDefinition): Result<NodeDefinition, RegistryError> {
    if (!this.store.has(definition.id)) {
      return err(notFoundError(definition.id, "NodeRegistry"));
    }
    this.store.unregister(definition.id);
    return this.store.register(definition);
  }

  unregister(id: string): Result<NodeDefinition, RegistryError> {
    return this.store.unregister(id);
  }

  get(id: string): NodeDefinition | undefined {
    return this.store.get(id);
  }

  require(id: string): Result<NodeDefinition, RegistryError> {
    return this.store.require(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  /** All definitions of a category, in registration order. */
  byCategory(category: string): readonly NodeDefinition[] {
    return this.store.all().filter((definition) => definition.category === category);
  }

  /** Categories in use, sorted alphabetically. */
  categories(): readonly string[] {
    return [...new Set(this.store.all().map((definition) => definition.category))].sort();
  }

  all(): readonly NodeDefinition[] {
    return this.store.all();
  }

  get size(): number {
    return this.store.size;
  }
}
