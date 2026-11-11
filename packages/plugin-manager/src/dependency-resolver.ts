import type { PluginIssue, PluginIssues, PluginManifest } from "@nodera/plugin-api";
import { pluginIssue } from "@nodera/plugin-api";
import { err, ok, type Result } from "@nodera/contracts";
import { parseVersionRange, satisfiesRange } from "./semver.js";

/**
 * Dependency resolution inside the discovered plugin set (D3, D10).
 *
 * Resolution never downloads anything: the host decides which plugins exist
 * (S6/S7) and this pure step only orders them. It reports missing dependencies,
 * cycles and versions that miss the declared range, and otherwise returns a
 * dependency-first order so a manager can register/activate safely.
 */
export function resolveDependencyOrder(
  manifests: readonly PluginManifest[],
): Result<readonly PluginManifest[], PluginIssues> {
  const issues: PluginIssue[] = [];

  // Collapse duplicate ids (first declaration wins) so ordering stays total;
  // reporting duplicates belongs to the conflict detector.
  const byId = new Map<string, PluginManifest>();
  const firstIndexById = new Map<string, number>();
  const ids: string[] = [];
  manifests.forEach((manifest, index) => {
    if (byId.has(manifest.id)) return;
    byId.set(manifest.id, manifest);
    firstIndexById.set(manifest.id, index);
    ids.push(manifest.id);
  });

  type VisitState = "visiting" | "done";
  const state = new Map<string, VisitState>();
  const stack: string[] = [];
  const ordered: PluginManifest[] = [];
  const reportedCycles = new Set<string>();

  const cycleKey = (cycleIds: readonly string[]): string =>
    [...new Set(cycleIds)].sort().join("|");

  const reportCycle = (id: string): void => {
    const start = stack.lastIndexOf(id);
    const cycleIds = [...stack.slice(start < 0 ? 0 : start), id];
    const key = cycleKey(cycleIds);
    if (reportedCycles.has(key)) return;
    reportedCycles.add(key);
    issues.push(
      pluginIssue("plugin.dependency-cycle", `Dependency cycle detected: ${cycleIds.join(" -> ")}`, {
        path: [String(firstIndexById.get(id) ?? 0), "dependencies"],
        metadata: { cycle: cycleIds },
      }),
    );
  };

  const visit = (id: string): void => {
    const current = state.get(id);
    if (current === "done") return;
    if (current === "visiting") {
      reportCycle(id);
      return;
    }

    const manifest = byId.get(id);
    if (manifest === undefined) return;

    state.set(id, "visiting");
    stack.push(id);

    for (const [dependencyIndex, dependency] of (manifest.dependencies ?? []).entries()) {
      const manifestIndex = String(firstIndexById.get(id) ?? 0);
      const dependencyPath = [manifestIndex, "dependencies", String(dependencyIndex)] as const;
      const installed = byId.get(dependency.id);

      if (installed === undefined) {
        issues.push(
          pluginIssue(
            "plugin.missing-dependency",
            `Plugin "${id}" depends on missing plugin "${dependency.id}"`,
            {
              path: [...dependencyPath, "id"],
              metadata: { pluginId: id, dependencyId: dependency.id },
            },
          ),
        );
        continue;
      }

      const range = dependency.version;
      if (range !== undefined) {
        if (parseVersionRange(range) === undefined) {
          issues.push(
            pluginIssue(
              "plugin.invalid-manifest",
              `Plugin "${id}" declares the unsupported version range "${range}" for dependency "${dependency.id}"`,
              {
                path: [...dependencyPath, "version"],
                metadata: { pluginId: id, dependencyId: dependency.id, range },
              },
            ),
          );
          continue;
        }
        if (!satisfiesRange(installed.version, range)) {
          issues.push(
            pluginIssue(
              "plugin.missing-dependency",
              `Plugin "${id}" requires dependency "${dependency.id}" to satisfy range "${range}" but version "${installed.version}" is installed`,
              {
                path: [...dependencyPath, "version"],
                metadata: {
                  pluginId: id,
                  dependencyId: dependency.id,
                  range,
                  version: installed.version,
                },
              },
            ),
          );
        }
      }

      visit(dependency.id);
    }

    stack.pop();
    state.set(id, "done");
    ordered.push(manifest);
  };

  for (const id of ids) visit(id);

  if (issues.length > 0) return err(issues);
  return ok(ordered);
}
