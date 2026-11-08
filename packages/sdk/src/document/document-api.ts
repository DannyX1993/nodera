/**
 * The SDK Document API: the portable document surface of the builder.
 *
 * It is a thin facade over Phase 2: `graphToDocument` for creation,
 * `normalizeGraphDocument`/`documentToGraph` for import, the JSON and YAML
 * serializers for text, and `validateGraphDocument` for structural checks. No
 * document rule is reimplemented here, and no document problem is thrown: every
 * failure is a `Result` carrying `sdk.document-invalid` issues that keep the
 * originating `document.*`/`parse.*` code in `metadata.domainCode`.
 *
 * `create()` reflects the live editor graph and carries the data the domain
 * cannot model (unknown document, graph, node and edge fields) from the last
 * imported document, so importing and re-exporting a vendor document stays
 * lossless. `import` is the only mutating call: it loads the rebuilt graph as
 * the editing target through the load use case. `serialize`, `deserialize`,
 * `export` and `validate` never touch the editing session.
 *
 * `export` and `serialize` announce their success with the application
 * `graph.exported` event, using the payload `exportDocument` documents
 * (`{ graphId, format }`). It is emitted here rather than by delegating to that
 * use case because the use case rebuilds the document from the graph, which
 * would drop the carried vendor data this facade preserves.
 */

import { err, ok, type Result, type ValidationIssue } from "@nodera/contracts";
import {
  documentToGraph,
  graphToDocument,
  normalizeGraphDocument,
  validateGraphDocument,
  type DocumentGraphSettings,
  type DocumentValidationReport,
  type GraphDocument,
} from "@nodera/document";
import type { Graph } from "@nodera/graph-model";
import { loadGraph, type EditorEngine } from "@nodera/application";
import { parseJsonDocument, serializeJson } from "@nodera/serialization-json";
import { parseYamlDocument, serializeYaml } from "@nodera/serialization-yaml";
import type { BuilderDocumentFormat } from "../builder/configuration.js";
import {
  disposedIssue,
  sdkError,
  type SdkIssue,
  type SdkIssues,
} from "../errors.js";

/** Text formats a portable document can be serialized to. */
export type BuilderDocumentFormatName = "json" | "yaml";

/**
 * The FASE6 serializer contract as an object: one format bound to its
 * serialize and deserialize operations.
 */
export interface BuilderDocumentSerializer {
  readonly serialize: (document: GraphDocument) => Result<string, SdkIssues>;
  readonly deserialize: (content: string) => Result<Graph, SdkIssues>;
}

/** The document surface of the builder. */
export interface BuilderDocumentApi {
  /** Builds the portable document of the live editor graph. */
  create(): GraphDocument;
  /** Normalizes, validates and loads a raw document as the editing target. */
  import(input: unknown): Result<Graph, SdkIssues>;
  /** Text of the live document in the given format. */
  export(format: BuilderDocumentFormatName): Result<string, SdkIssues>;
  /** Text of the live document in the given format. */
  serialize(format: BuilderDocumentFormatName): Result<string, SdkIssues>;
  /** Parses text back into a graph; the editing target is left untouched. */
  deserialize(
    format: BuilderDocumentFormatName,
    content: string,
  ): Result<Graph, SdkIssues>;
  /** Validates the structure of a raw document object. */
  validate(input: unknown): DocumentValidationReport;
  /** The same operations bound to one format, as a serializer object. */
  serializer(format: BuilderDocumentFormatName): BuilderDocumentSerializer;
}

/** Issue for a format name the SDK does not implement. */
function unsupportedFormatIssue(format: BuilderDocumentFormatName): SdkIssue {
  return {
    ...sdkError(
      "sdk.unsupported-format",
      `Document format "${String(format)}" is not supported; use "json" or "yaml"`,
      { metadata: { value: format } },
    ),
    severity: "error",
  };
}

function formatIssues(format: BuilderDocumentFormatName): SdkIssues | undefined {
  return format === "json" || format === "yaml"
    ? undefined
    : [unsupportedFormatIssue(format)];
}

/**
 * Maps document diagnostics into SDK issues, keeping the originating code so
 * the host can tell a parse failure from a structural one.
 */
function documentIssues(issues: readonly ValidationIssue[]): SdkIssues {
  return issues.map((issue) => {
    const metadata: Record<string, unknown> = { domainCode: issue.code };
    if (issue.elementId !== undefined) {
      metadata["elementId"] = issue.elementId;
    }
    return {
      code: "sdk.document-invalid",
      severity: issue.severity === "error" ? "error" : "warning",
      message: issue.message,
      ...(issue.propertyPath === undefined ? {} : { path: issue.propertyPath }),
      metadata,
    };
  });
}

/**
 * Serializes one document, refusing a format the SDK does not implement.
 *
 * Emitting belongs to the live-document operations, not to this helper: a
 * serializer object built for one format is a pure string conversion.
 */
function serializeDocument(
  document: GraphDocument,
  format: BuilderDocumentFormatName,
): Result<string, SdkIssues> {
  const issues = formatIssues(format);
  if (issues !== undefined) {
    return err(issues);
  }
  const serialized = format === "json" ? serializeJson(document) : serializeYaml(document);
  return serialized.ok ? ok(serialized.value) : err(documentIssues(serialized.error));
}

/** Parses text into a normalized document, refusing an unknown format. */
function parseDocument(
  content: string,
  format: BuilderDocumentFormatName,
): Result<GraphDocument, SdkIssues> {
  const issues = formatIssues(format);
  if (issues !== undefined) {
    return err(issues);
  }
  const parsed = format === "json" ? parseJsonDocument(content) : parseYamlDocument(content);
  return parsed.ok ? ok(parsed.value) : err(documentIssues(parsed.error));
}

/** An instance the live document and the imported document may share. */
interface IdentifiedInstance {
  readonly id: string;
}

/**
 * Merges the live instances with the imported ones by id, so fields the
 * domain does not model survive a round trip while the live values win.
 */
function mergeInstances<TInstance extends IdentifiedInstance>(
  carried: readonly TInstance[],
  live: readonly TInstance[],
): readonly TInstance[] {
  const byId = new Map(carried.map((instance) => [instance.id, instance]));
  return live.map((instance) => {
    const previous = byId.get(instance.id);
    return previous === undefined ? instance : { ...previous, ...instance };
  });
}

/**
 * Merges a live document over the imported one it derives from.
 *
 * Known fields always come from the live graph; unknown fields of the imported
 * document survive at document, metadata, graph, node and edge level, so data
 * the domain cannot represent is never silently dropped.
 */
function mergeDocuments(carried: GraphDocument, live: GraphDocument): GraphDocument {
  const carriedGraph = carried.graph;
  const carriedSettings = carriedGraph.settings;
  const liveSettings = live.graph.settings;
  const settings: DocumentGraphSettings | undefined =
    liveSettings === undefined
      ? carriedSettings
      : { ...carriedSettings, ...liveSettings };
  return {
    ...carried,
    ...live,
    metadata: { ...carried.metadata, ...live.metadata },
    graph: {
      ...carriedGraph,
      ...live.graph,
      ...(settings === undefined ? {} : { settings }),
      nodes: mergeInstances(carriedGraph.nodes, live.graph.nodes),
      edges: mergeInstances(carriedGraph.edges ?? [], live.graph.edges ?? []),
    },
  };
}

/** Issue for a graph the import rebuilt but could not load. */
function loadIssue(error: { readonly kind: string; readonly message: string }): SdkIssue {
  return {
    ...sdkError("sdk.document-invalid", error.message, {
      metadata: { useCaseCode: error.kind },
    }),
    severity: "error",
  };
}

/**
 * Flattens the document package's `Result<Graph, MappingIssues>` into the SDK's
 * single-level `Result<Graph, SdkIssues>`.
 */
function importGraph(document: GraphDocument): Result<Graph, SdkIssues> {
  const rebuilt = documentToGraph(document);
  return rebuilt.ok ? ok(rebuilt.value) : err(documentIssues(rebuilt.error));
}

/**
 * Builds the document facade of a builder over its editing session.
 *
 * The builder's configured format version is stamped on every document the
 * API produces, so a host exports exactly the contract version it declared.
 * `isDisposed` is the builder's lifecycle flag: `import` is the only mutating
 * call, so it is the only one disposal closes — creating, exporting,
 * serializing, deserializing and validating documents keep working, because
 * they observe state the host already received.
 */
export function createDocumentApi(
  editor: EditorEngine,
  format: BuilderDocumentFormat,
  isDisposed: () => boolean,
): BuilderDocumentApi {
  let carried: GraphDocument | undefined;

  function create(): GraphDocument {
    const live = graphToDocument(editor.graph, { formatVersion: format.version });
    return carried === undefined ? live : mergeDocuments(carried, live);
  }

  /**
   * Rebuilds a graph from serialized content.
   *
   * The SDK boundary exposes exactly one `Result` level: the document package's
   * nested `Result<Graph, MappingIssues>` is flattened here, with every mapping
   * issue published as an `sdk.document-invalid` diagnostic.
   */
  function deserialize(
    name: BuilderDocumentFormatName,
    content: string,
  ): Result<Graph, SdkIssues> {
    const parsed = parseDocument(content, name);
    if (!parsed.ok) {
      return err(parsed.error);
    }
    return importGraph(parsed.value);
  }

  /**
   * Serializes the live document and announces the export.
   *
   * The event is emitted only after a successful serialization and carries the
   * same payload the application export use case documents, so a host sees one
   * `graph.exported` per exported document regardless of which layer serialized.
   */
  function exportLive(name: BuilderDocumentFormatName): Result<string, SdkIssues> {
    const serialized = serializeDocument(create(), name);
    if (serialized.ok) {
      editor.events.emit({
        name: "graph.exported",
        payload: { graphId: editor.graph.id, format: name },
      });
    }
    return serialized;
  }

  return {
    create,

    import(input: unknown): Result<Graph, SdkIssues> {
      if (isDisposed()) {
        return err([disposedIssue("document.import")]);
      }
      const normalized = normalizeGraphDocument(input);
      if (!normalized.ok) {
        return err(documentIssues(normalized.error));
      }
      const rebuilt = importGraph(normalized.value);
      if (!rebuilt.ok) {
        return rebuilt;
      }
      const loaded = loadGraph(editor, { graph: rebuilt.value });
      if (!loaded.ok) {
        return err([loadIssue(loaded.error)]);
      }
      carried = normalized.value;
      return ok(rebuilt.value);
    },

    export(name: BuilderDocumentFormatName): Result<string, SdkIssues> {
      return exportLive(name);
    },

    serialize(name: BuilderDocumentFormatName): Result<string, SdkIssues> {
      return exportLive(name);
    },

    deserialize,

    validate(input: unknown): DocumentValidationReport {
      return validateGraphDocument(input);
    },

    serializer(name: BuilderDocumentFormatName): BuilderDocumentSerializer {
      return {
        serialize: (document) => serializeDocument(document, name),
        deserialize: (content) => deserialize(name, content),
      };
    },
  };
}
