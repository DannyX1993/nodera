import type { RegistryEntry } from "@nodera/contracts";

import { cssVariables, freezeDesignTokens, type DesignTokens } from "./theme-tokens.js";

/**
 * Declarative theme definition.
 *
 * A theme describes the visual identity of the editor (Level 1 customization:
 * "Cambiar colores, tipografía, sombras, espaciado y estilos generales"). It is
 * pure data, identified by a stable id, and never holds renderers.
 */
export interface ThemeDefinition extends RegistryEntry {
  /** Globally qualified, stable id, e.g. `acme.brand`. */
  readonly id: string;
  /** Human-readable name shown by host theme pickers. */
  readonly name: string;
  /** Optional description for host UIs and documentation. */
  readonly description?: string;
  /** Default color scheme hint for native controls and overlays. */
  readonly colorScheme?: "light" | "dark";
  /** Complete design token set of the theme. */
  readonly tokens: DesignTokens;
  /** Host-extensible metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Input accepted by {@link createTheme}. */
export interface CreateThemeInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly colorScheme?: "light" | "dark";
  readonly tokens: DesignTokens;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Builds a frozen theme definition.
 *
 * Freezing is deliberate: themes are shared between registries, providers and
 * renderers, so a host mutating one token group must not silently change others
 * that already captured the same object.
 */
export function createTheme(input: CreateThemeInput): ThemeDefinition {
  if (input.id === "") {
    throw new Error("theme id must not be empty");
  }
  if (input.name === "") {
    throw new Error("theme name must not be empty");
  }

  const theme: ThemeDefinition = {
    id: input.id,
    name: input.name,
    tokens: freezeDesignTokens(input.tokens),
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.colorScheme === undefined ? {} : { colorScheme: input.colorScheme }),
    ...(input.metadata === undefined ? {} : { metadata: Object.freeze({ ...input.metadata }) }),
  };
  return Object.freeze(theme);
}

/** Projects a theme into the CSS custom properties a DOM host applies. */
export function themeToCssVariables(theme: ThemeDefinition): Record<string, string> {
  return cssVariables(theme.tokens);
}
