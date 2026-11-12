import { describe, expect, it } from "vitest";
import type { PluginIssue, PluginManifest } from "../plugin-api/index.js";
import { validatePluginManifest } from "./manifest-validator.js";

const MINIMAL_MANIFEST = {
  id: "vendor.example-plugin",
  name: "Example Plugin",
  version: "1.0.0",
} as const;

const FULL_MANIFEST = {
  id: "vendor.example-plugin",
  name: "Example Plugin",
  version: "1.2.3-beta.1",
  description: "An example plugin.",
  author: {
    name: "Vendor",
    email: "dev@vendor.example",
    url: "https://vendor.example",
  },
  dependencies: [
    { id: "vendor.core", version: "^1.0.0" },
    { id: "vendor.utils", version: "~2.1.0" },
    { id: "vendor.legacy", version: "1.0.0" },
    { id: "vendor.optional", version: "*" },
    { id: "vendor.any" },
  ],
  compatibility: {
    sdkVersion: "^1.0.0",
    documentFormat: "ggd",
    documentVersion: "1.0.0",
    definitionVersions: { "vendor.core.node": "1.0.0" },
  },
  contributions: [{ type: "node", id: "vendor.example-plugin.node", version: "1.0.0" }],
  permissions: { network: false, storage: true },
} as const;

const CONTRIBUTION_KINDS = [
  "node",
  "edge",
  "property",
  "renderer",
  "tool",
  "panel",
  "validator",
  "theme",
  "layout",
  "layout-strategy",
  "importer",
  "exporter",
  "dialog",
] as const;

function issuesOf(value: unknown): readonly PluginIssue[] {
  const result = validatePluginManifest(value);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.error;
}

function samePath(
  actual: readonly string[] | undefined,
  expected: readonly string[],
): boolean {
  if (actual === undefined || actual.length !== expected.length) return false;
  return actual.every((segment, index) => segment === expected[index]);
}

function expectInvalidAt(value: unknown, expectedPath: readonly string[]): void {
  const issues = issuesOf(value);
  expect(issues.length).toBeGreaterThan(0);
  expect(issues.some((issue) => samePath(issue.path, expectedPath))).toBe(true);
  for (const issue of issues) {
    expect(issue.code).toBe("plugin.invalid-manifest");
    expect(issue.severity).toBe("error");
  }
}

describe("validatePluginManifest", () => {
  it("accepts a manifest declaring only the required fields", () => {
    const result = validatePluginManifest(MINIMAL_MANIFEST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const manifest: PluginManifest = result.value;
    expect(manifest).toEqual(MINIMAL_MANIFEST);
    expect("description" in manifest).toBe(false);
    expect(Object.keys(manifest).sort()).toEqual(["id", "name", "version"]);
  });

  it("preserves every declared field of a full manifest", () => {
    const result = validatePluginManifest(FULL_MANIFEST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(FULL_MANIFEST);
  });

  it("accepts an empty description string", () => {
    const result = validatePluginManifest({ ...MINIMAL_MANIFEST, description: "" });
    expect(result.ok).toBe(true);
  });

  it("accepts every contribution kind", () => {
    const contributions = CONTRIBUTION_KINDS.map((type) => ({
      type,
      id: `vendor.example-plugin.${type}`,
    }));
    const result = validatePluginManifest({ ...MINIMAL_MANIFEST, contributions });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.contributions).toEqual(contributions);
  });

  it("ignores unknown top-level keys instead of failing", () => {
    const result = validatePluginManifest({
      ...MINIMAL_MANIFEST,
      futureField: { anything: true },
      $schema: "./plugin.schema.json",
    });
    expect(result.ok).toBe(true);
  });

  it("ignores unknown keys inside nested declarations", () => {
    const result = validatePluginManifest({
      ...MINIMAL_MANIFEST,
      author: { name: "Vendor", github: "vendor" },
      permissions: { network: true, filesystem: true },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object manifest at the root", () => {
    for (const value of [null, undefined, "vendor.plugin", 42, true, [], () => {}]) {
      expectInvalidAt(value, []);
    }
  });

  it("rejects a missing or malformed id", () => {
    expectInvalidAt({ ...MINIMAL_MANIFEST, id: undefined }, ["id"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, id: 42 }, ["id"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, id: "feature" }, ["id"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, id: "vendor.feature name" }, ["id"]);
    const { id: _omitted, ...withoutId } = MINIMAL_MANIFEST;
    expectInvalidAt(withoutId, ["id"]);
  });

  it("rejects a missing, empty or non-string name", () => {
    expectInvalidAt({ ...MINIMAL_MANIFEST, name: undefined }, ["name"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, name: "" }, ["name"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, name: "   " }, ["name"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, name: 7 }, ["name"]);
  });

  it("rejects a missing or malformed version", () => {
    expectInvalidAt({ ...MINIMAL_MANIFEST, version: undefined }, ["version"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, version: "1.0" }, ["version"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, version: "1.0.0+build.1" }, ["version"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, version: "^1.0.0" }, ["version"]);
  });

  it("rejects a non-string description", () => {
    expectInvalidAt({ ...MINIMAL_MANIFEST, description: 3 }, ["description"]);
  });

  it("rejects a malformed author", () => {
    expectInvalidAt({ ...MINIMAL_MANIFEST, author: "Vendor" }, ["author"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, author: { name: "" } }, ["author", "name"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, author: { email: "dev@vendor.example" } }, [
      "author",
      "name",
    ]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, author: { name: "Vendor", email: 3 } }, [
      "author",
      "email",
    ]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, author: { name: "Vendor", url: 3 } }, [
      "author",
      "url",
    ]);
  });

  it("rejects a non-array dependencies declaration", () => {
    expectInvalidAt({ ...MINIMAL_MANIFEST, dependencies: { id: "vendor.core" } }, [
      "dependencies",
    ]);
  });

  it("rejects a malformed dependency entry", () => {
    expectInvalidAt({ ...MINIMAL_MANIFEST, dependencies: ["vendor.core"] }, [
      "dependencies",
      "0",
    ]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, dependencies: [{ version: "^1.0.0" }] }, [
      "dependencies",
      "0",
      "id",
    ]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, dependencies: [{ id: "core" }] }, [
      "dependencies",
      "0",
      "id",
    ]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, dependencies: [{ id: "vendor.core", version: 3 }] }, [
      "dependencies",
      "0",
      "version",
    ]);
  });

  it("rejects dependency version ranges outside the supported grammar", () => {
    for (const range of [">=1.0.0", "1.x", "", "1.0.0 || 2.0.0"]) {
      expectInvalidAt({ ...MINIMAL_MANIFEST, dependencies: [{ id: "vendor.core", version: range }] }, [
        "dependencies",
        "0",
        "version",
      ]);
    }
  });

  it("rejects a malformed compatibility declaration", () => {
    expectInvalidAt({ ...MINIMAL_MANIFEST, compatibility: "ggd" }, ["compatibility"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, compatibility: { sdkVersion: ">=1.0.0" } }, [
      "compatibility",
      "sdkVersion",
    ]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, compatibility: { documentFormat: "" } }, [
      "compatibility",
      "documentFormat",
    ]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, compatibility: { documentVersion: 1 } }, [
      "compatibility",
      "documentVersion",
    ]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, compatibility: { definitionVersions: [] } }, [
      "compatibility",
      "definitionVersions",
    ]);
    expectInvalidAt(
      { ...MINIMAL_MANIFEST, compatibility: { definitionVersions: { "vendor.core.node": "" } } },
      ["compatibility", "definitionVersions", "vendor.core.node"],
    );
  });

  it("rejects a malformed contributions declaration", () => {
    expectInvalidAt({ ...MINIMAL_MANIFEST, contributions: "node" }, ["contributions"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, contributions: [{ type: "widget", id: "vendor.x.node" }] }, [
      "contributions",
      "0",
      "type",
    ]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, contributions: [{ type: "node", id: "node" }] }, [
      "contributions",
      "0",
      "id",
    ]);
    expectInvalidAt(
      { ...MINIMAL_MANIFEST, contributions: [{ type: "node", id: "vendor.x.node", version: "1.0" }] },
      ["contributions", "0", "version"],
    );
  });

  it("rejects a malformed permissions declaration", () => {
    expectInvalidAt({ ...MINIMAL_MANIFEST, permissions: true }, ["permissions"]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, permissions: { network: "yes" } }, [
      "permissions",
      "network",
    ]);
    expectInvalidAt({ ...MINIMAL_MANIFEST, permissions: { storage: 1 } }, [
      "permissions",
      "storage",
    ]);
  });

  it("collects every independent problem in one result", () => {
    const issues = issuesOf({
      id: "feature",
      name: "",
      version: "1.0",
      author: { name: "" },
      permissions: { network: 1 },
    });
    expect(issues.map((issue) => issue.path)).toEqual([
      ["id"],
      ["name"],
      ["version"],
      ["author", "name"],
      ["permissions", "network"],
    ]);
  });
});
