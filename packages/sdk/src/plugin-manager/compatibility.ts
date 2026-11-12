/**
 * Host compatibility validation (D11, step "validate").
 *
 * A manifest may declare which SDK and which document contract it was authored
 * against. The manager compares that declaration with the facts the host passed
 * to `createPluginManager`, and skips a comparison whose host side is absent:
 * a host that declares no SDK version has nothing to be incompatible with, so
 * it must not be forced to invent one.
 */

import type { PluginIssue, PluginIssues, PluginManifest } from "../plugin-api/index.js";
import { pluginIssue } from "../plugin-api/index.js";
import { satisfiesRange } from "./semver.js";

/** Host facts a compatibility declaration is checked against. */
export interface HostCompatibility {
  /** Version of the SDK the host runs; its plugins' ranges are resolved against it. */
  readonly sdkVersion?: string;
  /** Document format the host reads and writes, e.g. `"ggd"`. */
  readonly documentFormat?: string;
  /** Document version the host reads and writes. */
  readonly documentVersion?: string;
}

/**
 * Whether a declared document version is the host's.
 *
 * The declared value is a version, not a range: only the documented `*`
 * wildcard (D9) means "any version", everything else must match exactly.
 */
function matchesDocumentVersion(hostVersion: string, declared: string): boolean {
  return declared === "*" || declared === hostVersion;
}

/** Every reason the manifest is incompatible with the host, or an empty list. */
export function checkCompatibility(
  manifest: PluginManifest,
  host: HostCompatibility,
): PluginIssues {
  const declared = manifest.compatibility;
  if (declared === undefined) return [];

  const issues: PluginIssue[] = [];
  const sdkRange = declared.sdkVersion;
  if (
    sdkRange !== undefined &&
    host.sdkVersion !== undefined &&
    !satisfiesRange(host.sdkVersion, sdkRange)
  ) {
    issues.push(
      pluginIssue(
        "plugin.incompatible-sdk",
        `Plugin "${manifest.id}" requires SDK version "${sdkRange}" but the host provides "${host.sdkVersion}"`,
        {
          path: ["compatibility", "sdkVersion"],
          metadata: { pluginId: manifest.id, range: sdkRange, sdkVersion: host.sdkVersion },
        },
      ),
    );
  }

  const documentFormat = declared.documentFormat;
  if (
    documentFormat !== undefined &&
    host.documentFormat !== undefined &&
    documentFormat !== host.documentFormat
  ) {
    issues.push(
      pluginIssue(
        "plugin.incompatible-sdk",
        `Plugin "${manifest.id}" targets document format "${documentFormat}" but the host uses "${host.documentFormat}"`,
        {
          path: ["compatibility", "documentFormat"],
          metadata: {
            pluginId: manifest.id,
            documentFormat,
            hostDocumentFormat: host.documentFormat,
          },
        },
      ),
    );
  }

  const documentVersion = declared.documentVersion;
  if (
    documentVersion !== undefined &&
    host.documentVersion !== undefined &&
    !matchesDocumentVersion(host.documentVersion, documentVersion)
  ) {
    issues.push(
      pluginIssue(
        "plugin.incompatible-sdk",
        `Plugin "${manifest.id}" targets document version "${documentVersion}" but the host uses "${host.documentVersion}"`,
        {
          path: ["compatibility", "documentVersion"],
          metadata: {
            pluginId: manifest.id,
            documentVersion,
            hostDocumentVersion: host.documentVersion,
          },
        },
      ),
    );
  }

  return issues;
}
