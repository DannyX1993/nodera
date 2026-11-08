import {
  RegistryStore,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";

import type { PanelDefinition } from "./panel-definition.js";
import type { PanelRegion } from "./layout.js";

/**
 * Registry of the panels an application provides.
 *
 * Like every Nodera registry it reports duplicate ids and unknown ids explicitly
 * and never overwrites silently. It holds definitions only, so plugins and hosts
 * can contribute panels without importing the visual layer.
 */
export class PanelRegistry implements DefinitionRegistry<PanelDefinition> {
  private readonly store = new RegistryStore<PanelDefinition>("panel-registry");

  register(panel: PanelDefinition): Result<PanelDefinition, RegistryError> {
    return this.store.register(panel);
  }

  unregister(id: string): Result<PanelDefinition, RegistryError> {
    return this.store.unregister(id);
  }

  get(id: string): PanelDefinition | undefined {
    return this.store.get(id);
  }

  require(id: string): Result<PanelDefinition, RegistryError> {
    return this.store.require(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  all(): readonly PanelDefinition[] {
    return this.store.all();
  }

  get size(): number {
    return this.store.size;
  }

  /** Panels whose default region is the given one, in registration order. */
  byRegion(region: PanelRegion): readonly PanelDefinition[] {
    return this.store.all().filter((panel) => panel.region === region);
  }
}
