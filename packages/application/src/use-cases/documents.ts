/**
 * Document use cases: ImportDocument, ExportDocument, MigrateDocument.
 *
 * They wrap the phase-2 document/serialization assets without reimplementing
 * anything: parse → normalize → migrate → documentToGraph on import, and
 * graphToDocument → serialize on export. Failures are structured issues,
 * never thrown for data problems; the current graph is never touched when an
 * import fails.
 */

import { err, ok, type Result } from "@nodera/contracts";
import { Graph } from "@nodera/graph-model";
import {
  documentToGraph,
  documentVersionMigrator,
  graphToDocument,
  type DocumentMigration,
  type GraphDocument,
} from "@nodera/document";
import { parseJsonDocument, serializeJson } from "@nodera/serialization-json";
import { parseYamlDocument, serializeYaml } from "@nodera/serialization-yaml";
import type { ValidationIssue } from "@nodera/contracts";
import type { EditorEngine } from "../editor-engine.js";
import { emitChanged, type UseCaseError } from "./errors.js";

export type DocumentFormat = "json" | "yaml";

export interface ImportDocumentInput {
  readonly raw: string;
  readonly format: DocumentFormat;
  /** Optional migration table applied before rebuilding the graph. */
  readonly migrations?: readonly DocumentMigration[];
  /** Target version for the optional migration step. */
  readonly targetVersion?: string;
}

/** Imports a portable document and loads it as the new editing target. */
export function importDocument(
  editor: EditorEngine,
  input: ImportDocumentInput,
): Result<Graph, readonly ValidationIssue[]> {
  let document: GraphDocument;
  if (input.migrations !== undefined && input.targetVersion !== undefined) {
    const migrated = migrateDocument(input.raw, {
      format: input.format,
      migrations: input.migrations,
      targetVersion: input.targetVersion,
    });
    if (!migrated.ok) {
      return err(migrated.error);
    }
    document = migrated.value;
  } else {
    const parsed = parseDocument(input.raw, input.format);
    if (!parsed.ok) {
      return err(parsed.error);
    }
    document = parsed.value;
  }
  const rebuilt = documentToGraph(document);
  if (!rebuilt.ok) {
    return err(rebuilt.error);
  }
  editor.replaceGraph(rebuilt.value);
  editor.history.clear();
  editor.events.emit({
    name: "graph.loaded",
    payload: { graphId: rebuilt.value.id },
  });
  return ok(rebuilt.value);
}

export interface ExportDocumentInput {
  readonly format: DocumentFormat;
  /** Document format version to stamp; defaults to the document default. */
  readonly formatVersion?: string;
}

/** Exports the current graph as a portable document in the given format. */
export function exportDocument(
  editor: EditorEngine,
  input: ExportDocumentInput,
): Result<string, readonly ValidationIssue[]> {
  const exportOptions: { formatVersion?: string } = {};
  if (input.formatVersion !== undefined) {
    exportOptions.formatVersion = input.formatVersion;
  }
  const graphDocument = graphToDocument(editor.graph, exportOptions);
  const serialized = serializeDocument(graphDocument, input.format);
  if (!serialized.ok) {
    return err(serialized.error);
  }
  editor.events.emit({
    name: "graph.exported",
    payload: { graphId: editor.graph.id, format: input.format },
  });
  return ok(serialized.value);
}

export interface MigrateDocumentInput {
  readonly format: DocumentFormat;
  readonly migrations: readonly DocumentMigration[];
  readonly targetVersion: string;
}

/** Migrates a raw document to the target version through the phase-2 migrator. */
export function migrateDocument(
  raw: string,
  input: MigrateDocumentInput,
): Result<GraphDocument, readonly ValidationIssue[]> {
  const parsed = parseDocument(raw, input.format);
  if (!parsed.ok) {
    return err(parsed.error);
  }
  const migrator = documentVersionMigrator(input.targetVersion, input.migrations);
  return migrator.migrate(parsed.value);
}

function parseDocument(
  raw: string,
  format: DocumentFormat,
): Result<GraphDocument, readonly ValidationIssue[]> {
  if (format === "json") {
    return parseJsonDocument(raw);
  }
  if (format === "yaml") {
    return parseYamlDocument(raw);
  }
  return err([
    {
      code: "application.unsupported-format",
      severity: "error",
      message: `Unsupported document format "${String(format)}"`,
    },
  ]);
}

function serializeDocument(
  document: GraphDocument,
  format: DocumentFormat,
): Result<string, readonly ValidationIssue[]> {
  if (format === "json") {
    return serializeJson(document);
  }
  if (format === "yaml") {
    return serializeYaml(document);
  }
  return err([
    {
      code: "application.unsupported-format",
      severity: "error",
      message: `Unsupported document format "${String(format)}"`,
    },
  ]);
}
