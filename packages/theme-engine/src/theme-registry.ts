import {
  RegistryStore,
  notFoundError,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";

import { DEFAULT_THEME, DEFAULT_THEME_ID, DARK_THEME } from "./theme-presets.js";
import type { ThemeDefinition } from "./theme.js";

/** Options accepted by {@link ThemeRegistry}. */
export interface ThemeRegistryOptions {
  /** Themes available to the editor. Defaults to the built-in light and dark themes. */
  readonly themes?: readonly ThemeDefinition[];
  /** Theme used when the host does not select one. Defaults to `nodera.light`. */
  readonly defaultThemeId?: string;
}

/**
 * Registry of the themes an application can apply.
 *
 * Behaves like every Nodera definition registry: duplicate ids are explicit
 * conflicts and unknown ids are explicit not-found results, never silent
 * overwrites. It exposes only contracts, so it can live without any visual
 * dependency (PRODUCT-DESCRIPTION §3.6: "Los registros deben ser accesibles
 * mediante contratos del dominio o de aplicación, sin depender de la interfaz
 * visual").
 */
export class ThemeRegistry implements DefinitionRegistry<ThemeDefinition> {
  private readonly store = new RegistryStore<ThemeDefinition>("theme-registry");
  private currentDefaultId: string;

  constructor(options: ThemeRegistryOptions = {}) {
    const themes = options.themes ?? [DEFAULT_THEME, DARK_THEME];
    for (const theme of themes) {
      const registered = this.store.register(theme);
      if (!registered.ok) {
        throw new Error(registered.error.message);
      }
    }

    this.currentDefaultId = options.defaultThemeId ?? DEFAULT_THEME_ID;
    if (!this.store.has(this.currentDefaultId)) {
      throw new Error(notFoundError(this.currentDefaultId, "theme-registry").message);
    }
  }

  register(theme: ThemeDefinition): Result<ThemeDefinition, RegistryError> {
    return this.store.register(theme);
  }

  unregister(id: string): Result<ThemeDefinition, RegistryError> {
    return this.store.unregister(id);
  }

  get(id: string): ThemeDefinition | undefined {
    return this.store.get(id);
  }

  require(id: string): Result<ThemeDefinition, RegistryError> {
    return this.store.require(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  all(): readonly ThemeDefinition[] {
    return this.store.all();
  }

  get size(): number {
    return this.store.size;
  }

  /** Id of the theme applied when the host selects none. */
  get defaultThemeId(): string {
    return this.currentDefaultId;
  }

  /** Theme applied when the host selects none. */
  getDefault(): ThemeDefinition {
    const theme = this.store.get(this.currentDefaultId);
    if (theme === undefined) {
      // Unreachable: construction and setDefault both require a registered id.
      throw new Error(notFoundError(this.currentDefaultId, "theme-registry").message);
    }
    return theme;
  }

  /** Selects the default theme. Rejects ids that are not registered. */
  setDefault(id: string): Result<ThemeDefinition, RegistryError> {
    const theme = this.store.require(id);
    if (!theme.ok) {
      return theme;
    }
    this.currentDefaultId = id;
    return theme;
  }
}
