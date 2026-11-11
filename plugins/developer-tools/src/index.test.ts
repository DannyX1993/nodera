/**
 * Behaviour of the `example.developer-tools` example plugin.
 *
 * The suite drives the plugin through the public host surface only: it installs
 * it with the plugin manager, reads the tools, panels and dialog that reached
 * the builder, and uninstalls it to prove the declarations are withdrawn again
 * (D13).
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

import { developerToolsPlugin } from "./index.js";

/** What the manifest must declare, and what activation must register. */
const DECLARED = [
  { type: "tool", id: "example.dev.tool.validate" },
  { type: "tool", id: "example.dev.tool.dump-graph" },
  { type: "panel", id: "example.dev.panel.issues" },
  { type: "panel", id: "example.dev.panel.shortcuts" },
  { type: "dialog", id: "example.dev.dialog.shortcuts" },
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

describe("example.developer-tools", () => {
  it("installs and registers its tools, its panels and its dialog", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder, { sdkVersion: "0.0.0" });
    const activated: PluginActivatedEvent[] = [];
    builder.events.on("plugin.activated", (payload) => activated.push(payload));

    const installed = manager.install([developerToolsPlugin]);

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value.map((record) => record.state)).toEqual(["active"]);
    expect(installed.value[0]?.issues).toEqual([]);
    expect(installed.value[0]?.contributionIds).toEqual(DECLARED.map((entry) => entry.id));

    expect(builder.registries.tools.get("example.dev.tool.validate")).toMatchObject({
      id: "example.dev.tool.validate",
      label: "Validate graph",
      command: { kind: "validate" },
    });
    expect(builder.registries.tools.get("example.dev.tool.dump-graph")).toMatchObject({
      id: "example.dev.tool.dump-graph",
      command: { kind: "custom", id: "example.dev.dump-graph" },
    });
    expect(builder.registries.panels.get("example.dev.panel.issues")).toMatchObject({
      id: "example.dev.panel.issues",
      title: "Developer issues",
      region: "bottom",
    });
    expect(builder.registries.panels.get("example.dev.panel.shortcuts")).toMatchObject({
      id: "example.dev.panel.shortcuts",
      region: "right",
    });
    expect(builder.dialogs.all().map((dialog) => dialog.id)).toContain(
      "example.dev.dialog.shortcuts",
    );

    expect(activated).toEqual([
      {
        pluginId: "example.developer-tools",
        contributionIds: DECLARED.map((entry) => entry.id),
      },
    ]);
  });

  it("declares in its manifest exactly the contributions its activation registers", () => {
    const validation = validatePluginManifest(developerToolsPlugin.manifest);

    expect(validation.ok).toBe(true);
    expect(developerToolsPlugin.manifest.id).toBe("example.developer-tools");
    expect(developerToolsPlugin.manifest.contributions).toEqual(DECLARED);

    const builder = createTestBuilder();
    const installed = createPluginManager(builder).install([developerToolsPlugin]);
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value[0]?.issues).toEqual([]);
    expect([...(installed.value[0]?.contributionIds ?? [])].sort()).toEqual(
      DECLARED.map((entry) => entry.id).sort(),
    );
  });

  it("withdraws every declared contribution on uninstall", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const unregistered: PluginUnregisteredEvent[] = [];
    builder.events.on("plugin.unregistered", (payload) => unregistered.push(payload));

    expect(manager.install([developerToolsPlugin]).ok).toBe(true);
    expect(builder.registries.tools.has("example.dev.tool.validate")).toBe(true);
    expect(builder.registries.panels.has("example.dev.panel.issues")).toBe(true);
    expect(builder.dialogs.all().map((dialog) => dialog.id)).toContain(
      "example.dev.dialog.shortcuts",
    );

    const uninstallation = manager.uninstall("example.developer-tools");

    expect(uninstallation.ok).toBe(true);
    if (!uninstallation.ok) return;
    expect(uninstallation.value.state).toBe("unregistered");
    expect(uninstallation.value.issues).toEqual([]);
    expect(builder.registries.tools.get("example.dev.tool.validate")).toBeUndefined();
    expect(builder.registries.tools.get("example.dev.tool.dump-graph")).toBeUndefined();
    expect(builder.registries.panels.get("example.dev.panel.issues")).toBeUndefined();
    expect(builder.registries.panels.get("example.dev.panel.shortcuts")).toBeUndefined();
    expect(builder.dialogs.all().map((dialog) => dialog.id)).not.toContain(
      "example.dev.dialog.shortcuts",
    );
    expect(unregistered).toEqual([{ pluginId: "example.developer-tools" }]);
    expect(manager.list()).toEqual([]);
  });
});
