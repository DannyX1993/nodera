import {
  err,
  notFoundError,
  RegistryStore,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";
import type { EdgeDefinition } from "./edge-definition.js";

/**
 * Registry of edge definitions: register, query by id and connection type,
 * update (explicit replace) and remove.
 *
 * Registration never overwrites silently: replacing requires an explicit
 * `replace`, and registering a used id is a duplicate conflict.
 */
export class EdgeRegistry implements DefinitionRegistry<EdgeDefinition> {
  private readonly store = new RegistryStore<EdgeDefinition>("EdgeRegistry");

  register(definition: EdgeDefinition): Result<EdgeDefinition, RegistryError> {
    return this.store.register(definition);
  }

  /**
   * Explicitly replaces an existing definition with the same id. Fails with
   * `not-found` when the id is not registered.
   */
  replace(definition: EdgeDefinition): Result<EdgeDefinition, RegistryError> {
    if (!this.store.has(definition.id)) {
      return err(notFoundError(definition.id, "EdgeRegistry"));
    }
    this.store.unregister(definition.id);
    return this.store.register(definition);
  }

  unregister(id: string): Result<EdgeDefinition, RegistryError> {
    return this.store.unregister(id);
  }

  get(id: string): EdgeDefinition | undefined {
    return this.store.get(id);
  }

  require(id: string): Result<EdgeDefinition, RegistryError> {
    return this.store.require(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  /** All definitions modeling a given connection type. */
  byConnectionType(connectionType: string): readonly EdgeDefinition[] {
    return this.store.all().filter(
      (definition) => definition.connectionTypes?.includes(connectionType) === true,
    );
  }

  all(): readonly EdgeDefinition[] {
    return this.store.all();
  }

  get size(): number {
    return this.store.size;
  }
}
