import { describe, expect, it } from "vitest";
import {
  createPluginManager,
  detectPluginConflicts,
  resolveDependencyOrder,
  validatePluginManifest,
} from "./index.js";
import { pluginManifest } from "./test/fixtures.js";

describe("plugin manager package barrel", () => {
  it("keeps the pure phase-7 helpers exported", () => {
    const validated = validatePluginManifest({
      id: "acme.manifest",
      name: "Acme manifest",
      version: "1.0.0",
    });
    expect(validated.ok).toBe(true);

    const base = pluginManifest({ id: "acme.base" });
    const derived = pluginManifest({ id: "acme.derived", dependencies: [{ id: "acme.base" }] });
    const ordered = resolveDependencyOrder([derived, base]);
    expect(ordered.ok).toBe(true);
    if (!ordered.ok) return;
    expect(ordered.value.map((manifest) => manifest.id)).toEqual(["acme.base", "acme.derived"]);

    expect(detectPluginConflicts([base, derived]).ok).toBe(true);
    expect(typeof createPluginManager).toBe("function");
  });
});
