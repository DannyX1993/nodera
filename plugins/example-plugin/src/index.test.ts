/**
 * Behaviour of the `example.kitchen-sink` example plugin (`plugins/example-plugin`).
 *
 * The suite drives the plugin through the public host surface only: it installs
 * it with the plugin manager, reads the theme, layout, layout strategy and
 * exporter that reached the builder, and uninstalls it to prove the declarations
 * are withdrawn again (D13). One case exercises the exporter, because a
 * contribution that only registers is not yet a contribution that works.
 *
 * Every case composes a fresh builder on purpose: the SDK remembers the plugin
 * ids installed on a builder forever (Log L7).
 */

import { describe, expect, it } from "vitest";

import {
  createBuilder,
  createPluginManager,
  validatePluginManifest,
  type Builder,
  type PluginActivatedEvent,
  type PluginUnregisteredEvent,
} from "@nodera/sdk";

import { ndjsonExporter, kitchenSinkPlugin } from "./index.js";

/** What the manifest must declare, and what activation must register. */
const DECLARED = [
  { type: "theme", id: "example.sink.theme.blueprint" },
  { type: "layout", id: "example.sink.layout.workspace" },
  { type: "layout-strategy", id: "example.sink.strategy.grid" },
  { type: "exporter", id: "example.sink.exporter.ndjson", version: "1.0.0" },
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

describe("example.kitchen-sink", () => {
  it("installs and registers its theme, layout, layout strategy and exporter", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder, { sdkVersion: "1.0.0" });
    const activated: PluginActivatedEvent[] = [];
    builder.events.on("plugin.activated", (payload) => activated.push(payload));

    const installed = manager.install([kitchenSinkPlugin]);

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value.map((record) => record.state)).toEqual(["active"]);
    expect(installed.value[0]?.issues).toEqual([]);
    expect(installed.value[0]?.contributionIds).toEqual(DECLARED.map((entry) => entry.id));

    expect(builder.registries.themes.get("example.sink.theme.blueprint")).toMatchObject({
      id: "example.sink.theme.blueprint",
      name: "Blueprint",
      colorScheme: "dark",
    });
    expect(builder.registries.layouts.get("example.sink.layout.workspace")).toMatchObject({
      id: "example.sink.layout.workspace",
      name: "Example workspace",
    });
    expect(builder.graphLayout.all().map((strategy) => strategy.id)).toContain(
      "example.sink.strategy.grid",
    );
    expect(builder.exporters.all().map((exporter) => exporter.id)).toContain(
      "example.sink.exporter.ndjson",
    );
    expect(builder.exporters.all().map((exporter) => exporter.format)).toContain("ndjson");

    expect(activated).toEqual([
      {
        pluginId: "example.kitchen-sink",
        contributionIds: DECLARED.map((entry) => entry.id),
      },
    ]);
  });

  it("declares in its manifest exactly the contributions its activation registers", () => {
    const validation = validatePluginManifest(kitchenSinkPlugin.manifest);

    expect(validation.ok).toBe(true);
    expect(kitchenSinkPlugin.manifest.id).toBe("example.kitchen-sink");
    expect(kitchenSinkPlugin.manifest.contributions).toEqual(DECLARED);

    const builder = createTestBuilder();
    const installed = createPluginManager(builder).install([kitchenSinkPlugin]);
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value[0]?.issues).toEqual([]);
    expect([...(installed.value[0]?.contributionIds ?? [])].sort()).toEqual(
      DECLARED.map((entry) => entry.id).sort(),
    );
  });

  it("serializes a document to one JSON line and reports an unserializable one", () => {
    expect(ndjsonExporter.exportContent({ format: "ggd", version: "1.0.0" })).toEqual({
      ok: true,
      value: '{"format":"ggd","version":"1.0.0"}\n',
    });

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(ndjsonExporter.exportContent(circular)).toEqual({
      ok: false,
      error: {
        kind: "serialization-failed",
        message: "The document cannot be serialized as JSON",
      },
    });
  });

  it("withdraws every declared contribution on uninstall", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const unregistered: PluginUnregisteredEvent[] = [];
    builder.events.on("plugin.unregistered", (payload) => unregistered.push(payload));

    expect(manager.install([kitchenSinkPlugin]).ok).toBe(true);
    expect(builder.registries.themes.has("example.sink.theme.blueprint")).toBe(true);
    expect(builder.registries.layouts.has("example.sink.layout.workspace")).toBe(true);
    expect(builder.graphLayout.all().map((strategy) => strategy.id)).toContain(
      "example.sink.strategy.grid",
    );
    expect(builder.exporters.all().map((exporter) => exporter.id)).toContain(
      "example.sink.exporter.ndjson",
    );

    const uninstallation = manager.uninstall("example.kitchen-sink");

    expect(uninstallation.ok).toBe(true);
    if (!uninstallation.ok) return;
    expect(uninstallation.value.state).toBe("unregistered");
    expect(uninstallation.value.issues).toEqual([]);
    expect(builder.registries.themes.get("example.sink.theme.blueprint")).toBeUndefined();
    expect(builder.registries.layouts.get("example.sink.layout.workspace")).toBeUndefined();
    expect(builder.graphLayout.all().map((strategy) => strategy.id)).not.toContain(
      "example.sink.strategy.grid",
    );
    expect(builder.exporters.all().map((exporter) => exporter.id)).not.toContain(
      "example.sink.exporter.ndjson",
    );
    expect(unregistered).toEqual([{ pluginId: "example.kitchen-sink" }]);
    expect(manager.list()).toEqual([]);
  });
});
