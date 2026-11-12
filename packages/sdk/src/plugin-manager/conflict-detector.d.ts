import type { PluginIssues, PluginManifest } from "../plugin-api/index.js";
import { type Result } from "@nodera/contracts";
/**
 * Pre-flight conflict detection over declarative manifests (S5, D10).
 *
 * Two plugins must never accidentally claim the same plugin id, and two
 * declared contributions must never claim the same `(type, id)`. Detecting this
 * from the manifests happens before any plugin code runs, so a collision is a
 * diagnostic instead of a silent overwrite.
 */
export declare function detectPluginConflicts(manifests: readonly PluginManifest[]): Result<void, PluginIssues>;
//# sourceMappingURL=conflict-detector.d.ts.map