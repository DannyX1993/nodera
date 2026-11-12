import { describe, expect, it } from "vitest";
import type { PluginDependency, PluginIssue, PluginManifest } from "../plugin-api/index.js";
import { resolveDependencyOrder } from "./dependency-resolver.js";

function manifest(
  id: string,
  dependencies: readonly PluginDependency[] = [],
  version = "1.0.0",
): PluginManifest {
  return {
    id,
    name: id,
    version,
    ...(dependencies.length === 0 ? {} : { dependencies }),
  };
}

function ordered(result: ReturnType<typeof resolveDependencyOrder>): readonly string[] {
  if (!result.ok) throw new Error("expected a resolved order");
  return result.value.map((entry) => entry.id);
}

function orderedOrUndefined(
  result: ReturnType<typeof resolveDependencyOrder>,
): readonly string[] | undefined {
  return result.ok ? result.value.map((entry) => entry.id) : undefined;
}

function issuesOf(result: ReturnType<typeof resolveDependencyOrder>): readonly PluginIssue[] {
  if (result.ok) throw new Error("expected a failed resolution");
  return result.error;
}

function indexOfId(order: readonly string[], id: string): number {
  return order.indexOf(id);
}

describe("resolveDependencyOrder", () => {
  it("resolves an empty set to an empty order", () => {
    const result = resolveDependencyOrder([]);
    expect(result.ok).toBe(true);
    expect(orderedOrUndefined(result)).toEqual([]);
  });

  it("keeps input order for independent plugins", () => {
    const manifests = [manifest("vendor.gamma"), manifest("vendor.alpha"), manifest("vendor.beta")];
    expect(ordered(resolveDependencyOrder(manifests))).toEqual([
      "vendor.gamma",
      "vendor.alpha",
      "vendor.beta",
    ]);
  });

  it("returns dependencies before their dependents", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.core" }]),
      manifest("vendor.core"),
    ]);
    expect(ordered(result)).toEqual(["vendor.core", "vendor.app"]);
  });

  it("resolves a transitive chain dependency-first", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.middle" }]),
      manifest("vendor.middle", [{ id: "vendor.core" }]),
      manifest("vendor.core"),
    ]);
    expect(ordered(result)).toEqual(["vendor.core", "vendor.middle", "vendor.app"]);
  });

  it("resolves a diamond deterministically", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.left" }, { id: "vendor.right" }]),
      manifest("vendor.left", [{ id: "vendor.base" }]),
      manifest("vendor.right", [{ id: "vendor.base" }]),
      manifest("vendor.base"),
    ]);
    expect(ordered(result)).toEqual(["vendor.base", "vendor.left", "vendor.right", "vendor.app"]);
  });

  it("does not mutate the input and returns a fresh array", () => {
    const manifests = [manifest("vendor.app", [{ id: "vendor.core" }]), manifest("vendor.core")];
    const result = resolveDependencyOrder(manifests);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toBe(manifests);
    expect(manifests.map((entry) => entry.id)).toEqual(["vendor.app", "vendor.core"]);
  });

  it("reports a dependency missing from the discovered set", () => {
    const result = resolveDependencyOrder([manifest("vendor.app", [{ id: "vendor.missing" }])]);
    expect(result.ok).toBe(false);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("plugin.missing-dependency");
    expect(issues[0]?.message).toContain("vendor.app");
    expect(issues[0]?.message).toContain("vendor.missing");
    expect(issues[0]?.path).toEqual(["0", "dependencies", "0", "id"]);
    expect(issues[0]?.metadata).toMatchObject({
      pluginId: "vendor.app",
      dependencyId: "vendor.missing",
    });
    expect(orderedOrUndefined(result)).toBeUndefined();
  });

  it("reports every missing dependency of a plugin", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.missing-a" }, { id: "vendor.missing-b" }]),
    ]);
    const issues = issuesOf(result);
    expect(issues.map((issue) => issue.code)).toEqual([
      "plugin.missing-dependency",
      "plugin.missing-dependency",
    ]);
    expect(issues.map((issue) => issue.path)).toEqual([
      ["0", "dependencies", "0", "id"],
      ["0", "dependencies", "1", "id"],
    ]);
  });

  it("detects a two-plugin dependency cycle", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.a", [{ id: "vendor.b" }]),
      manifest("vendor.b", [{ id: "vendor.a" }]),
    ]);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("plugin.dependency-cycle");
    expect(issues[0]?.message).toContain("vendor.a");
    expect(issues[0]?.message).toContain("vendor.b");
    expect(issues[0]?.metadata).toEqual({ cycle: ["vendor.a", "vendor.b", "vendor.a"] });
    expect(issues.some((issue) => issue.code === "plugin.missing-dependency")).toBe(false);
  });

  it("detects a self-cycle", () => {
    const result = resolveDependencyOrder([manifest("vendor.a", [{ id: "vendor.a" }])]);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("plugin.dependency-cycle");
    expect(issues[0]?.metadata).toEqual({ cycle: ["vendor.a", "vendor.a"] });
  });

  it("reports one cycle issue for a three-plugin cycle", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.a", [{ id: "vendor.b" }]),
      manifest("vendor.b", [{ id: "vendor.c" }]),
      manifest("vendor.c", [{ id: "vendor.a" }]),
    ]);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("plugin.dependency-cycle");
    expect(issues[0]?.metadata).toEqual({
      cycle: ["vendor.a", "vendor.b", "vendor.c", "vendor.a"],
    });
  });

  it("accepts a dependency range that the installed version satisfies", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.core", version: "^1.0.0" }]),
      manifest("vendor.core", [], "1.4.0"),
    ]);
    expect(ordered(result)).toEqual(["vendor.core", "vendor.app"]);
  });

  it("accepts exact, tilde, star and absent ranges", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.exact", version: "1.2.3" }]),
      manifest("vendor.app-2", [{ id: "vendor.tilde", version: "~2.1.0" }]),
      manifest("vendor.app-3", [{ id: "vendor.star", version: "*" }]),
      manifest("vendor.app-4", [{ id: "vendor.any" }]),
      manifest("vendor.exact", [], "1.2.3"),
      manifest("vendor.tilde", [], "2.1.7"),
      manifest("vendor.star", [], "0.0.1"),
      manifest("vendor.any", [], "4.0.0"),
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects a dependency whose installed version misses the declared range", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.core", version: "^2.0.0" }]),
      manifest("vendor.core", [], "1.0.0"),
    ]);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("plugin.missing-dependency");
    expect(issues[0]?.message).toContain("vendor.core");
    expect(issues[0]?.message).toContain("^2.0.0");
    expect(issues[0]?.message).toContain("1.0.0");
    expect(issues[0]?.path).toEqual(["0", "dependencies", "0", "version"]);
    expect(issues[0]?.metadata).toMatchObject({
      pluginId: "vendor.app",
      dependencyId: "vendor.core",
      range: "^2.0.0",
      version: "1.0.0",
    });
    expect(orderedOrUndefined(result)).toBeUndefined();
  });

  it("rejects an exact range mismatch and a tilde range mismatch", () => {
    const exact = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.core", version: "1.2.3" }]),
      manifest("vendor.core", [], "1.2.4"),
    ]);
    expect(issuesOf(exact)[0]?.code).toBe("plugin.missing-dependency");
    expect(issuesOf(exact)[0]?.path).toEqual(["0", "dependencies", "0", "version"]);

    const tilde = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.core", version: "~1.2.0" }]),
      manifest("vendor.core", [], "1.3.0"),
    ]);
    expect(issuesOf(tilde)[0]?.code).toBe("plugin.missing-dependency");
    expect(issuesOf(tilde)[0]?.path).toEqual(["0", "dependencies", "0", "version"]);
  });

  it("rejects a prerelease dependency that the range does not opt into", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.core", version: "^1.0.0" }]),
      manifest("vendor.core", [], "1.0.1-beta.1"),
    ]);
    const issues = issuesOf(result);
    expect(issues[0]?.code).toBe("plugin.missing-dependency");
    expect(issues[0]?.message).toContain("1.0.1-beta.1");
  });

  it("rejects a dependency range outside the supported grammar", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.core", version: ">=1.0.0" }]),
      manifest("vendor.core", [], "1.0.0"),
    ]);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("plugin.invalid-manifest");
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.message).toContain(">=1.0.0");
    expect(issues[0]?.path).toEqual(["0", "dependencies", "0", "version"]);
  });

  it("reports a missing dependency even when other plugins resolve", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.core" }, { id: "vendor.missing" }]),
      manifest("vendor.core"),
    ]);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("plugin.missing-dependency");
    expect(issues[0]?.path).toEqual(["0", "dependencies", "1", "id"]);
  });

  it("collapses duplicate plugin ids to their first declaration", () => {
    const first = manifest("vendor.core");
    const duplicate = manifest("vendor.core", [{ id: "vendor.app" }]);
    const result = resolveDependencyOrder([first, duplicate]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((entry) => entry.id)).toEqual(["vendor.core"]);
    expect(result.value[0]).toBe(first);
  });

  it("orders the whole set when the declared version of a dependency is absent", () => {
    const result = resolveDependencyOrder([
      manifest("vendor.app", [{ id: "vendor.core", version: "1.9.9" }]),
      manifest("vendor.core", [], "1.0.0"),
    ]);
    const issues = issuesOf(result);
    expect(issues[0]?.message).toContain("1.9.9");
  });

  it("keeps the dependency-first invariant for every edge in the result", () => {
    const manifests = [
      manifest("vendor.a", [{ id: "vendor.b" }, { id: "vendor.c" }]),
      manifest("vendor.b", [{ id: "vendor.d" }]),
      manifest("vendor.c", [{ id: "vendor.d" }]),
      manifest("vendor.d"),
      manifest("vendor.e", [{ id: "vendor.a" }]),
    ];
    const order = ordered(resolveDependencyOrder(manifests));
    for (const entry of manifests) {
      for (const dependency of entry.dependencies ?? []) {
        expect(indexOfId(order, dependency.id)).toBeLessThan(indexOfId(order, entry.id));
      }
    }
    expect(order).toHaveLength(manifests.length);
  });
});
