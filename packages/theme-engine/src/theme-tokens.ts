/**
 * Design tokens for the Nodera UI layer.
 *
 * Tokens are declarative data: plain `string` values grouped by the customization
 * concern they serve. They never hold components, functions or framework objects,
 * so a theme can be stored, diffed, merged and serialized by any host.
 *
 * Groups are open records on purpose: a host may add its own token keys to an
 * existing group, and the projection into CSS custom properties keeps them.
 */

/** Customization concern a token belongs to. */
export type ThemeTokenGroup =
  | "colors"
  | "spacing"
  | "typography"
  | "borders"
  | "shadows"
  | "icons"
  | "node"
  | "edge"
  | "handle"
  | "selection"
  | "canvas";

/** Open set of string tokens for one customization concern. */
export type ThemeTokenScale = Readonly<Record<string, string>>;

/**
 * Complete token set of a theme.
 *
 * Every group is required so a theme is always fully applicable: a partial theme
 * would leave the UI with undefined visuals.
 */
export interface DesignTokens {
  readonly colors: ThemeTokenScale;
  readonly spacing: ThemeTokenScale;
  readonly typography: ThemeTokenScale;
  readonly borders: ThemeTokenScale;
  readonly shadows: ThemeTokenScale;
  readonly icons: ThemeTokenScale;
  readonly node: ThemeTokenScale;
  readonly edge: ThemeTokenScale;
  readonly handle: ThemeTokenScale;
  readonly selection: ThemeTokenScale;
  readonly canvas: ThemeTokenScale;
}

/** Token groups in projection order. */
export const THEME_TOKEN_GROUPS: readonly ThemeTokenGroup[] = [
  "colors",
  "spacing",
  "typography",
  "borders",
  "shadows",
  "icons",
  "node",
  "edge",
  "handle",
  "selection",
  "canvas",
];

/** Prefix of every Nodera CSS custom property. */
export const CSS_VARIABLE_PREFIX = "--ndr";

/** A patch over a token set: any group, any subset of keys. */
export type DesignTokensPatch = Partial<Record<ThemeTokenGroup, ThemeTokenScale>>;

/** Converts a token key (`surfaceAlt`) into its CSS variable segment (`surface-alt`). */
function toVariableSegment(key: string): string {
  return key
    .replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    .replace(/^[-_]+/, "")
    .replace(/[-_]{2,}/g, "-");
}

/**
 * Builds the CSS custom property name for a token.
 *
 * Throws on empty inputs: a malformed variable name would silently produce an
 * unusable stylesheet entry instead of surfacing the defect.
 */
export function tokenVariableName(group: ThemeTokenGroup | "", key: string): string {
  if (group === "") {
    throw new Error("token group must not be empty");
  }
  if (key === "") {
    throw new Error("token key must not be empty");
  }
  return `${CSS_VARIABLE_PREFIX}-${group}-${toVariableSegment(key)}`;
}

/**
 * Projects a full token set into CSS custom properties.
 *
 * The result is the framework-agnostic bridge between the token model and any
 * DOM host: it contains strings only, in declaration order, with one entry per
 * declared token.
 */
export function cssVariables(tokens: DesignTokens): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const group of THEME_TOKEN_GROUPS) {
    const scale = tokens[group];
    for (const [key, value] of Object.entries(scale)) {
      variables[tokenVariableName(group, key)] = value;
    }
  }
  return variables;
}

/**
 * Merges a token patch over a base token set.
 *
 * Only patched groups are rebuilt; untouched groups keep their identity so
 * consumers comparing token objects do not see spurious changes.
 */
export function mergeDesignTokens(base: DesignTokens, patch: DesignTokensPatch): DesignTokens {
  const merged = { ...base } as Record<ThemeTokenGroup, ThemeTokenScale>;
  for (const group of THEME_TOKEN_GROUPS) {
    const patchScale = patch[group];
    if (patchScale === undefined) {
      continue;
    }
    merged[group] = { ...base[group], ...patchScale };
  }
  return merged as unknown as DesignTokens;
}

/** Deeply freezes the token groups of a theme. */
export function freezeDesignTokens(tokens: DesignTokens): DesignTokens {
  for (const group of THEME_TOKEN_GROUPS) {
    Object.freeze(tokens[group]);
  }
  return Object.freeze(tokens);
}
