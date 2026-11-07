import {
  err,
  isValidSemver,
  type Result,
  type ValidationIssue,
} from "@nodera/contracts";
import { findDocumentIssues, normalizeGraphDocument } from "./normalize.js";
import type { GraphDocument } from "./types.js";

/** Migration payload: the raw document object between format versions. */
export type RawDocument = Record<string, unknown>;

/**
 * An explicit, registered transformation between two document format
 * versions. Migrations are pure data transformations: they never execute
 * code from the document and never depend on framework state.
 */
export interface DocumentMigration {
  /** Stable migration identifier, e.g. `vendor.feature.v1`. */
  readonly id: string;
  /** Version the migration reads. */
  readonly from: string;
  /** Version the migration writes. */
  readonly to: string;
  /** Pure transform from the raw document at `from` to the shape at `to`. */
  readonly migrate: (document: RawDocument) => RawDocument;
}

/** Migration outcome: the migrated document, or `document.*` diagnostics. */
export type MigrationResult = Result<GraphDocument, readonly ValidationIssue[]>;

function issue(
  code: string,
  message: string,
  metadata?: Readonly<Record<string, unknown>>,
): ValidationIssue {
  return { code, severity: "error", message, metadata };
}

/** Migrations are identified by their from-version endpoints. */
function nextMigration(migrations: readonly DocumentMigration[], from: string): DocumentMigration | undefined {
  return migrations.filter((migration) => migration.from === from)[0];
}

function hopMessage(from: string, target: string): string {
  return `No registered migration takes document version ${from} to ${target}`;
}

/**
 * Runs registered migrations step by step until the document reaches the
 * target format version.
 *
 * Docs already at the target pass through untouched. Versions with no path
 * are rejected with `document.unsupported-version` and the source document
 * is never rewritten or downgraded silently: data is always preserved for
 * the caller to decide.
 */
export function documentVersionMigrator(
  targetVersion: string,
  migrations: readonly DocumentMigration[],
): { readonly migrate: (document: unknown) => MigrationResult } {
  // Conflicting migration tables are programming errors, not document data:
  // they are rejected eagerly instead of misbehaving at runtime.
  const sourceVersions = new Set<string>();
  for (const migration of migrations) {
    if (migration.from === migration.to) {
      throw new RangeError(
        `Migration "${migration.id}" must change the document version (from equals to "${migration.from}")`,
      );
    }
    if (sourceVersions.has(migration.from)) {
      throw new RangeError(
        `Two migrations declare the same source version "${migration.from}"`,
      );
    }
    sourceVersions.add(migration.from);
  }
  return {
    migrate(document: unknown): MigrationResult {
      const issues = findDocumentIssues(document);
      if (issues.length > 0 || typeof document !== "object" || document === null) {
        return err(issues);
      }
      let current: RawDocument = { ...(document as RawDocument) };
      if (current["version"] === targetVersion) {
        return normalizeGraphDocument(current);
      }
      let guard = 0;
      while (current["version"] !== targetVersion) {
        guard += 1;
        if (guard > 1000) {
          return err([
            issue(
              "document.unsupported-version",
              `Document version ${String(current["version"])} cannot reach ${targetVersion}: migration chain does not terminate`,
              { from: current["version"], target: targetVersion },
            ),
          ]);
        }
        const from = current["version"];
        if (typeof from !== "string") {
          return err([issue("document.invalid-version", "Document version must be a string", { from })]);
        }
        const migration = nextMigration(migrations, from);
        if (migration === undefined) {
          return err([
            issue(
              "document.unsupported-version",
              hopMessage(from, targetVersion),
              { from, target: targetVersion },
            ),
          ]);
        }
        let migrated: RawDocument;
        try {
          migrated = migration.migrate(current);
        } catch (error) {
          return err([
            issue(
              "document.migration-failed",
              error instanceof Error ? error.message : `Migration "${migration.id}" failed`,
              { migrationId: migration.id, from, to: migration.to },
            ),
          ]);
        }
        const normalized = findDocumentIssues(migrated);
        if (normalized.length > 0) {
          return err(normalized);
        }
        // The migrator owns the format-version stamp: migrations declare their
        // destination, and the document always carries it explicitly.
        current = { ...migrated, version: migration.to };
      }
      return normalizeGraphDocument(current);
    },
  };
}
