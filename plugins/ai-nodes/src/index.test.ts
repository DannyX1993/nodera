/**
 * Behaviour of the `example.ai-nodes` example plugin.
 *
 * The suite drives the plugin through the public host surface only: it installs
 * it with the plugin manager, reads the node definitions that reached the
 * builder, and uninstalls it to prove the declarations are withdrawn again.
 *
 * The plugin is framework-agnostic, so it binds **no** renderer: presentation is
 * the host's half of the contract (`builder.bindRenderer`). The cases below pin
 * that split — the plugin registers definitions, the host attaches components —
 * which is what lets a builder with this plugin installed be mounted by
 * `@nodera/react` (its `createRendererSet` rejects a binding that is not a
 * React component).
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

import { aiNodesPlugin, CLASSIFY_NODE_TYPE, EMBED_NODE_TYPE } from "./index.js";

/** What the manifest must declare, and what activation must register. */
const DECLARED = [
  { type: "node", id: CLASSIFY_NODE_TYPE, version: "1.0.0" },
  { type: "node", id: EMBED_NODE_TYPE, version: "1.0.0" },
] as const;

/** Contribution ids, in the order activation registers them. */
const REGISTERED_IDS = [CLASSIFY_NODE_TYPE, EMBED_NODE_TYPE];

/** Components a host would bind for the two node types. */
function ClassifyStub(): null {
  return null;
}

function EmbedStub(): null {
  return null;
}

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
  it("installs, registers its two nodes and binds no renderer of its own", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder, { sdkVersion: "1.0.0" });
    const activated: PluginActivatedEvent[] = [];
    builder.events.on("plugin.activated", (payload) => activated.push(payload));

    const installed = manager.install([aiNodesPlugin]);

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value.map((record) => record.state)).toEqual(["active"]);
    expect(installed.value[0]?.issues).toEqual([]);
    expect(installed.value[0]?.contributionIds).toEqual(REGISTERED_IDS);

    expect(builder.registries.nodes.get(CLASSIFY_NODE_TYPE)).toMatchObject({
      type: CLASSIFY_NODE_TYPE,
      label: "Classify",
    });
    expect(builder.registries.nodes.get(EMBED_NODE_TYPE)).toMatchObject({
      type: EMBED_NODE_TYPE,
      label: "Embed",
    });

    // Presentation is the host's share: a framework-agnostic plugin leaves every
    // renderer slot untouched.
    expect([...builder.renderers.nodes.keys()]).toEqual([]);
    expect([...builder.renderers.panels.keys()]).toEqual([]);

    expect(activated).toEqual([
      { pluginId: "example.ai-nodes", contributionIds: REGISTERED_IDS },
    ]);
  });

  it("declares in its manifest exactly the two node contributions it registers", () => {
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
    expect(builder.renderers.nodes.size).toBe(0);
  });

  it("leaves the two renderer bindings to the host", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder, { sdkVersion: "1.0.0" });

    expect(manager.install([aiNodesPlugin]).ok).toBe(true);

    // The host is what turns a node type into a component, keyed by the very id
    // the plugin registered; no prior renderer slot has to exist.
    expect(builder.bindRenderer("nodes", CLASSIFY_NODE_TYPE, ClassifyStub).ok).toBe(true);
    expect(builder.bindRenderer("nodes", EMBED_NODE_TYPE, EmbedStub).ok).toBe(true);

    expect(builder.renderers.nodes.get(CLASSIFY_NODE_TYPE)).toBe(ClassifyStub);
    expect(builder.renderers.nodes.get(EMBED_NODE_TYPE)).toBe(EmbedStub);
    expect([...builder.renderers.nodes.keys()]).toEqual(REGISTERED_IDS);
  });

  it("withdraws its node definitions on uninstall and keeps the host's bindings", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const unregistered: PluginUnregisteredEvent[] = [];
    builder.events.on("plugin.unregistered", (payload) => unregistered.push(payload));

    expect(manager.install([aiNodesPlugin]).ok).toBe(true);
    expect(builder.bindRenderer("nodes", CLASSIFY_NODE_TYPE, ClassifyStub).ok).toBe(true);
    expect(builder.registries.nodes.has(CLASSIFY_NODE_TYPE)).toBe(true);
    expect(builder.registries.nodes.has(EMBED_NODE_TYPE)).toBe(true);

    const uninstallation = manager.uninstall("example.ai-nodes");

    expect(uninstallation.ok).toBe(true);
    if (!uninstallation.ok) return;
    expect(uninstallation.value.state).toBe("unregistered");
    expect(uninstallation.value.issues).toEqual([]);
    expect(builder.registries.nodes.get(CLASSIFY_NODE_TYPE)).toBeUndefined();
    expect(builder.registries.nodes.get(EMBED_NODE_TYPE)).toBeUndefined();
    // The binding belongs to the host, not to the plugin: uninstall never
    // withdraws one (docs/PLUGINS.md, known limitations).
    expect(builder.renderers.nodes.get(CLASSIFY_NODE_TYPE)).toBe(ClassifyStub);
    expect(unregistered).toEqual([{ pluginId: "example.ai-nodes" }]);
    expect(manager.list()).toEqual([]);
  });
});
