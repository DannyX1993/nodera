/**
 * Plugin identity rules.
 *
 * Every plugin and every contribution it declares carries a globally qualified
 * identifier (`vendor.feature-name`) so two independent authors can never
 * collide accidentally and so a manifest can be validated before any code runs.
 */
/**
 * Whether an id is a globally qualified plugin identifier (`vendor.feature-name`).
 *
 * This is the single identity rule shared by plugin ids and contribution ids.
 */
export declare function isPluginId(value: unknown): value is string;
//# sourceMappingURL=ids.d.ts.map