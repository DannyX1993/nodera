/**
 * Behaviour of the `example.data-nodes` example plugin.
 *
 * The suite drives the plugin through the public host surface only: it installs
 * it with the plugin manager, reads what reached the builder's registries and
 * uninstalls it to prove that every declared contribution is withdrawn again
 * (D13). One case exercises the importer the plugin contributes, because a
 * contribution that only registers is not yet a contribution that works.
 *
 * Every case composes a fresh builder on purpose: the SDK remembers the plugin
 * ids installed on a builder forever (Log L7).
 */

import { describe, expect, it } from "vitest";

import { createPluginManager, validatePluginManifest } from "@nodera/plugin-manager";
import {
  createBuilder,
  type Builder,
  type PluginActivatedEvent,
  type PluginUnregisteredEvent,
} from "@nodera/sdk";

import { jsonLinesImporter, dataNodesPlugin } from "./index.js";

/** What the manifest must declare, and what activation must register. */
const DECLARED = [
  { type: "property", id: "example.data.source" },
  { type: "property", id: "example.data.target" },
  { type: "validator", id: "example.data.validator" },
  { type: "importer", id: "example.data.importer", version: "1.0.0" },
] as const;

/** Composes a real builder, failing loudly when the composition itself breaks. */
function createTestBuilder(): Builder {
  const created = createBuilder();
  if (!created.ok) {
    throw new Error(
      `unexpected builder failure: ${created.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return created.value;
}

describe("example.data-nodes", () => {
  it("installs and registers its properties, its validator and its importer", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder, { sdkVersion: "0.0.0" });
    const activated: PluginActivatedEvent[] = [];
    builder.events.on("plugin.activated", (payload) => activated.push(payload));

    const installed = manager.install([dataNodesPlugin]);

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value.map((record) => record.state)).toEqual(["active"]);
    expect(installed.value[0]?.issues).toEqual([]);
    expect(installed.value[0]?.contributionIds).toEqual(DECLARED.map((entry) => entry.id));

    expect(builder.properties.get("example.data.source")).toMatchObject({
      id: "example.data.source",
      type: "string",
      label: "Source field",
    });
    expect(builder.properties.get("example.data.target")).toMatchObject({
      id: "example.data.target",
      type: "string",
      label: "Target field",
    });
    expect(builder.validators.all().map((validator) => validator.id)).toContain(
      "example.data.validator",
    );
    expect(builder.importers.all().map((importer) => importer.id)).toContain(
      "example.data.importer",
    );
    expect(builder.importers.all().map((importer) => importer.format)).toContain("json-lines");

    expect(activated).toEqual([
      {
        pluginId: "example.data-nodes",
        contributionIds: DECLARED.map((entry) => entry.id),
      },
    ]);
  });

  it("declares in its manifest exactly the contributions its activation registers", () => {
    const validation = validatePluginManifest(dataNodesPlugin.manifest);

    expect(validation.ok).toBe(true);
    expect(dataNodesPlugin.manifest.id).toBe("example.data-nodes");
    expect(dataNodesPlugin.manifest.contributions).toEqual(DECLARED);

    const builder = createTestBuilder();
    const installed = createPluginManager(builder).install([dataNodesPlugin]);
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value[0]?.issues).toEqual([]);
    expect([...(installed.value[0]?.contributionIds ?? [])].sort()).toEqual(
      DECLARED.map((entry) => entry.id).sort(),
    );
  });

  it("parses newline-delimited JSON and reports the failing line", () => {
    expect(jsonLinesImporter.importContent('{"id":1}\n\n{"id":2}\n')).toEqual({
      ok: true,
      value: { records: [{ id: 1 }, { id: 2 }] },
    });
    expect(jsonLinesImporter.importContent('{"id":1}\nnot json')).toEqual({
      ok: false,
      error: { kind: "parse-failed", message: 'Line 2 is not valid JSON' },
    });
  });

  it("withdraws every declared contribution on uninstall", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const unregistered: PluginUnregisteredEvent[] = [];
    builder.events.on("plugin.unregistered", (payload) => unregistered.push(payload));

    expect(manager.install([dataNodesPlugin]).ok).toBe(true);
    expect(builder.properties.has("example.data.source")).toBe(true);
    expect(builder.properties.has("example.data.target")).toBe(true);
    expect(builder.validators.all().map((validator) => validator.id)).toContain(
      "example.data.validator",
    );
    expect(builder.importers.all().map((importer) => importer.id)).toContain(
      "example.data.importer",
    );

    const uninstallation = manager.uninstall("example.data-nodes");

    expect(uninstallation.ok).toBe(true);
    if (!uninstallation.ok) return;
    expect(uninstallation.value.state).toBe("unregistered");
    expect(uninstallation.value.issues).toEqual([]);
    expect(builder.properties.get("example.data.source")).toBeUndefined();
    expect(builder.properties.get("example.data.target")).toBeUndefined();
    expect(builder.validators.all().map((validator) => validator.id)).not.toContain(
      "example.data.validator",
    );
    expect(builder.importers.all().map((importer) => importer.id)).not.toContain(
      "example.data.importer",
    );
    expect(unregistered).toEqual([{ pluginId: "example.data-nodes" }]);
    expect(manager.list()).toEqual([]);
  });
});
