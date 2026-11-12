import type { PluginIssues, PluginManifest } from "../plugin-api/index.js";
import { type Result } from "@nodera/contracts";
/** Validates an untrusted value as a plugin manifest. */
export declare function validatePluginManifest(value: unknown): Result<PluginManifest, PluginIssues>;
//# sourceMappingURL=manifest-validator.d.ts.map