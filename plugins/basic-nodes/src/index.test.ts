/**
 * Behaviour of the `example.basic-nodes` example plugin.
 *
 * The suite drives the plugin through the public host surface only: it installs
 * it with the plugin manager, reads what reached the builder's registries and
 * uninstalls it to prove that every declared contribution is withdrawn again
 * (D13).
 *
 * Every case composes a fresh builder on purpose. The SDK remembers the plugin
 * ids installed on a builder forever (the Phase 6 `installedPlugins` WeakMap),
 * so uninstalling and reinstalling the same id on the same builder is not a
 * supported sequence (Log L7): a case that needs the plugin twice asks for a
 * new builder.
 */

import { describe, expect, it } from "vitest";

import { createPluginManager, validatePluginManifest } from "@nodera/plugin-manager";
import {
  createBuilder,
  type Builder,
  type PluginActivatedEvent,
  type PluginUnregisteredEvent,
} from "@nodera/sdk";

import { basicNodesPlugin } from "./index.js";

/** What the manifest must declare, and what activation must register. */
const DECLARED = [
  { type: "node", id: "example.basic.start", version: "1.0.0" },
  { type: "node", id: "example.basic.transform", version: "1.0.0" },
  { type: "edge", id: "example.basic.flow", version: "1.0.0" },
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

describe("example.basic-nodes", () => {
  it("installs and registers its nodes and its edge", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder, { sdkVersion: "1.0.0" });
    const activated: PluginActivatedEvent[] = [];
    builder.events.on("plugin.activated", (payload) => activated.push(payload));

    const installed = manager.install([basicNodesPlugin]);

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value.map((record) => record.state)).toEqual(["active"]);
    expect(installed.value[0]?.issues).toEqual([]);
    expect(installed.value[0]?.contributionIds).toEqual(DECLARED.map((entry) => entry.id));
    expect(manager.get("example.basic-nodes")?.state).toBe("active");

    expect(builder.registries.nodes.get("example.basic.start")).toMatchObject({
      type: "example.basic.start",
      label: "Start",
    });
    expect(builder.registries.nodes.get("example.basic.transform")).toMatchObject({
      type: "example.basic.transform",
      label: "Transform",
    });
    expect(builder.registries.edges.get("example.basic.flow")).toMatchObject({
      type: "example.basic.flow",
      label: "Flow",
    });
    expect(builder.registries.nodes.size).toBe(2);
    expect(builder.registries.edges.size).toBe(1);

    expect(activated).toEqual([
      {
        pluginId: "example.basic-nodes",
        contributionIds: DECLARED.map((entry) => entry.id),
      },
    ]);
  });

  it("declares in its manifest exactly the contributions its activation registers", () => {
    const validation = validatePluginManifest(basicNodesPlugin.manifest);

    expect(validation.ok).toBe(true);
    expect(basicNodesPlugin.manifest.id).toBe("example.basic-nodes");
    expect(basicNodesPlugin.manifest.contributions).toEqual(DECLARED);

    // `contributionIds` is the manifest-independent record of what `activate`
    // actually did, so comparing the two sets proves nothing undeclared ran.
    const builder = createTestBuilder();
    const installed = createPluginManager(builder).install([basicNodesPlugin]);
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

    expect(manager.install([basicNodesPlugin]).ok).toBe(true);
    // Registered first, so the withdrawal below is proven rather than assumed.
    expect(builder.registries.nodes.has("example.basic.start")).toBe(true);
    expect(builder.registries.nodes.has("example.basic.transform")).toBe(true);
    expect(builder.registries.edges.has("example.basic.flow")).toBe(true);

    const uninstallation = manager.uninstall("example.basic-nodes");

    expect(uninstallation.ok).toBe(true);
    if (!uninstallation.ok) return;
    expect(uninstallation.value.state).toBe("unregistered");
    expect(uninstallation.value.issues).toEqual([]);
    expect(builder.registries.nodes.get("example.basic.start")).toBeUndefined();
    expect(builder.registries.nodes.get("example.basic.transform")).toBeUndefined();
    expect(builder.registries.edges.get("example.basic.flow")).toBeUndefined();
    expect(unregistered).toEqual([{ pluginId: "example.basic-nodes" }]);
    expect(manager.list()).toEqual([]);
  });
});
