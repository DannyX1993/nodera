import type { CSSProperties } from "react";

import { themeToCssVariables, type ThemeDefinition } from "@nodera/theme-engine";

/**
 * Projects a theme into the inline style a DOM wrapper applies.
 *
 * `themeToCssVariables` produces the framework-agnostic `--ndr-*` custom
 * property map (D2). React's `CSSProperties` type does not model custom
 * properties, so the map is cast: every key is a `--`-prefixed property name
 * and every value is a string, which is exactly what React writes through
 * `style.setProperty`. No stylesheet is required, and hosts can still override
 * any token with their own CSS because the contract is CSS variables.
 */
export function themeStyle(theme: ThemeDefinition): CSSProperties {
  return themeToCssVariables(theme) as CSSProperties;
}
