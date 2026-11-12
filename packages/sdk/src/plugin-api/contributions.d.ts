/**
 * Declarative contribution descriptors.
 *
 * A manifest lists the contributions a plugin *intends* to register, as a
 * closed set of `{ type, id }` entries. The manager uses this list for
 * pre-flight conflict detection before any plugin code runs; the plugin's
 * `activate` hook then actually registers the definitions through the
 * contribution surface (the SDK `PluginApi`).
 */
/** The kinds of contribution a plugin can declare (FASE7: nodes…interface actions). */
export type PluginContributionKind = "node" | "edge" | "property" | "renderer" | "tool" | "panel" | "validator" | "theme" | "layout" | "layout-strategy" | "importer" | "exporter" | "dialog";
/** One declared contribution. */
export interface PluginContribution {
    readonly type: PluginContributionKind;
    /** Globally qualified id of the contributed definition. */
    readonly id: string;
    /** Version of the definition the plugin contributes (FASE7 versioning). */
    readonly version?: string;
}
//# sourceMappingURL=contributions.d.ts.map