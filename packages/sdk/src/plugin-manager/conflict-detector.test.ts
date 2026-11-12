import { describe, expect, it } from "vitest";
import type { PluginContribution, PluginIssue, PluginManifest } from "../plugin-api/index.js";
import { detectPluginConflicts } from "./conflict-detector.js";

function manifest(
  id: string,
  contributions: readonly PluginContribution[] = [],
): PluginManifest {
  return {
    id,
    name: id,
    version: "1.0.0",
    ...(contributions.length === 0 ? {} : { contributions }),
  };
}

function issuesOf(result: ReturnType<typeof detectPluginConflicts>): readonly PluginIssue[] {
  if (result.ok) throw new Error("expected conflicts");
  return result.error;
}

describe("detectPluginConflicts", () => {
  it("reports no conflicts for an empty set", () => {
    const result = detectPluginConflicts([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeUndefined();
  });

  it("reports no conflicts for distinct plugin ids and distinct contributions", () => {
    const result = detectPluginConflicts([
      manifest("vendor.alpha", [{ type: "node", id: "vendor.alpha.node" }]),
      manifest("vendor.beta", [
        { type: "node", id: "vendor.beta.node" },
        { type: "panel", id: "vendor.beta.panel" },
      ]),
    ]);
    expect(result.ok).toBe(true);
  });

  it("reports two plugins sharing an id", () => {
    const result = detectPluginConflicts([manifest("vendor.core"), manifest("vendor.core")]);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("plugin.duplicate-plugin");
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.message).toContain("vendor.core");
    expect(issues[0]?.path).toEqual(["1", "id"]);
    expect(issues[0]?.metadata).toEqual({ pluginId: "vendor.core", indexes: [0, 1] });
  });

  it("reports every duplicate of a plugin id declared three times", () => {
    const result = detectPluginConflicts([
      manifest("vendor.core"),
      manifest("vendor.distinct"),
      manifest("vendor.core"),
      manifest("vendor.core"),
    ]);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.path)).toEqual([
      ["2", "id"],
      ["3", "id"],
    ]);
    expect(issues.every((issue) => issue.code === "plugin.duplicate-plugin")).toBe(true);
  });

  it("reports two plugins declaring the same contribution", () => {
    const result = detectPluginConflicts([
      manifest("vendor.alpha", [{ type: "node", id: "vendor.shared.node" }]),
      manifest("vendor.beta", [{ type: "node", id: "vendor.shared.node" }]),
    ]);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("plugin.contribution-conflict");
    expect(issues[0]?.severity).toBe("error");
    expect(issues[0]?.message).toContain("vendor.shared.node");
    expect(issues[0]?.message).toContain("vendor.alpha");
    expect(issues[0]?.message).toContain("vendor.beta");
    expect(issues[0]?.path).toEqual(["1", "contributions", "0"]);
    expect(issues[0]?.metadata).toMatchObject({
      type: "node",
      contributionId: "vendor.shared.node",
      pluginId: "vendor.beta",
      conflictingPluginId: "vendor.alpha",
    });
  });

  it("reports a contribution declared twice inside one manifest", () => {
    const result = detectPluginConflicts([
      manifest("vendor.alpha", [
        { type: "panel", id: "vendor.alpha.panel" },
        { type: "panel", id: "vendor.alpha.panel" },
      ]),
    ]);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe("plugin.contribution-conflict");
    expect(issues[0]?.path).toEqual(["0", "contributions", "1"]);
    expect(issues[0]?.metadata).toMatchObject({ contributionId: "vendor.alpha.panel" });
  });

  it("does not treat the same id under different contribution types as a conflict", () => {
    const result = detectPluginConflicts([
      manifest("vendor.alpha", [
        { type: "node", id: "vendor.alpha.shared" },
        { type: "panel", id: "vendor.alpha.shared" },
      ]),
    ]);
    expect(result.ok).toBe(true);
  });

  it("reports both duplicate plugin ids and contribution conflicts together", () => {
    const result = detectPluginConflicts([
      manifest("vendor.core", [{ type: "node", id: "vendor.shared.node" }]),
      manifest("vendor.core", [{ type: "node", id: "vendor.shared.node" }]),
    ]);
    const issues = issuesOf(result);
    expect(issues.map((issue) => issue.code)).toEqual([
      "plugin.duplicate-plugin",
      "plugin.contribution-conflict",
    ]);
  });

  it("reports each colliding contribution declaration once per later occurrence", () => {
    const result = detectPluginConflicts([
      manifest("vendor.alpha", [{ type: "tool", id: "vendor.shared.tool" }]),
      manifest("vendor.beta", [{ type: "tool", id: "vendor.shared.tool" }]),
      manifest("vendor.gamma", [{ type: "tool", id: "vendor.shared.tool" }]),
    ]);
    const issues = issuesOf(result);
    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.path)).toEqual([
      ["1", "contributions", "0"],
      ["2", "contributions", "0"],
    ]);
    expect(issues.every((issue) => issue.code === "plugin.contribution-conflict")).toBe(true);
  });

  it("reports no conflict for manifests without contributions", () => {
    const result = detectPluginConflicts([manifest("vendor.alpha"), manifest("vendor.beta")]);
    expect(result.ok).toBe(true);
  });
});
