import { describe, expect, it } from "vitest";
import { DEFAULT_FORMAT_VERSION } from "./mapping.js";
import {
  documentVersionMigrator,
  type DocumentMigration,
} from "./versioning.js";

/** Builds a minimal valid document at a given format version. */
function documentAt(version: string): Record<string, unknown> {
  return {
    format: "ggd",
    version,
    metadata: { id: "graph-001" },
    graph: { nodes: [{ id: "n1", type: "t" }] },
  };
}

describe("documentVersionMigrator", () => {
  it("accepts documents already at the current format version without touching them", () => {
    const migrator = documentVersionMigrator(DEFAULT_FORMAT_VERSION, []);
    const result = migrator.migrate(
      documentAt(DEFAULT_FORMAT_VERSION),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected migration");
    expect(result.value.version).toBe(DEFAULT_FORMAT_VERSION);
  });

  it("runs registered migrations in order along the version chain", () => {
    const migrations: DocumentMigration[] = [
      {
        id: "rename-vendor-field.v1",
        from: "1.0.0",
        to: "1.1.0",
        migrate: (raw) => ({ ...raw, by: (raw as { by?: string })["by"] ?? "m1" }),
      },
      {
        id: "add-provenance.v1",
        from: "1.1.0",
        to: "1.2.0",
        migrate: (raw) => ({ ...raw, provenance: "m2" }),
      },
    ];
    const migrator = documentVersionMigrator("1.2.0", migrations);
    const result = migrator.migrate(documentAt("1.0.0"));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected migration");
    expect(result.value.version).toBe("1.2.0");
    expect((result.value as unknown as Record<string, unknown>)["by"]).toBe("m1");
    expect((result.value as unknown as Record<string, unknown>)["provenance"]).toBe("m2");
  });

  it("rejects versions with no migration path, preserving the document untouched", () => {
    const migrator = documentVersionMigrator("1.2.0", []);
    const source = documentAt("9.9.9");
    const result = migrator.migrate(source);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.unsupported-version")).toBe(true);
    expect(source).toEqual(documentAt("9.9.9"));
  });

  it("honors a direct migration that bridges intermediate versions to the target", () => {
    const migrations: DocumentMigration[] = [
      { id: "a", from: "1.0.0", to: "1.2.0", migrate: (raw) => ({ ...raw }) },
    ];
    const migrator = documentVersionMigrator("1.2.0", migrations);
    const result = migrator.migrate(documentAt("1.0.0"));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected migration");
    expect(result.value.version).toBe("1.2.0");
  });

  it("surfaces migration failures as document migration diagnostics", () => {
    const migrations: DocumentMigration[] = [
      {
        id: "broken",
        from: "1.0.0",
        to: "1.1.0",
        migrate: () => {
          throw new RangeError("cannot migrate broken field");
        },
      },
    ];
    const migrator = documentVersionMigrator("1.1.0", migrations);
    const result = migrator.migrate(documentAt("1.0.0"));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    const failed = result.error.find((issue) => issue.code === "document.migration-failed");
    expect(failed?.metadata).toMatchObject({ migrationId: "broken" });
  });

  it("validates the migrated shape after every step", () => {
    const migrations: DocumentMigration[] = [
      {
        id: "corrupts-format",
        from: "1.0.0",
        to: "1.1.0",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        migrate: (raw) => ({ ...raw, format: "not-ggd" } as unknown as Record<string, unknown>),
      },
    ];
    const migrator = documentVersionMigrator("1.1.0", migrations);
    const result = migrator.migrate(documentAt("1.0.0"));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.invalid-format")).toBe(true);
  });

  it("reports downgrades from a newer format as unsupported instead of rewriting data", () => {
    const migrator = documentVersionMigrator("1.0.0", []);
    const result = migrator.migrate(documentAt("2.0.0"));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.some((issue) => issue.code === "document.unsupported-version")).toBe(true);
  });
});

describe("migrator construction and output guarantees", () => {
  it("rejects a self-referential migration at construction time", () => {
    const migrations: DocumentMigration[] = [
      { id: "loop", from: "1.0.0", to: "1.0.0", migrate: (raw) => ({ ...raw }) },
    ];
    expect(() => documentVersionMigrator("1.1.0", migrations)).toThrow(RangeError);
  });

  it("rejects two migrations claiming the same source version at construction time", () => {
    const migrations: DocumentMigration[] = [
      { id: "a", from: "1.0.0", to: "1.1.0", migrate: (raw) => ({ ...raw }) },
      { id: "b", from: "1.0.0", to: "1.9.0", migrate: (raw) => ({ ...raw }) },
    ];
    expect(() => documentVersionMigrator("1.1.0", migrations)).toThrow(RangeError);
  });

  it("returns a fully normalized document: defaulted arrays are always present", () => {
    const migrations: DocumentMigration[] = [
      { id: "noop", from: "1.0.0", to: "1.1.0", migrate: (raw) => ({ ...raw }) },
    ];
    const migrator = documentVersionMigrator("1.1.0", migrations);
    const result = migrator.migrate({
      format: "ggd",
      version: "1.0.0",
      metadata: { id: "graph-001" },
      graph: { nodes: [{ id: "n1", type: "t" }] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected migration");
    expect(result.value.extensions).toEqual([]);
    expect(result.value.graph.groups).toEqual([]);
    expect(result.value.version).toBe("1.1.0");
  });
});
