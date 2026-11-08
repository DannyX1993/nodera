import { describe, expect, it } from "vitest";
import { DARK_THEME } from "@nodera/theme-engine";
import type { LayoutDefinition } from "@nodera/ui-core";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";
import type { BuilderConfiguration } from "../builder/configuration.js";
import type { PluginErrorEvent, PluginRegisteredEvent } from "../events/events-api.js";
import {
  installPlugin,
  type BuilderPlugin,
  type BuilderPluginApi,
  type PluginInstallation,
} from "./plugin.js";

function nodeInput(overrides: Partial<NodeDefinitionInput> = {}): NodeDefinitionInput {
  return {
    type: "demo.node",
    version: "1.0.0",
    label: "Demo node",
    category: "demo",
    ports: {
      inputs: [{ id: "in", dataType: "any" }],
      outputs: [{ id: "out", dataType: "any" }],
    },
    ...overrides,
  };
}

function layoutInput(): LayoutDefinition {
  return { id: "acme.layout", panels: [{ panelId: "palette", region: "left" }] };
}

function create(configuration?: BuilderConfiguration): Builder {
  const result = createBuilder(configuration);
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

/** Collects every contribution id the plugin api reports, in call order. */
const CONTRIBUTION_IDS = [
  "demo.node",
  "acme.edge",
  "acme.option",
  "acme.panel",
  "tool.acme",
  "acme.theme",
  "acme.layout",
];

const NodeRenderer = (): null => null;

describe("plugin installation", () => {
  it("registers every contribution of a valid plugin and reports the ids in order", () => {
    const builder = create();
    const registered: PluginRegisteredEvent[] = [];
    builder.events.on("plugin.registered", (payload) => {
      registered.push(payload);
    });
    let apiKeys: readonly string[] = [];

    const installed = builder.use({
      id: "acme.nodes",
      version: "1.2.0",
      install(api: BuilderPluginApi) {
        apiKeys = Object.keys(api);
        api.nodes.register(nodeInput());
        api.edges.register({ type: "acme.edge", label: "Acme edge" });
        api.properties.register({ id: "acme.option", type: "string", label: "Option" });
        api.panels.register({ id: "acme.panel", title: "Acme panel", region: "left" });
        api.tools.register({ id: "tool.acme", label: "Acme tool", command: { kind: "validate" } });
        api.themes.register({ id: "acme.theme", name: "Acme", tokens: DARK_THEME.tokens });
        api.layouts.register(layoutInput());
        api.renderers.bind("nodes", "demo.node", NodeRenderer);
      },
    });

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value).toEqual({
      pluginId: "acme.nodes",
      version: "1.2.0",
      contributionIds: CONTRIBUTION_IDS,
    });
    expect(builder.registries.nodes.get("demo.node")).toBeDefined();
    expect(builder.registries.edges.get("acme.edge")).toBeDefined();
    expect(builder.properties.get("acme.option")).toBeDefined();
    expect(builder.registries.panels.get("acme.panel")).toBeDefined();
    expect(builder.registries.tools.get("tool.acme")).toBeDefined();
    expect(builder.registries.themes.get("acme.theme")).toBeDefined();
    expect(builder.registries.layouts.get("acme.layout")).toBeDefined();
    expect(builder.renderers.nodes.get("demo.node")).toBe(NodeRenderer);
    expect(registered).toEqual([
      { pluginId: "acme.nodes", version: "1.2.0", contributionIds: CONTRIBUTION_IDS },
    ]);
    expect(apiKeys).not.toContain("use");
  });

  it("keeps the successful contributions of a plugin whose registrations fail", () => {
    const builder = create();
    const registered: PluginRegisteredEvent[] = [];
    const errors: PluginErrorEvent[] = [];
    builder.events.on("plugin.registered", (payload) => {
      registered.push(payload);
    });
    builder.events.on("plugin.error", (payload) => {
      errors.push(payload);
    });

    const installed = builder.use({
      id: "acme.partial",
      version: "1.0.0",
      install(api) {
        api.nodes.register(nodeInput());
        api.nodes.register(nodeInput());
        api.nodes.register(nodeInput({ type: "unqualified", label: "" }));
      },
    });

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error.map((issue) => issue.code)).toEqual([
      "sdk.duplicate-id",
      "sdk.invalid-id",
      "sdk.invalid-input",
    ]);
    expect(builder.registries.nodes.has("demo.node")).toBe(true);
    expect(builder.registries.nodes.size).toBe(1);

    expect(registered).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ pluginId: "acme.partial", code: "sdk.duplicate-id" });
    expect(errors[1]).toMatchObject({ pluginId: "acme.partial", code: "sdk.invalid-id" });
    expect(errors.every((error) => error.message.length > 0)).toBe(true);
  });

  it("installs a plugin through the exported function with the same bookkeeping", () => {
    const builder = create();

    const installed = installPlugin(builder, {
      id: "acme.direct",
      version: "0.1.0",
      install(api) {
        api.nodes.register(nodeInput());
      },
    });

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value.contributionIds).toEqual(["demo.node"]);
    expect(builder.registries.nodes.has("demo.node")).toBe(true);

    const again = builder.use({ id: "acme.direct", version: "0.1.0", install: () => {} });
    expect(again.ok).toBe(false);
  });
});

describe("plugin validation", () => {
  it.each([
    { field: "id", plugin: { id: "acme", version: "1.0.0" }, path: ["id"] },
    { field: "version", plugin: { id: "acme.nodes", version: "1.0" }, path: ["version"] },
  ])("rejects an invalid plugin $field before install runs", ({ plugin, path }) => {
    const builder = create();
    let calls = 0;

    const installed = builder.use({ ...plugin, install: () => {
      calls += 1;
    } });

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error).toHaveLength(1);
    expect(installed.error[0]).toMatchObject({
      code: "sdk.plugin-invalid",
      severity: "error",
      path,
    });
    expect(installed.error[0]?.message.length).toBeGreaterThan(0);
    expect(calls).toBe(0);
  });

  it("reports every invalid plugin field at once", () => {
    const builder = create();
    let calls = 0;

    const installed = builder.use({
      id: "acme",
      version: "1.0",
      install: () => {
        calls += 1;
      },
    });

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error.map((issue) => issue.path)).toEqual([["id"], ["version"]]);
    expect(calls).toBe(0);
  });

  it("contains a throwing install and reports the thrown message", () => {
    const builder = create();
    let installed: ReturnType<Builder["use"]> | undefined;

    expect(() => {
      installed = builder.use({
        id: "acme.boom",
        version: "1.0.0",
        install(api) {
          api.nodes.register(nodeInput());
          throw new Error("boom from install");
        },
      });
    }).not.toThrow();

    expect(installed).toBeDefined();
    if (installed === undefined) return;
    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error[0]).toMatchObject({
      code: "sdk.plugin-invalid",
      severity: "error",
    });
    expect(installed.error[0]?.message).toContain("boom from install");
    expect(builder.registries.nodes.has("demo.node")).toBe(true);
  });
});

describe("plugin conflicts", () => {
  it("refuses a second plugin with an installed id and never runs its install", () => {
    const builder = create();
    const first = builder.use({ id: "acme.nodes", version: "1.0.0", install: () => {} });
    expect(first.ok).toBe(true);

    let calls = 0;
    const second = builder.use({
      id: "acme.nodes",
      version: "2.0.0",
      install: () => {
        calls += 1;
      },
    });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toHaveLength(1);
    expect(second.error[0]).toMatchObject({
      code: "sdk.plugin-conflict",
      severity: "error",
      path: ["id"],
    });
    expect(second.error[0]?.message).toContain("acme.nodes");
    expect(second.error[0]?.message).toContain("already installed");
    expect(calls).toBe(0);
  });

  it("refuses to reinstall an id whose install only partially succeeded", () => {
    const builder = create();
    const partial = builder.use({
      id: "acme.partial",
      version: "1.0.0",
      install(api) {
        api.nodes.register(nodeInput());
        api.nodes.register(nodeInput());
      },
    });
    expect(partial.ok).toBe(false);

    let calls = 0;
    const retry = builder.use({
      id: "acme.partial",
      version: "1.0.0",
      install: () => {
        calls += 1;
      },
    });

    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.error[0]).toMatchObject({ code: "sdk.plugin-conflict", path: ["id"] });
    expect(calls).toBe(0);
  });
});

describe("plugin api surface", () => {
  it("exposes only registration slots, so install can extend but never re-enter", () => {
    const builder = create();
    let apiKeys: readonly string[] = [];
    let nestedRegistered = false;

    function registerNested(api: BuilderPluginApi): void {
      nestedRegistered = api.nodes.register(nodeInput({ type: "acme.nested" })).ok;
    }

    const installed: ReturnType<Builder["use"]> = builder.use({
      id: "acme.surface",
      version: "1.0.0",
      install(api) {
        apiKeys = Object.keys(api);
        registerNested(api);
      },
    });

    expect(installed.ok).toBe(true);
    expect(apiKeys).toEqual([
      "nodes",
      "edges",
      "properties",
      "panels",
      "tools",
      "themes",
      "layouts",
      "renderers",
    ]);
    expect(nestedRegistered).toBe(true);
    expect(builder.registries.nodes.has("acme.nested")).toBe(true);
  });
});

describe("plugin types", () => {
  it("composes a plugin literal the host declares", () => {
    const plugin: BuilderPlugin = {
      id: "acme.literal",
      version: "1.0.0",
      install(api) {
        api.nodes.register(nodeInput());
      },
    };
    const builder = create();

    const installed: ReturnType<Builder["use"]> = builder.use(plugin);

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    const installation: PluginInstallation = installed.value;
    expect(installation.pluginId).toBe("acme.literal");
  });
});
