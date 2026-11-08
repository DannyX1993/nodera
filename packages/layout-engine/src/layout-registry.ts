import {
  RegistryStore,
  notFoundError,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";
import type { LayoutDefinition } from "@nodera/ui-core";

import { EDITOR_LAYOUT_ID, PREDEFINED_LAYOUTS } from "./predefined-layouts.js";

/** Options accepted by {@link LayoutRegistry}. */
export interface LayoutRegistryOptions {
  /** Layouts available to the host. Defaults to the predefined layouts. */
  readonly layouts?: readonly LayoutDefinition[];
  /** Layout applied when the host selects none. Defaults to `nodera.layout.editor`. */
  readonly defaultLayoutId?: string;
}

/**
 * Registry of the layouts an application declares.
 *
 * Layouts are data, so hosts and plugins can contribute compositions without
 * importing the visual layer, and the framework never imposes one.
 */
export class LayoutRegistry implements DefinitionRegistry<LayoutDefinition> {
  private readonly store = new RegistryStore<LayoutDefinition>("layout-registry");
  private currentDefaultId: string;

  constructor(options: LayoutRegistryOptions = {}) {
    for (const layout of options.layouts ?? PREDEFINED_LAYOUTS) {
      const registered = this.store.register(layout);
      if (!registered.ok) {
        throw new Error(registered.error.message);
      }
    }

    const initialDefault =
      options.defaultLayoutId ?? options.layouts?.[0]?.id ?? EDITOR_LAYOUT_ID;
    this.currentDefaultId = initialDefault;
    if (!this.store.has(this.currentDefaultId)) {
      throw new Error(notFoundError(this.currentDefaultId, "layout-registry").message);
    }
  }

  register(layout: LayoutDefinition): Result<LayoutDefinition, RegistryError> {
    return this.store.register(layout);
  }

  unregister(id: string): Result<LayoutDefinition, RegistryError> {
    return this.store.unregister(id);
  }

  get(id: string): LayoutDefinition | undefined {
    return this.store.get(id);
  }

  require(id: string): Result<LayoutDefinition, RegistryError> {
    return this.store.require(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  all(): readonly LayoutDefinition[] {
    return this.store.all();
  }

  get size(): number {
    return this.store.size;
  }

  /** Id of the layout applied when the host selects none. */
  get defaultLayoutId(): string {
    return this.currentDefaultId;
  }

  /** Layout applied when the host selects none. */
  getDefault(): LayoutDefinition {
    const layout = this.store.get(this.currentDefaultId);
    if (layout === undefined) {
      // Unreachable: construction and setDefault both require a registered id.
      throw new Error(notFoundError(this.currentDefaultId, "layout-registry").message);
    }
    return layout;
  }

  /** Selects the default layout. Rejects ids that are not registered. */
  setDefault(id: string): Result<LayoutDefinition, RegistryError> {
    const layout = this.store.require(id);
    if (!layout.ok) {
      return layout;
    }
    this.currentDefaultId = id;
    return layout;
  }
}
