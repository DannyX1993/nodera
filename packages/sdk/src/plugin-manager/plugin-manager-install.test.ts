import { describe, expect, it } from "vitest";
import type { PluginContext, PluginDefinition, PluginManifest } from "../plugin-api/index.js";
import type { BuilderPluginApi } from "../plugin/plugin.js";
import type { PluginActivatedEvent, PluginRegisteredEvent } from "../events/events-api.js";
import { createPluginManager } from "./index.js";
import {
  contribution,
  createTestBuilder,
  nodeInput,
  notADefinition,
  pluginManifest,
  untrustedDefinition,
} from "./test/fixtures.js";

/** A definition that records the order its activation ran in. */
function definition(
  manifest: PluginManifest,
  activate: (api: BuilderPluginApi, ctx: PluginContext<BuilderPluginApi>) => void,
): PluginDefinition<BuilderPluginApi> {
  return { manifest, activate: (ctx) => activate(ctx.api, ctx) };
}

describe("plugin manager installation", () => {
  it("registers and activates a plugin, reporting its record and the activation", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const activated: PluginActivatedEvent[] = [];
    const registered: PluginRegisteredEvent[] = [];
    builder.events.on("plugin.activated", (payload) => activated.push(payload));
    builder.events.on("plugin.registered", (payload) => registered.push(payload));

    const declared = pluginManifest({ contributions: [contribution("node", "acme.node")] });
    const installed = manager.install([
      definition(declared, (api, ctx) => {
        expect(ctx.manifest).toBe(declared);
        api.nodes.register(nodeInput("acme.node"));
      }),
    ]);

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value).toEqual([
      { manifest: declared, state: "active", contributionIds: ["acme.node"], issues: [] },
    ]);
    expect(builder.registries.nodes.get("acme.node")).toBeDefined();
    expect(registered).toEqual([
      { pluginId: "acme.nodes", version: "1.0.0", contributionIds: ["acme.node"] },
    ]);
    expect(activated).toEqual([{ pluginId: "acme.nodes", contributionIds: ["acme.node"] }]);
    expect(manager.get("acme.nodes")).toEqual(installed.value[0]);
    expect(manager.list()).toEqual(installed.value);
  });

  it("installs dependencies before the plugins that need them", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const order: string[] = [];

    const base = definition(
      pluginManifest({
        id: "acme.base",
        contributions: [contribution("node", "acme.base-node")],
      }),
      (api) => {
        order.push("acme.base");
        api.nodes.register(nodeInput("acme.base-node"));
      },
    );
    const derived = definition(
      pluginManifest({
        id: "acme.derived",
        dependencies: [{ id: "acme.base", version: "^1.0.0" }],
        contributions: [contribution("node", "acme.derived-node")],
      }),
      (api) => {
        order.push("acme.derived");
        api.nodes.register(nodeInput("acme.derived-node"));
      },
    );

    const installed = manager.install([derived, base]);

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(order).toEqual(["acme.base", "acme.derived"]);
    expect(installed.value.map((record) => record.manifest.id)).toEqual([
      "acme.base",
      "acme.derived",
    ]);
  });

  it("keeps the input order of independent plugins", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const order: string[] = [];

    const installed = manager.install([
      definition(pluginManifest({ id: "acme.first" }), () => {
        order.push("acme.first");
      }),
      definition(pluginManifest({ id: "acme.second" }), () => {
        order.push("acme.second");
      }),
    ]);

    expect(installed.ok).toBe(true);
    expect(order).toEqual(["acme.first", "acme.second"]);
    expect(manager.list().map((record) => record.manifest.id)).toEqual([
      "acme.first",
      "acme.second",
    ]);
  });

  it("aborts the whole install when a manifest is invalid, running no plugin code", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const activated: PluginActivatedEvent[] = [];
    builder.events.on("plugin.activated", (payload) => activated.push(payload));
    const ran: string[] = [];

    const installed = manager.install([
      definition(pluginManifest({ id: "acme.good" }), () => {
        ran.push("acme.good");
      }),
      untrustedDefinition({ id: "Unqualified", name: "", version: "one" }, () => {
        ran.push("acme.bad");
      }),
    ]);

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(new Set(installed.error.map((issue) => issue.code))).toEqual(
      new Set(["plugin.invalid-manifest"]),
    );
    expect(installed.error.length).toBeGreaterThan(0);
    expect(ran).toEqual([]);
    expect(activated).toEqual([]);
    expect(manager.list()).toEqual([]);
    expect(builder.registries.nodes.all()).toEqual([]);
  });

  it("rejects entries that are not plugin definitions before running anything", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const ran: string[] = [];

    const installed = manager.install([
      definition(pluginManifest({ id: "acme.good" }), () => void ran.push("acme.good")),
      notADefinition({ manifest: pluginManifest({ id: "acme.no-activate" }) }),
      notADefinition(null),
    ]);

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error.map((issue) => issue.code)).toEqual([
      "plugin.invalid-manifest",
      "plugin.invalid-manifest",
    ]);
    expect(installed.error.map((issue) => issue.path)).toEqual([
      ["plugins", "1"],
      ["plugins", "2"],
    ]);
    expect(ran).toEqual([]);
    expect(manager.list()).toEqual([]);
  });

  it("aborts the install when two plugins claim the same id", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const ran: string[] = [];

    const installed = manager.install([
      definition(pluginManifest({ id: "acme.duplicate" }), () => {
        ran.push("first");
      }),
      definition(pluginManifest({ id: "acme.duplicate" }), () => {
        ran.push("second");
      }),
    ]);

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error.map((issue) => issue.code)).toEqual(["plugin.duplicate-plugin"]);
    expect(ran).toEqual([]);
    expect(manager.list()).toEqual([]);
  });

  it("refuses a plugin id that is already installed", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const ran: string[] = [];
    const manifest = pluginManifest({ id: "acme.once" });

    expect(manager.install([definition(manifest, () => void ran.push("first"))]).ok).toBe(true);
    const twice = manager.install([definition(manifest, () => void ran.push("second"))]);

    expect(twice.ok).toBe(false);
    if (twice.ok) return;
    expect(twice.error.map((issue) => issue.code)).toEqual(["plugin.duplicate-plugin"]);
    expect(ran).toEqual(["first"]);
    expect(manager.list()).toHaveLength(1);
  });

  it("aborts the install when two plugins declare the same contribution", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const ran: string[] = [];

    const installed = manager.install([
      definition(
        pluginManifest({
          id: "acme.first",
          contributions: [contribution("node", "acme.shared")],
        }),
        () => void ran.push("acme.first"),
      ),
      definition(
        pluginManifest({
          id: "acme.second",
          contributions: [contribution("node", "acme.shared")],
        }),
        () => void ran.push("acme.second"),
      ),
    ]);

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error.map((issue) => issue.code)).toEqual(["plugin.contribution-conflict"]);
    expect(ran).toEqual([]);
    expect(builder.registries.nodes.all()).toEqual([]);
  });

  it("aborts the install when a dependency is missing", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const ran: string[] = [];

    const installed = manager.install([
      definition(
        pluginManifest({ id: "acme.orphan", dependencies: [{ id: "acme.absent" }] }),
        () => void ran.push("acme.orphan"),
      ),
    ]);

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error.map((issue) => issue.code)).toEqual(["plugin.missing-dependency"]);
    expect(ran).toEqual([]);
    expect(manager.list()).toEqual([]);
  });

  it("aborts the install when dependencies form a cycle", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const ran: string[] = [];

    const installed = manager.install([
      definition(
        pluginManifest({ id: "acme.left", dependencies: [{ id: "acme.right" }] }),
        () => void ran.push("acme.left"),
      ),
      definition(
        pluginManifest({ id: "acme.right", dependencies: [{ id: "acme.left" }] }),
        () => void ran.push("acme.right"),
      ),
    ]);

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error.map((issue) => issue.code)).toEqual(["plugin.dependency-cycle"]);
    expect(ran).toEqual([]);
    expect(manager.list()).toEqual([]);
  });

  it("rejects a plugin whose SDK range the host version does not satisfy", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder, { sdkVersion: "2.0.0" });
    const ran: string[] = [];

    const installed = manager.install([
      definition(
        pluginManifest({
          id: "acme.old-sdk",
          compatibility: { sdkVersion: "^1.0.0" },
        }),
        () => void ran.push("acme.old-sdk"),
      ),
    ]);

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error.map((issue) => issue.code)).toEqual(["plugin.incompatible-sdk"]);
    expect(installed.error[0]?.metadata?.range).toBe("^1.0.0");
    expect(ran).toEqual([]);
    expect(manager.list()).toEqual([]);
  });

  it("accepts a satisfied SDK range and defaults to the SDK version when the host declares none", () => {
    const builder = createTestBuilder();
    const compatible = createPluginManager(builder, { sdkVersion: "1.4.0" });
    const hostDefault = createPluginManager(createTestBuilder());

    const withRange = pluginManifest({
      id: "acme.new-sdk",
      compatibility: { sdkVersion: "^1.0.0" },
    });
    const strictRange = pluginManifest({
      id: "acme.future",
      compatibility: { sdkVersion: "^3.0.0" },
    });

    expect(compatible.install([definition(withRange, () => {})]).ok).toBe(true);
    // Without a host sdkVersion the SDK's own version (1.0.0) is the baseline:
    // a ^1.0.0 range passes, and a ^3.0.0 range is rejected.
    expect(hostDefault.install([definition(withRange, () => {})]).ok).toBe(true);
    const rejected = hostDefault.install([definition(strictRange, () => {})]);
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.error.map((issue) => issue.code)).toEqual(["plugin.incompatible-sdk"]);
  });

  it("rejects a plugin whose document format or version the host does not match", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder, {
      documentFormat: "ggd",
      documentVersion: "1.0.0",
    });

    const wrongFormat = manager.install([
      definition(
        pluginManifest({ id: "acme.yaml", compatibility: { documentFormat: "yaml" } }),
        () => {},
      ),
    ]);
    const wrongVersion = manager.install([
      definition(
        pluginManifest({
          id: "acme.future-doc",
          compatibility: { documentFormat: "ggd", documentVersion: "2.0.0" },
        }),
        () => {},
      ),
    ]);

    expect(wrongFormat.ok).toBe(false);
    if (wrongFormat.ok) return;
    expect(wrongFormat.error.map((issue) => issue.code)).toEqual(["plugin.incompatible-sdk"]);
    expect(wrongVersion.ok).toBe(false);
    if (wrongVersion.ok) return;
    expect(wrongVersion.error.map((issue) => issue.code)).toEqual(["plugin.incompatible-sdk"]);
    expect(manager.list()).toEqual([]);
  });

  it("accepts a plugin that matches the declared document format and version", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder, {
      documentFormat: "ggd",
      documentVersion: "1.0.0",
    });

    const installed = manager.install([
      definition(
        pluginManifest({
          id: "acme.ggd",
          compatibility: { documentFormat: "ggd", documentVersion: "1.0.0" },
        }),
        () => {},
      ),
    ]);

    expect(installed.ok).toBe(true);
    expect(manager.list().map((record) => record.state)).toEqual(["active"]);
  });

  it("records an activation that throws as errored and keeps what it registered", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const activated: PluginActivatedEvent[] = [];
    builder.events.on("plugin.activated", (payload) => activated.push(payload));

    const declared = pluginManifest({ contributions: [contribution("node", "acme.node")] });
    const installed = manager.install([
      definition(declared, (api) => {
        api.nodes.register(nodeInput("acme.node"));
        throw new Error("boom");
      }),
    ]);

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error.map((issue) => issue.code)).toEqual(["plugin.activation-failed"]);
    expect(installed.error[0]?.message).toContain("boom");
    expect(builder.registries.nodes.get("acme.node")).toBeDefined();
    expect(activated).toEqual([]);
    expect(manager.get("acme.nodes")).toEqual({
      manifest: declared,
      state: "error",
      contributionIds: [],
      issues: [],
    });
  });

  it("stops installing the batch after an activation failure", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const order: string[] = [];

    const installed = manager.install([
      definition(pluginManifest({ id: "acme.throws" }), () => {
        order.push("acme.throws");
        throw new Error("boom");
      }),
      definition(pluginManifest({ id: "acme.after" }), () => {
        order.push("acme.after");
      }),
    ]);

    expect(installed.ok).toBe(false);
    expect(order).toEqual(["acme.throws"]);
    expect(manager.list().map((record) => record.manifest.id)).toEqual(["acme.throws"]);
    expect(manager.list().map((record) => record.state)).toEqual(["error"]);
  });

  it("records a warning when a plugin registers an undeclared contribution", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);

    const installed = manager.install([
      definition(
        pluginManifest({ contributions: [contribution("node", "acme.node")] }),
        (api) => {
          api.nodes.register(nodeInput("acme.node"));
          api.nodes.register(nodeInput("acme.undeclared"));
        },
      ),
    ]);

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    const record = installed.value[0];
    expect(record?.state).toBe("active");
    expect(record?.contributionIds).toEqual(["acme.node", "acme.undeclared"]);
    expect(record?.issues.map((issue) => issue.code)).toEqual(["plugin.invalid-manifest"]);
    expect(record?.issues.map((issue) => issue.severity)).toEqual(["warning"]);
    expect(record?.issues[0]?.metadata?.contributionId).toBe("acme.undeclared");
  });

  it("installs an empty batch without announcing anything", () => {
    const builder = createTestBuilder();
    const manager = createPluginManager(builder);
    const activated: PluginActivatedEvent[] = [];
    builder.events.on("plugin.activated", (payload) => activated.push(payload));

    const installed = manager.install([]);

    expect(installed).toEqual({ ok: true, value: [] });
    expect(activated).toEqual([]);
    expect(manager.list()).toEqual([]);
  });
});
