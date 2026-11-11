/**
 * Behaviour of the `example.ai-nodes` example plugin.
 *
 * The suite drives the plugin through the public host surface only: it installs
 * it with the plugin manager, reads the node definitions and the renderer
 * bindings that reached the builder, and uninstalls it to prove the declarations
 * are withdrawn again (D13).
 *
 * Renderer bindings are deliberately *not* withdrawn: the SDK records a binding
 * as an opaque value on an existing slot, never as a contribution, so the
 * uninstall case pins that documented asymmetry instead of assuming it.
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

import { aiNodesPlugin } from "./index.js";

/** What the manifest must declare, and what activation must register. */
const DECLARED = [
  { type: "node", id: "example.ai.classify", version: "1.0.0" },
  { type: "node", id: "example.ai.embed", version: "1.0.0" },
  { type: "renderer", id: "example.ai.classify" },
  { type: "renderer", id: "example.ai.embed" },
] as const;

/** Contribution ids, in the order activation registers them. */
const REGISTERED_IDS = ["example.ai.classify", "example.ai.embed"];

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

describe("example.ai-nodes", () => {
  it("installs, registers its nodes and binds their renderers", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder, { sdkVersion: "0.0.0" });
    const activated: PluginActivatedEvent[] = [];
    builder.events.on("plugin.activated", (payload) => activated.push(payload));

    const installed = manager.install([aiNodesPlugin]);

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value.map((record) => record.state)).toEqual(["active"]);
    expect(installed.value[0]?.issues).toEqual([]);
    // A binding is not a contribution, so it never reaches `contributionIds`.
    expect(installed.value[0]?.contributionIds).toEqual(REGISTERED_IDS);

    expect(builder.registries.nodes.get("example.ai.classify")).toMatchObject({
      type: "example.ai.classify",
      label: "Classify",
    });
    expect(builder.registries.nodes.get("example.ai.embed")).toMatchObject({
      type: "example.ai.embed",
      label: "Embed",
    });
    expect(builder.renderers.nodes.get("example.ai.classify")).toEqual({
      kind: "ai-node",
      accent: "violet",
      badge: "AI",
    });
    expect(builder.renderers.nodes.get("example.ai.embed")).toEqual({
      kind: "ai-node",
      accent: "teal",
      badge: "AI",
    });

    expect(activated).toEqual([
      { pluginId: "example.ai-nodes", contributionIds: REGISTERED_IDS },
    ]);
  });

  it("declares in its manifest exactly the contributions its activation registers", () => {
    const validation = validatePluginManifest(aiNodesPlugin.manifest);

    expect(validation.ok).toBe(true);
    expect(aiNodesPlugin.manifest.id).toBe("example.ai-nodes");
    expect(aiNodesPlugin.manifest.contributions).toEqual(DECLARED);

    const builder = createTestBuilder();
    const installed = createPluginManager(builder).install([aiNodesPlugin]);
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value[0]?.issues).toEqual([]);
    expect(installed.value[0]?.contributionIds).toEqual(REGISTERED_IDS);
    // The renderer declarations describe the bindings the plugin performs; they
    // are not registered ids, so they are checked through the bindings instead.
    expect([...builder.renderers.nodes.keys()].sort()).toEqual([...REGISTERED_IDS].sort());
  });

  it("withdraws its node definitions on uninstall and keeps the renderer bindings", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const unregistered: PluginUnregisteredEvent[] = [];
    builder.events.on("plugin.unregistered", (payload) => unregistered.push(payload));

    expect(manager.install([aiNodesPlugin]).ok).toBe(true);
    expect(builder.registries.nodes.has("example.ai.classify")).toBe(true);
    expect(builder.registries.nodes.has("example.ai.embed")).toBe(true);
    expect(builder.renderers.nodes.has("example.ai.classify")).toBe(true);

    const uninstallation = manager.uninstall("example.ai-nodes");

    expect(uninstallation.ok).toBe(true);
    if (!uninstallation.ok) return;
    expect(uninstallation.value.state).toBe("unregistered");
    expect(uninstallation.value.issues).toEqual([]);
    expect(builder.registries.nodes.get("example.ai.classify")).toBeUndefined();
    expect(builder.registries.nodes.get("example.ai.embed")).toBeUndefined();
    expect(builder.renderers.nodes.has("example.ai.classify")).toBe(true);
    expect(builder.renderers.nodes.has("example.ai.embed")).toBe(true);
    expect(unregistered).toEqual([{ pluginId: "example.ai-nodes" }]);
    expect(manager.list()).toEqual([]);
  });
});
