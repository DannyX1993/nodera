import {
  RegistryStore,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";

import type { ToolDefinition } from "./tool-definition.js";

/**
 * Registry of the declarative tools an application offers.
 *
 * Tools are shared by every surface (toolbar, palette, context menu), so the
 * registry is the single source of truth for labels, icons, groups and
 * availability rules.
 */
export class ToolRegistry implements DefinitionRegistry<ToolDefinition> {
  private readonly store = new RegistryStore<ToolDefinition>("tool-registry");

  register(tool: ToolDefinition): Result<ToolDefinition, RegistryError> {
    return this.store.register(tool);
  }

  unregister(id: string): Result<ToolDefinition, RegistryError> {
    return this.store.unregister(id);
  }

  get(id: string): ToolDefinition | undefined {
    return this.store.get(id);
  }

  require(id: string): Result<ToolDefinition, RegistryError> {
    return this.store.require(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  all(): readonly ToolDefinition[] {
    return this.store.all();
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * Tools of one group, in registration order.
   *
   * The empty string selects tools that declare no group, so an ungrouped
   * toolbar can be built without inventing a synthetic group id.
   */
  byGroup(group: string): readonly ToolDefinition[] {
    return this.store.all().filter((tool) => (tool.group ?? "") === group);
  }

  /** Unique groups in registration order, excluding ungrouped tools. */
  groups(): readonly string[] {
    const seen = new Set<string>();
    for (const tool of this.store.all()) {
      if (tool.group !== undefined) {
        seen.add(tool.group);
      }
    }
    return [...seen];
  }
}
