import { describe, expect, it } from "vitest";
import { ok } from "@nodera/contracts";
import type { Exporter, Importer } from "@nodera/domain";
import type { GraphLayoutStrategy } from "@nodera/graph-layout";
import type { DialogDefinition } from "@nodera/ui-core";
import type { GraphValidator } from "@nodera/validation";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";
import type { PluginErrorEvent, PluginRegisteredEvent } from "../events/events-api.js";
import type { BuilderPluginApi } from "./plugin.js";

/**
 * The Phase 7 contribution surface (S2, S10).
 *
 * A plugin contributes the same five kinds the core already knows — graph
 * validators, importers, exporters, dialogs and layout strategies — through the
 * builder method of the same name, and the builder exposes the symmetric
 * removal the plugin manager needs to uninstall a plugin without leftovers.
 */

const VALIDATOR_ID = "acme.validator.required-properties";
const IMPORTER_ID = "acme.importer.csv";
const EXPORTER_ID = "acme.exporter.csv";
const DIALOG_ID = "acme.dialog.import-csv";
const STRATEGY_ID = "acme.strategy.grid";

function validator(): GraphValidator {
  return { id: VALIDATOR_ID, level: "domain", validate: () => [] };
}

function importer(): Importer {
  return {
    id: IMPORTER_ID,
    format: "csv",
    version: "1.0.0",
    importContent: () => ok({}),
  };
}

function exporter(): Exporter {
  return {
    id: EXPORTER_ID,
    format: "csv",
    version: "1.0.0",
    exportContent: () => ok(""),
  };
}

function dialog(): DialogDefinition {
  return { id: DIALOG_ID, title: "Import CSV" };
}

function strategy(): GraphLayoutStrategy {
  return { id: STRATEGY_ID, place: () => ok({ positions: [] }) };
}

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

function create(): Builder {
  const result = createBuilder();
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

describe("plugin contribution slots", () => {
  it("registers the five Phase 7 kinds and reports their ids in registration order", () => {
    const builder = create();
    const registered: PluginRegisteredEvent[] = [];
    builder.events.on("plugin.registered", (payload) => {
      registered.push(payload);
    });

    const installed = builder.use({
      id: "acme.surface",
      version: "1.0.0",
      install(api: BuilderPluginApi) {
        api.validators.register(validator());
        api.importers.register(importer());
        api.exporters.register(exporter());
        api.dialogs.register(dialog());
        api.layoutStrategies.register(strategy());
      },
    });

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value.contributionIds).toEqual([
      VALIDATOR_ID,
      IMPORTER_ID,
      EXPORTER_ID,
      DIALOG_ID,
      STRATEGY_ID,
    ]);
    expect(builder.validators.all().map((entry) => entry.id)).toContain(VALIDATOR_ID);
    expect(builder.importers.all().map((entry) => entry.id)).toContain(IMPORTER_ID);
    expect(builder.exporters.all().map((entry) => entry.id)).toContain(EXPORTER_ID);
    expect(builder.dialogs.all().map((entry) => entry.id)).toContain(DIALOG_ID);
    expect(builder.graphLayout.all().map((entry) => entry.id)).toContain(STRATEGY_ID);
    expect(registered).toEqual([
      {
        pluginId: "acme.surface",
        version: "1.0.0",
        contributionIds: [VALIDATOR_ID, IMPORTER_ID, EXPORTER_ID, DIALOG_ID, STRATEGY_ID],
      },
    ]);
  });

  it("keeps the Phase 6 slots working alongside the new ones", () => {
    const builder = create();
    const installed = builder.use({
      id: "acme.mixed",
      version: "2.0.0",
      install(api) {
        api.nodes.register(nodeInput());
        api.validators.register(validator());
      },
    });

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value.contributionIds).toEqual(["demo.node", VALIDATOR_ID]);
    expect(builder.registries.nodes.has("demo.node")).toBe(true);
    expect(builder.validators.all().map((entry) => entry.id)).toContain(VALIDATOR_ID);
  });

  it("removes each contribution kind again and refuses an id nobody registered", () => {
    const builder = create();
    const installed = builder.use({
      id: "acme.removable",
      version: "1.0.0",
      install(api) {
        api.validators.register(validator());
        api.importers.register(importer());
        api.exporters.register(exporter());
        api.dialogs.register(dialog());
        api.layoutStrategies.register(strategy());
      },
    });
    expect(installed.ok).toBe(true);

    expect(builder.validators.unregister(VALIDATOR_ID).ok).toBe(true);
    expect(builder.importers.unregister(IMPORTER_ID).ok).toBe(true);
    expect(builder.exporters.unregister(EXPORTER_ID).ok).toBe(true);
    expect(builder.dialogs.unregister(DIALOG_ID).ok).toBe(true);
    expect(builder.graphLayout.unregister(STRATEGY_ID).ok).toBe(true);

    expect(builder.validators.all().map((entry) => entry.id)).not.toContain(VALIDATOR_ID);
    expect(builder.importers.all().map((entry) => entry.id)).not.toContain(IMPORTER_ID);
    expect(builder.exporters.all().map((entry) => entry.id)).not.toContain(EXPORTER_ID);
    expect(builder.dialogs.all().map((entry) => entry.id)).not.toContain(DIALOG_ID);
    expect(builder.graphLayout.all().map((entry) => entry.id)).not.toContain(STRATEGY_ID);

    const importerCount = builder.importers.all().length;
    const unknown = builder.importers.unregister("acme.importer.missing");
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.error).toEqual([
      expect.objectContaining({ code: "sdk.unknown-definition", path: ["importers", "acme.importer.missing"] }),
    ]);
    expect(builder.importers.all()).toHaveLength(importerCount);
  });

  it("keeps a duplicated id a conflict and registers nothing twice", () => {
    const builder = create();
    const errors: PluginErrorEvent[] = [];
    builder.events.on("plugin.error", (payload) => {
      errors.push(payload);
    });

    const installed = builder.use({
      id: "acme.duplicated",
      version: "1.0.0",
      install(api) {
        api.exporters.register(exporter());
        api.exporters.register(exporter());
      },
    });

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error).toEqual([
      expect.objectContaining({ code: "sdk.duplicate-id", path: ["exporters", EXPORTER_ID] }),
    ]);
    expect(builder.exporters.all().map((entry) => entry.id)).toEqual([EXPORTER_ID]);
    expect(errors).toEqual([
      expect.objectContaining({ pluginId: "acme.duplicated", code: "sdk.duplicate-id" }),
    ]);
  });

  it("rejects a malformed contribution and leaves the registry untouched", () => {
    const builder = create();
    const installed = builder.use({
      id: "acme.malformed",
      version: "1.0.0",
      install(api) {
        // Every kind is structurally checked before its registry sees it.
        api.validators.register({ id: VALIDATOR_ID, level: "domain" } as never);
        api.importers.register({ id: IMPORTER_ID, format: "csv", version: "1.0.0" } as never);
        api.exporters.register({ id: EXPORTER_ID, format: "csv", version: "1.0.0" } as never);
        api.dialogs.register({ id: DIALOG_ID } as never);
        api.layoutStrategies.register({ id: STRATEGY_ID } as never);
      },
    });

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error.map((issue) => issue.code)).toEqual([
      "sdk.invalid-input",
      "sdk.invalid-input",
      "sdk.invalid-input",
      "sdk.invalid-input",
      "sdk.invalid-input",
    ]);
    expect(builder.validators.all()).toEqual([]);
    expect(builder.importers.all()).toEqual([]);
    expect(builder.exporters.all()).toEqual([]);
    expect(builder.dialogs.all().map((entry) => entry.id)).not.toContain(DIALOG_ID);
    expect(builder.graphLayout.all().map((entry) => entry.id)).not.toContain(STRATEGY_ID);
  });

  it("refuses every new mutation once the builder is disposed", () => {
    const builder = create();
    builder.dispose();

    expect(builder.validators.register(validator())).toEqual({
      ok: false,
      error: [expect.objectContaining({ code: "sdk.disposed" })],
    });
    expect(builder.importers.register(importer()).ok).toBe(false);
    const removed = builder.exporters.unregister(EXPORTER_ID);
    expect(removed.ok).toBe(false);
    if (removed.ok) return;
    expect(removed.error[0]).toMatchObject({ code: "sdk.disposed" });
    expect(builder.validators.all()).toEqual([]);
  });

  it("closes the open dialog when its definition is unregistered", () => {
    const builder = create();
    expect(builder.dialogs.register(dialog()).ok).toBe(true);
    expect(builder.store.openDialog(DIALOG_ID).ok).toBe(true);
    expect(builder.store.getState().activeDialogId).toBe(DIALOG_ID);

    expect(builder.dialogs.unregister(DIALOG_ID).ok).toBe(true);

    expect(builder.store.getState().activeDialogId).toBeUndefined();
    expect(builder.dialogs.all().map((entry) => entry.id)).not.toContain(DIALOG_ID);
  });

  it("moves the active strategy to a registered one when the active strategy is unregistered", () => {
    const builder = create();
    expect(builder.graphLayout.register(strategy()).ok).toBe(true);
    expect(builder.graphLayout.setDefault(STRATEGY_ID).ok).toBe(true);
    expect(builder.store.getState().activeGraphStrategyId).toBe(STRATEGY_ID);

    const removed = builder.graphLayout.unregister(STRATEGY_ID);
    expect(removed.ok).toBe(true);

    const active = builder.store.getState().activeGraphStrategyId;
    expect(active).not.toBe(STRATEGY_ID);
    expect(builder.graphLayout.all().map((entry) => entry.id)).toContain(active);
  });
});
