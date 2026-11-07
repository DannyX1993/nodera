import { describe, expect, it } from "vitest";
import { err, ok, type Result } from "@nodera/contracts";
import type { Exporter } from "./exporter-registry.js";
import { ExporterRegistry } from "./exporter-registry.js";
import type { ImportError, Importer } from "./importer-registry.js";
import { ImporterRegistry } from "./importer-registry.js";

const passthroughImporter: Importer = {
  id: "vendor.json-importer",
  format: "json",
  version: "1.0.0",
  importContent: (raw) => (raw.trim().length > 0 ? ok({ raw }) : err({ kind: "parse-failed", message: "empty content" })),
};

const passthroughExporter: Exporter = {
  id: "vendor.json-exporter",
  format: "json",
  version: "1.0.0",
  exportContent: (document) => ok(JSON.stringify(document)),
};

describe("ImporterRegistry", () => {
  it("registers, queries by id and format, and lists formats", () => {
    const registry = new ImporterRegistry();
    registry.register(passthroughImporter);
    registry.register({ ...passthroughImporter, id: "vendor.yaml-importer", format: "yaml" });

    expect(registry.get("vendor.json-importer")?.format).toBe("json");
    expect(registry.requireFormat("json")).toMatchObject({ ok: true, value: { id: "vendor.json-importer" } });
    expect(registry.byFormat("yaml").map((i) => i.id)).toEqual(["vendor.yaml-importer"]);
    expect(registry.formats()).toEqual(["json", "yaml"]);
    expect(registry.requireFormat("xml")).toMatchObject({
      ok: false,
      error: { kind: "not-found", message: 'ImporterRegistry has no importer for format "xml"' },
    });
  });

  it("detects duplicate ids and unregisters explicitly", () => {
    const registry = new ImporterRegistry();
    registry.register(passthroughImporter);
    expect(registry.register(passthroughImporter)).toMatchObject({
      ok: false,
      error: { kind: "duplicate-id", id: "vendor.json-importer" },
    });
    expect(registry.unregister("vendor.json-importer").ok).toBe(true);
    expect(registry.unregister("vendor.json-importer")).toMatchObject({ ok: false, error: { kind: "not-found" } });
    expect(registry.size).toBe(0);
  });
});

describe("ExporterRegistry", () => {
  it("registers, queries by id and format, and lists formats", () => {
    const registry = new ExporterRegistry();
    registry.register(passthroughExporter);
    expect(registry.requireFormat("json")).toMatchObject({ ok: true, value: { id: "vendor.json-exporter" } });
    expect(registry.formats()).toEqual(["json"]);
    expect(registry.requireFormat("yaml")).toMatchObject({
      ok: false,
      error: { kind: "not-found" },
    });
  });

  it("detects duplicate ids instead of overwriting", () => {
    const registry = new ExporterRegistry();
    registry.register(passthroughExporter);
    expect(registry.register(passthroughExporter)).toMatchObject({
      ok: false,
      error: { kind: "duplicate-id" },
    });
    expect(registry.size).toBe(1);
  });
});

describe("NoderaDomain composition", () => {
  it("composes importer and exporter registries in the facade", async () => {
    const { NoderaDomain } = await import("./domain-facade.js");
    const domain = new NoderaDomain();
    domain.importers.register(passthroughImporter);
    domain.exporters.register(passthroughExporter);

    const imported = domain.importers.requireFormat("json");
    const exported = domain.exporters.requireFormat("json");
    expect(imported.ok && exported.ok).toBe(true);
    if (!imported.ok || !exported.ok) return;

    const roundTrip = imported.value.importContent('{"a":1}');
    expect(roundTrip).toEqual({ ok: true, value: { raw: '{"a":1}' } });
    expect(exported.value.exportContent({ a: 1 })).toEqual({ ok: true, value: '{"a":1}' });
  });
});
