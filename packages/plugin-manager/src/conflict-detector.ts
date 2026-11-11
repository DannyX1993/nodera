import type { PluginIssue, PluginIssues, PluginManifest } from "@nodera/plugin-api";
import { pluginIssue } from "@nodera/plugin-api";
import { err, ok, type Result } from "@nodera/contracts";

/**
 * Pre-flight conflict detection over declarative manifests (S5, D10).
 *
 * Two plugins must never accidentally claim the same plugin id, and two
 * declared contributions must never claim the same `(type, id)`. Detecting this
 * from the manifests happens before any plugin code runs, so a collision is a
 * diagnostic instead of a silent overwrite.
 */
export function detectPluginConflicts(
  manifests: readonly PluginManifest[],
): Result<void, PluginIssues> {
  const issues: PluginIssue[] = [];
  const firstIndexById = new Map<string, number>();
  const contributionOwners = new Map<
    string,
    { readonly pluginId: string; readonly manifestIndex: number }
  >();

  manifests.forEach((manifest, manifestIndex) => {
    const previousIndex = firstIndexById.get(manifest.id);
    if (previousIndex === undefined) {
      firstIndexById.set(manifest.id, manifestIndex);
    } else {
      issues.push(
        pluginIssue(
          "plugin.duplicate-plugin",
          `Duplicate plugin id "${manifest.id}" is declared at index ${previousIndex} and at index ${manifestIndex}`,
          {
            path: [String(manifestIndex), "id"],
            metadata: { pluginId: manifest.id, indexes: [previousIndex, manifestIndex] },
          },
        ),
      );
    }

    (manifest.contributions ?? []).forEach((contribution, contributionIndex) => {
      const key = `${contribution.type}:${contribution.id}`;
      const owner = contributionOwners.get(key);
      if (owner === undefined) {
        contributionOwners.set(key, { pluginId: manifest.id, manifestIndex });
        return;
      }
      issues.push(
        pluginIssue(
          "plugin.contribution-conflict",
          `Contribution ${key} is declared by plugin "${owner.pluginId}" and again by plugin "${manifest.id}"`,
          {
            path: [String(manifestIndex), "contributions", String(contributionIndex)],
            metadata: {
              type: contribution.type,
              contributionId: contribution.id,
              pluginId: manifest.id,
              conflictingPluginId: owner.pluginId,
            },
          },
        ),
      );
    });
  });

  if (issues.length > 0) return err(issues);
  return ok(undefined);
}
