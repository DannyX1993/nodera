/**
 * Plugin identity rules.
 *
 * Every plugin and every contribution it declares carries a globally qualified
 * identifier (`vendor.feature-name`) so two independent authors can never
 * collide accidentally and so a manifest can be validated before any code runs.
 */

/** Globally qualified identifier: at least one dot, no whitespace, no empty segment. */
const PLUGIN_ID_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+$/;

/**
 * Whether an id is a globally qualified plugin identifier (`vendor.feature-name`).
 *
 * This is the single identity rule shared by plugin ids and contribution ids.
 */
export function isPluginId(value: unknown): value is string {
  return typeof value === "string" && PLUGIN_ID_PATTERN.test(value);
}
