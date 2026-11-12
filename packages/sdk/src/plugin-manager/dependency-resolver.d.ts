import type { PluginIssues, PluginManifest } from "../plugin-api/index.js";
import { type Result } from "@nodera/contracts";
/**
 * Dependency resolution inside the discovered plugin set (D3, D10).
 *
 * Resolution never downloads anything: the host decides which plugins exist
 * (S6/S7) and this pure step only orders them. It reports missing dependencies,
 * cycles and versions that miss the declared range, and otherwise returns a
 * dependency-first order so a manager can register/activate safely.
 */
export declare function resolveDependencyOrder(manifests: readonly PluginManifest[]): Result<readonly PluginManifest[], PluginIssues>;
//# sourceMappingURL=dependency-resolver.d.ts.map