/**
 * Host compatibility validation (D11, step "validate").
 *
 * A manifest may declare which SDK and which document contract it was authored
 * against. The manager compares that declaration with the facts the host passed
 * to `createPluginManager`, and skips a comparison whose host side is absent:
 * a host that declares no SDK version has nothing to be incompatible with, so
 * it must not be forced to invent one.
 */
import type { PluginIssues, PluginManifest } from "../plugin-api/index.js";
/** Host facts a compatibility declaration is checked against. */
export interface HostCompatibility {
    /** Version of the SDK the host runs; its plugins' ranges are resolved against it. */
    readonly sdkVersion?: string;
    /** Document format the host reads and writes, e.g. `"ggd"`. */
    readonly documentFormat?: string;
    /** Document version the host reads and writes. */
    readonly documentVersion?: string;
}
/** Every reason the manifest is incompatible with the host, or an empty list. */
export declare function checkCompatibility(manifest: PluginManifest, host: HostCompatibility): PluginIssues;
//# sourceMappingURL=compatibility.d.ts.map