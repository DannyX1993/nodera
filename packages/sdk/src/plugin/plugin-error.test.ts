import { describe, expect, it } from "vitest";

import { assertValid, createBuilder, type NodeDefinitionInput } from "../index.js";
import type { PluginErrorEvent } from "../events/events-api.js";

/**
 * `plugin.error` is the single channel a host uses to learn that a plugin
 * failed, so the event count is part of the contract, not an implementation
 * detail: one event per failed plugin.
 *
 * A throwing `install` aborts the plugin, so its throw is what gets reported —
 * once — even when an earlier contribution had already failed. What the plugin
 * managed to register before the throw stays registered: install is additive and
 * this phase has no rollback (see the module doc of `plugin.ts`).
 */

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

describe("plugin.error for a throwing install", () => {
  it("reports the throw once and keeps the contribution registered before it", () => {
    const builder = assertValid(createBuilder());
    const errors: PluginErrorEvent[] = [];
    builder.events.on("plugin.error", (payload) => {
      errors.push(payload);
    });

    const installed = builder.use({
      id: "acme.throwing",
      version: "1.0.0",
      install(api) {
        api.nodes.register(nodeInput());
        throw new Error("boom from install");
      },
    });

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error).toHaveLength(1);
    expect(installed.error[0]).toMatchObject({
      code: "sdk.plugin-invalid",
      severity: "error",
    });
    expect(installed.error[0]?.message).toContain("boom from install");

    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      pluginId: "acme.throwing",
      code: "sdk.plugin-invalid",
      message: expect.stringContaining("boom from install"),
    });

    // No rollback: a contribution registered before the throw survives, which
    // is also why the id counts as installed afterwards.
    expect(builder.registries.nodes.has("demo.node")).toBe(true);
    expect(builder.registries.nodes.size).toBe(1);
  });

  it("emits one event for a plugin that both fails a contribution and throws", () => {
    const builder = assertValid(createBuilder());
    const errors: PluginErrorEvent[] = [];
    builder.events.on("plugin.error", (payload) => {
      errors.push(payload);
    });

    const installed = builder.use({
      id: "acme.mixed",
      version: "1.0.0",
      install(api) {
        api.nodes.register(nodeInput());
        // Fails with `sdk.duplicate-id`; the throw below aborts the install.
        api.nodes.register(nodeInput());
        throw new Error("boom after a failed contribution");
      },
    });

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error.map((issue) => issue.code)).toEqual([
      "sdk.duplicate-id",
      "sdk.plugin-invalid",
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      pluginId: "acme.mixed",
      code: "sdk.plugin-invalid",
    });
    expect(errors[0]?.message).toContain("boom after a failed contribution");
    expect(errors[0]?.message).not.toContain("already registered");
  });

  it("still reports each failed contribution while the install does not throw", () => {
    const builder = assertValid(createBuilder());
    const errors: PluginErrorEvent[] = [];
    builder.events.on("plugin.error", (payload) => {
      errors.push(payload);
    });

    const installed = builder.use({
      id: "acme.contributions",
      version: "1.0.0",
      install(api) {
        api.nodes.register(nodeInput());
        api.nodes.register(nodeInput());
        api.nodes.register(nodeInput({ type: "unqualified" }));
      },
    });

    expect(installed.ok).toBe(false);
    expect(errors.map((error) => error.code)).toEqual([
      "sdk.duplicate-id",
      "sdk.invalid-id",
    ]);
    expect(builder.registries.nodes.has("demo.node")).toBe(true);
  });
});
