import {
  RegistryStore,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";

import type { DialogDefinition } from "./dialog-definition.js";
import { DEFAULT_DIALOGS } from "./defaults/default-dialogs.js";

/**
 * Options accepted by {@link DialogRegistry}.
 *
 * `dialogs` *replaces* the built-in list instead of extending it, the same rule
 * `LayoutRegistry` applies to layouts: a host that does not want the
 * node-creation dialog passes only its own definitions.
 */
export interface DialogRegistryOptions {
  /** Dialogs available to the host. Defaults to `DEFAULT_DIALOGS`. */
  readonly dialogs?: readonly DialogDefinition[];
}

/**
 * Registry of the dialogs an application provides.
 *
 * Like every Nodera registry it reports duplicate ids and unknown ids explicitly
 * and never overwrites silently. A dialog is always opened *by id*
 * (`UiStateStore.openDialog`) and resolved here, so there is no default
 * selection to fall back to: a dialog nobody registered can never appear.
 *
 * The constructor seeds {@link DEFAULT_DIALOGS} so the framework's own “+”
 * affordance works out of the box; passing `dialogs` replaces that list
 * entirely. There is deliberately no second registry concept and no separate
 * factory: one registry, one seeding rule.
 */
export class DialogRegistry implements DefinitionRegistry<DialogDefinition> {
  private readonly store = new RegistryStore<DialogDefinition>("dialog-registry");

  constructor(options: DialogRegistryOptions = {}) {
    for (const dialog of options.dialogs ?? DEFAULT_DIALOGS) {
      const registered = this.store.register(dialog);
      if (!registered.ok) {
        throw new Error(registered.error.message);
      }
    }
  }

  register(dialog: DialogDefinition): Result<DialogDefinition, RegistryError> {
    return this.store.register(dialog);
  }

  unregister(id: string): Result<DialogDefinition, RegistryError> {
    return this.store.unregister(id);
  }

  get(id: string): DialogDefinition | undefined {
    return this.store.get(id);
  }

  require(id: string): Result<DialogDefinition, RegistryError> {
    return this.store.require(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  all(): readonly DialogDefinition[] {
    return this.store.all();
  }

  get size(): number {
    return this.store.size;
  }
}
