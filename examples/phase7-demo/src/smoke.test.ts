/**
 * End-to-end smoke of the Phase 7 plugin ecosystem, using only the public
 * surface: `@nodera/sdk`, `@nodera/plugin-manager` and the five example plugins.
 *
 * It proves the host flow — install → activate → deactivate → uninstall — and
 * that every contribution actually lands in (and is withdrawn from) the
 * builder's registries.
 */

import { assertValid, createBuilder } from "@nodera/sdk";
import { createPluginManager } from "@nodera/plugin-manager";
import { aiNodesPlugin } from "@nodera/ai-nodes";
import { basicNodesPlugin } from "@nodera/basic-nodes";
import { dataNodesPlugin } from "@nodera/data-nodes";
import { developerToolsPlugin } from "@nodera/developer-tools";
import { kitchenSinkPlugin } from "@nodera/example-plugin";
import { describe, expect, it } from "vitest";

describe("Phase 7 plugin ecosystem (real end-to-end)", () => {
  it("installs the five plugins, then deactivates and uninstalls one", () => {
    const builder = assertValid(createBuilder());

    const seen: string[] = [];
    builder.events.on("plugin.activated", (p) => seen.push(`activated:${p.pluginId}`));
    builder.events.on("plugin.deactivated", (p) => seen.push(`deactivated:${p.pluginId}`));
    builder.events.on("plugin.unregistered", (p) => seen.push(`unregistered:${p.pluginId}`));

    const manager = createPluginManager(builder, { sdkVersion: "0.0.0" });

    const install = manager.install([
      basicNodesPlugin,
      dataNodesPlugin,
      aiNodesPlugin,
      developerToolsPlugin,
      kitchenSinkPlugin,
    ]);
    expect(install.ok).toBe(true);

    if (!install.ok) {
      throw new Error(install.error.map((i) => i.message).join("; "));
    }
    for (const record of install.value) {
      console.log(
        `✔ ${record.manifest.id} — ${record.state}, ${record.contributionIds.length} contributions`,
      );
    }

    // Contributions landed in the shared registries.
    expect(builder.registries.nodes.has("example.basic.start")).toBe(true);
    expect(builder.registries.nodes.has("example.ai.classify")).toBe(true);
    expect(builder.registries.edges.has("example.basic.flow")).toBe(true);
    expect(builder.registries.tools.has("example.dev.tool.validate")).toBe(true);
    expect(builder.registries.panels.has("example.dev.panel.issues")).toBe(true);
    expect(builder.registries.themes.has("example.sink.theme.blueprint")).toBe(true);
    expect(builder.registries.layouts.has("example.sink.layout.workspace")).toBe(true);

    // Every installed plugin is active.
    expect(manager.get("example.basic-nodes")?.state).toBe("active");
    expect(manager.get("example.kitchen-sink")?.state).toBe("active");

    // Deactivate + uninstall one plugin; its contributions are withdrawn.
    const deactivated = manager.deactivate("example.developer-tools");
    expect(deactivated.ok).toBe(true);
    expect(manager.get("example.developer-tools")?.state).toBe("inactive");

    const uninstalled = manager.uninstall("example.developer-tools");
    expect(uninstalled.ok).toBe(true);
    expect(manager.get("example.developer-tools")).toBeUndefined();
    expect(builder.registries.tools.has("example.dev.tool.validate")).toBe(false);
    expect(builder.registries.panels.has("example.dev.panel.issues")).toBe(false);
    expect(builder.registries.nodes.has("example.basic.start")).toBe(true); // others untouched

    console.log("events:", seen.join(" | "));
    expect(seen).toContain("activated:example.basic-nodes");
    expect(seen).toContain("activated:example.kitchen-sink");
    expect(seen).toContain("deactivated:example.developer-tools");
    expect(seen).toContain("unregistered:example.developer-tools");
  });
});
