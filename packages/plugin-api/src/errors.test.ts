import { describe, expect, it } from "vitest";
import { PLUGIN_ERROR_CODES, pluginIssue } from "./errors.js";

describe("pluginIssue", () => {
  it("builds an error-severity issue with code and message", () => {
    expect(pluginIssue("plugin.invalid-manifest", "bad manifest")).toEqual({
      code: "plugin.invalid-manifest",
      message: "bad manifest",
      severity: "error",
    });
  });

  it("attaches path and metadata only when provided", () => {
    const issue = pluginIssue("plugin.duplicate-plugin", "dup", {
      path: ["id"],
      metadata: { value: "x.y" },
    });
    expect(issue.path).toEqual(["id"]);
    expect(issue.metadata).toEqual({ value: "x.y" });

    const bare = pluginIssue("plugin.not-found", "missing");
    expect("path" in bare).toBe(false);
    expect("metadata" in bare).toBe(false);
  });

  it("allows a warning severity", () => {
    expect(
      pluginIssue("plugin.invalid-manifest", "warn", { severity: "warning" }).severity,
    ).toBe("warning");
  });

  it("keeps the code list closed and stable", () => {
    expect(PLUGIN_ERROR_CODES).toEqual([
      "plugin.invalid-manifest",
      "plugin.missing-dependency",
      "plugin.dependency-cycle",
      "plugin.incompatible-sdk",
      "plugin.duplicate-plugin",
      "plugin.contribution-conflict",
      "plugin.activation-failed",
      "plugin.deactivation-failed",
      "plugin.not-found",
      "plugin.invalid-state",
    ]);
  });
});
