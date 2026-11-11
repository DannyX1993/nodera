import { describe, expect, it } from "vitest";
import { ok } from "@nodera/contracts";
import type {
  PluginContext,
  PluginContribution,
  PluginDefinition,
  PluginManifest,
} from "@nodera/plugin-api";
import type {
  BuilderPluginApi,
  PluginDeactivatedEvent,
  PluginUnregisteredEvent,
} from "@nodera/sdk";
import { createPluginManager } from "./index.js";
import { contribution, createTestBuilder, nodeInput, pluginManifest } from "./test/fixtures.js";

/** A definition that records the order its activation ran in. */
function definition(
  manifest: PluginManifest,
  activate: (api: BuilderPluginApi, ctx: PluginContext<BuilderPluginApi>) => void,
): PluginDefinition<BuilderPluginApi> {
  return { manifest, activate: (ctx) => activate(ctx.api, ctx) };
}

/** Token groups a theme definition must declare. */
function themeTokens() {
  return {
    colors: { accent: "#3366ff" },
    spacing: {},
    typography: {},
    borders: {},
    shadows: {},
    icons: {},
    node: {},
    edge: {},
    handle: {},
    selection: {},
    canvas: {},
  };
}

/** Every contribution kind the manager must be able to remove again. */
const REMOVABLE: readonly (readonly [PluginContribution["type"], string])[] = [
  ["node", "acme.node"],
  ["edge", "acme.edge"],
  ["property", "acme.property"],
  ["panel", "acme.panel"],
  ["tool", "acme.tool"],
  ["theme", "acme.theme"],
  ["layout", "acme.layout"],
  ["validator", "acme.validator"],
  ["importer", "acme.importer"],
  ["exporter", "acme.exporter"],
  ["dialog", "acme.dialog"],
  ["layout-strategy", "acme.strategy"],
];

describe("plugin manager deactivation", () => {
  it("deactivates an active plugin, calling its hook with the manifest and api", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const deactivated: PluginDeactivatedEvent[] = [];
    builder.events.on("plugin.deactivated", (payload) => deactivated.push(payload));
    const contexts: PluginContext<BuilderPluginApi>[] = [];

    const declared = pluginManifest({ contributions: [contribution("node", "acme.node")] });
    const installed = manager.install([
      {
        manifest: declared,
        activate: (ctx) => void ctx.api.nodes.register(nodeInput("acme.node")),
        deactivate: (ctx) => void contexts.push(ctx),
      },
    ]);
    expect(installed.ok).toBe(true);

    const deactivation = manager.deactivate("acme.nodes");

    expect(deactivation.ok).toBe(true);
    if (!deactivation.ok) return;
    expect(deactivation.value.state).toBe("inactive");
    expect(deactivation.value).toEqual({
      manifest: declared,
      state: "inactive",
      contributionIds: ["acme.node"],
      issues: [],
    });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.manifest).toBe(declared);
    expect(typeof contexts[0]?.api.nodes.register).toBe("function");
    expect(deactivated).toEqual([{ pluginId: "acme.nodes" }]);
    // Deactivation never withdraws contributions; uninstall is what removes them.
    expect(builder.registries.nodes.get("acme.node")).toBeDefined();
  });

  it("deactivates a plugin that declares no deactivation hook", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const deactivated: PluginDeactivatedEvent[] = [];
    builder.events.on("plugin.deactivated", (payload) => deactivated.push(payload));

    expect(manager.install([definition(pluginManifest(), () => {})]).ok).toBe(true);

    const deactivation = manager.deactivate("acme.nodes");

    expect(deactivation.ok).toBe(true);
    expect(deactivated).toEqual([{ pluginId: "acme.nodes" }]);
    expect(manager.get("acme.nodes")?.state).toBe("inactive");
  });

  it("refuses to deactivate a plugin it does not manage", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const deactivated: PluginDeactivatedEvent[] = [];
    builder.events.on("plugin.deactivated", (payload) => deactivated.push(payload));

    const deactivation = manager.deactivate("acme.absent");

    expect(deactivation.ok).toBe(false);
    if (deactivation.ok) return;
    expect(deactivation.error.map((issue) => issue.code)).toEqual(["plugin.not-found"]);
    expect(deactivated).toEqual([]);
  });

  it("refuses to deactivate a plugin that is not active", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const contexts: PluginContext<BuilderPluginApi>[] = [];

    expect(
      manager.install([
        definition(pluginManifest(), () => {
          throw new Error("boom");
        }),
      ]).ok,
    ).toBe(false);
    expect(manager.get("acme.nodes")?.state).toBe("error");

    const errored = manager.deactivate("acme.nodes");

    expect(errored.ok).toBe(false);
    if (errored.ok) return;
    expect(errored.error.map((issue) => issue.code)).toEqual(["plugin.invalid-state"]);
    expect(errored.error[0]?.metadata?.state).toBe("error");

    // A plugin that was deactivated once cannot be deactivated again either.
    const other = createPluginManager(createTestBuilder());
    expect(
      other.install([
        {
          manifest: pluginManifest({ id: "acme.once" }),
          activate: () => {},
          deactivate: (ctx) => void contexts.push(ctx),
        },
      ]).ok,
    ).toBe(true);
    expect(other.deactivate("acme.once").ok).toBe(true);

    const twice = other.deactivate("acme.once");

    expect(twice.ok).toBe(false);
    if (twice.ok) return;
    expect(twice.error.map((issue) => issue.code)).toEqual(["plugin.invalid-state"]);
    expect(twice.error[0]?.metadata?.state).toBe("inactive");
    expect(contexts).toHaveLength(1);
  });

  it("records a failing deactivation hook as errored without announcing deactivation", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const deactivated: PluginDeactivatedEvent[] = [];
    builder.events.on("plugin.deactivated", (payload) => deactivated.push(payload));

    expect(
      manager.install([
        {
          manifest: pluginManifest(),
          activate: () => {},
          deactivate: () => {
            throw new Error("cannot stop");
          },
        },
      ]).ok,
    ).toBe(true);

    const deactivation = manager.deactivate("acme.nodes");

    expect(deactivation.ok).toBe(false);
    if (deactivation.ok) return;
    expect(deactivation.error.map((issue) => issue.code)).toEqual([
      "plugin.deactivation-failed",
    ]);
    expect(deactivation.error[0]?.message).toContain("cannot stop");
    expect(manager.get("acme.nodes")?.state).toBe("error");
    expect(deactivated).toEqual([]);
  });
});

describe("plugin manager uninstallation", () => {
  it("removes every declared contribution through its own surface and unregisters the plugin", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const unregistered: PluginUnregisteredEvent[] = [];
    builder.events.on("plugin.unregistered", (payload) => unregistered.push(payload));

    const declared = pluginManifest({
      contributions: REMOVABLE.map(([type, id]) => contribution(type, id)),
    });
    const installed = manager.install([
      definition(declared, (api) => {
        api.nodes.register(nodeInput("acme.node"));
        api.edges.register({ type: "acme.edge", label: "Acme edge" });
        api.properties.register({ id: "acme.property", type: "string", label: "Acme" });
        api.panels.register({ id: "acme.panel", title: "Acme panel", region: "left" });
        api.tools.register({
          id: "acme.tool",
          label: "Acme tool",
          command: { kind: "validate" },
        });
        api.themes.register({ id: "acme.theme", name: "Acme theme", tokens: themeTokens() });
        api.layouts.register({ id: "acme.layout", panels: [] });
        api.validators.register({ id: "acme.validator", level: "domain", validate: () => [] });
        api.importers.register({
          id: "acme.importer",
          format: "acme",
          version: "1.0.0",
          importContent: () => ok(undefined),
        });
        api.exporters.register({
          id: "acme.exporter",
          format: "acme",
          version: "1.0.0",
          exportContent: () => ok("{}"),
        });
        api.dialogs.register({ id: "acme.dialog", title: "Acme dialog" });
        api.layoutStrategies.register({
          id: "acme.strategy",
          place: () => ok({ positions: [] }),
        });
      }),
    ]);
    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value[0]?.issues).toEqual([]);

    const uninstallation = manager.uninstall("acme.nodes");

    expect(uninstallation.ok).toBe(true);
    if (!uninstallation.ok) return;
    expect(uninstallation.value.state).toBe("unregistered");
    expect(uninstallation.value.issues).toEqual([]);
    expect(builder.registries.nodes.all()).toEqual([]);
    expect(builder.registries.edges.all()).toEqual([]);
    expect(builder.properties.all()).toEqual([]);
    expect(builder.registries.panels.get("acme.panel")).toBeUndefined();
    expect(builder.registries.tools.get("acme.tool")).toBeUndefined();
    expect(builder.registries.themes.get("acme.theme")).toBeUndefined();
    expect(builder.registries.layouts.get("acme.layout")).toBeUndefined();
    expect(builder.validators.all().map((validator) => validator.id)).not.toContain(
      "acme.validator",
    );
    expect(builder.importers.all().map((importer) => importer.id)).not.toContain(
      "acme.importer",
    );
    expect(builder.exporters.all().map((exporter) => exporter.id)).not.toContain(
      "acme.exporter",
    );
    expect(builder.dialogs.all().map((dialog) => dialog.id)).not.toContain("acme.dialog");
    expect(builder.graphLayout.all().map((strategy) => strategy.id)).not.toContain(
      "acme.strategy",
    );
    expect(unregistered).toEqual([{ pluginId: "acme.nodes" }]);
    expect(manager.get("acme.nodes")).toBeUndefined();
    expect(manager.list()).toEqual([]);
  });

  it("removes contributions in reverse declaration order", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);

    // Nothing is registered, so every removal reports what was attempted and in
    // which order it was attempted.
    expect(
      manager.install([
        definition(
          pluginManifest({
            contributions: [
              contribution("node", "acme.first"),
              contribution("node", "acme.second"),
            ],
          }),
          () => {},
        ),
      ]).ok,
    ).toBe(true);

    const uninstallation = manager.uninstall("acme.nodes");

    expect(uninstallation.ok).toBe(true);
    if (!uninstallation.ok) return;
    expect(uninstallation.value.issues.map((issue) => issue.code)).toEqual([
      "plugin.not-found",
      "plugin.not-found",
    ]);
    expect(
      uninstallation.value.issues.map((issue) => issue.metadata?.contributionId),
    ).toEqual(["acme.second", "acme.first"]);
  });

  it("keeps the record and reports the issues when a declared contribution was never registered", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const unregistered: PluginUnregisteredEvent[] = [];
    builder.events.on("plugin.unregistered", (payload) => unregistered.push(payload));

    expect(
      manager.install([
        definition(pluginManifest({ contributions: [contribution("node", "acme.ghost")] }), () => {}),
      ]).ok,
    ).toBe(true);

    const uninstallation = manager.uninstall("acme.nodes");

    expect(uninstallation.ok).toBe(true);
    if (!uninstallation.ok) return;
    expect(uninstallation.value.state).toBe("unregistered");
    expect(uninstallation.value.issues.map((issue) => issue.code)).toEqual(["plugin.not-found"]);
    expect(unregistered).toEqual([{ pluginId: "acme.nodes" }]);
    expect(manager.get("acme.nodes")).toBeUndefined();
  });

  it("uninstalls a plugin whose activation failed, removing what it registered", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);

    expect(
      manager
        .install([
          definition(pluginManifest({ contributions: [contribution("node", "acme.node")] }), (api) => {
            api.nodes.register(nodeInput("acme.node"));
            throw new Error("boom");
          }),
        ])
        .ok,
    ).toBe(false);
    expect(builder.registries.nodes.get("acme.node")).toBeDefined();

    const uninstallation = manager.uninstall("acme.nodes");

    expect(uninstallation.ok).toBe(true);
    if (!uninstallation.ok) return;
    expect(uninstallation.value.issues).toEqual([]);
    expect(builder.registries.nodes.all()).toEqual([]);
  });

  it("leaves renderer bindings alone", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const renderer = (): null => null;

    expect(
      manager.install([
        definition(pluginManifest(), (api) => {
          api.renderers.bind("nodes", "acme.node", renderer);
        }),
      ]).ok,
    ).toBe(true);

    const uninstallation = manager.uninstall("acme.nodes");

    expect(uninstallation.ok).toBe(true);
    if (!uninstallation.ok) return;
    expect(uninstallation.value.issues).toEqual([]);
    expect(builder.renderers.nodes.get("acme.node")).toBe(renderer);
  });

  it("refuses to uninstall a plugin it does not manage", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const unregistered: PluginUnregisteredEvent[] = [];
    builder.events.on("plugin.unregistered", (payload) => unregistered.push(payload));

    const uninstallation = manager.uninstall("acme.absent");

    expect(uninstallation.ok).toBe(false);
    if (uninstallation.ok) return;
    expect(uninstallation.error.map((issue) => issue.code)).toEqual(["plugin.not-found"]);
    expect(unregistered).toEqual([]);
  });
});

describe("plugin manager records", () => {
  it("lists installed plugins in installation order and answers one by id", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);

    expect(
      manager.install([
        definition(pluginManifest({ id: "acme.first" }), () => {}),
        definition(pluginManifest({ id: "acme.second" }), () => {}),
      ]).ok,
    ).toBe(true);

    expect(manager.list().map((record) => record.manifest.id)).toEqual([
      "acme.first",
      "acme.second",
    ]);
    expect(manager.get("acme.second")?.state).toBe("active");
    expect(manager.get("acme.absent")).toBeUndefined();
  });

  it("reports an unknown plugin as undefined and keeps the list empty", () => {
    const manager = createPluginManager(createTestBuilder());

    expect(manager.get("acme.absent")).toBeUndefined();
    expect(manager.list()).toEqual([]);
  });
});
