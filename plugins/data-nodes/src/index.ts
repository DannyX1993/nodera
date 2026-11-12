/**
 * `example.data-nodes` — the plugin facet of declarative data and code checks.
 *
 * It contributes three different things, which is what makes it a useful
 * example of the surface behind "nuevos tipos de propiedades, validadores e
 * importadores" (S2):
 *
 * - two property definitions, registered on the builder rather than inside a
 *   node definition, so any node may declare them;
 * - one graph validator — code, not data — that joins the registry the editing
 *   session validates with;
 * - one importer, contributed as a new document format the host can read.
 *
 * The manifest declares exactly those four contributions, with the same kinds
 * and ids (D2, D13).
 */

import type {
  BuilderPluginApi,
  PluginDefinition,
  PluginManifest,
  PropertyInput,
  SdkIssues,
  ValidationIssue,
} from "@nodera/sdk";

/* ------------------------------------------------------------------ */
/*  Stable identifiers                                                 */
/* ------------------------------------------------------------------ */

/** Globally qualified id of the plugin itself. */
export const DATA_NODES_PLUGIN_ID = "example.data-nodes";

/** Property naming the source field of a mapping. */
export const SOURCE_PROPERTY_ID = "example.data.source";

/** Property naming the target field of a mapping. */
export const TARGET_PROPERTY_ID = "example.data.target";

/** Id of the graph validator the plugin contributes. */
export const DATA_VALIDATOR_ID = "example.data.validator";

/** Id of the importer the plugin contributes. */
export const JSON_LINES_IMPORTER_ID = "example.data.importer";

/** Format id the importer reads: one JSON value per line. */
export const JSON_LINES_FORMAT = "json-lines";

/* ------------------------------------------------------------------ */
/*  Contributions                                                      */
/* ------------------------------------------------------------------ */

/**
 * Property definitions the plugin contributes on their own.
 *
 * They are declared without a renderer, so every host keeps its own property
 * renderers and the plugin stays presentation-agnostic (AGENTS.md §5.2).
 */
export const DATA_PROPERTIES: readonly PropertyInput[] = [
  {
    id: SOURCE_PROPERTY_ID,
    type: "string",
    label: "Source field",
    description: "Field of the incoming record the mapping reads.",
    required: true,
  },
  {
    id: TARGET_PROPERTY_ID,
    type: "string",
    label: "Target field",
    description: "Field of the outgoing record the mapping writes.",
    required: true,
  },
];

/** Graph validator contract, derived from the public contribution surface. */
type GraphValidator = Parameters<BuilderPluginApi["validators"]["register"]>[0];

/** Importer contract, derived from the public contribution surface. */
type Importer = Parameters<BuilderPluginApi["importers"]["register"]>[0];

/**
 * Validator that keeps a mapping honest: a node reading a source field must
 * name the target field it writes.
 *
 * The rule is domain-level and reads only the graph it receives, so it runs
 * without a UI, without the editor state and without the framework.
 */
export const dataValidator: GraphValidator = {
  id: DATA_VALIDATOR_ID,
  level: "domain",
  validate({ graph }) {
    const issues: ValidationIssue[] = [];
    for (const node of graph.getNodes()) {
      const properties = node.getProperties();
      const source = properties[SOURCE_PROPERTY_ID];
      const target = properties[TARGET_PROPERTY_ID];
      const writesNothing = typeof target !== "string" || target.trim().length === 0;
      if (typeof source === "string" && source.trim().length > 0 && writesNothing) {
        issues.push({
          code: "example.data.target-missing",
          severity: "error",
          message: `Node "${node.id}" maps "${source}" but declares no target field`,
          elementId: node.id,
          propertyPath: [TARGET_PROPERTY_ID],
        });
      }
    }
    return issues;
  },
};

/**
 * Importer for newline-delimited JSON.
 *
 * Raw content is untrusted input, so it is parsed line by line and a malformed
 * line becomes a structured `parse-failed` diagnostic instead of an exception
 * (AGENTS.md §16). Blank lines are ignored, which keeps a trailing newline
 * harmless.
 */
export const jsonLinesImporter: Importer = {
  id: JSON_LINES_IMPORTER_ID,
  format: JSON_LINES_FORMAT,
  version: "1.0.0",
  importContent(raw) {
    const records: unknown[] = [];
    for (const [index, line] of raw.split("\n").entries()) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        records.push(JSON.parse(trimmed));
      } catch {
        return {
          ok: false,
          error: {
            kind: "parse-failed",
            message: `Line ${index + 1} is not valid JSON`,
          },
        };
      }
    }
    return { ok: true, value: { records } };
  },
};

/* ------------------------------------------------------------------ */
/*  Manifest                                                           */
/* ------------------------------------------------------------------ */

/** Declarative contract of the plugin (S3, S8). */
export const DATA_NODES_MANIFEST: PluginManifest = {
  id: DATA_NODES_PLUGIN_ID,
  name: "Example data nodes",
  version: "1.0.0",
  description:
    "Two property definitions, a graph validator and a newline-delimited JSON importer.",
  author: { name: "Nodera examples" },
  compatibility: {
    sdkVersion: "^1.0.0",
    documentFormat: "ggd",
    documentVersion: "1.0.0",
  },
  contributions: [
    { type: "property", id: SOURCE_PROPERTY_ID },
    { type: "property", id: TARGET_PROPERTY_ID },
    { type: "validator", id: DATA_VALIDATOR_ID },
    { type: "importer", id: JSON_LINES_IMPORTER_ID, version: "1.0.0" },
  ],
};

/* ------------------------------------------------------------------ */
/*  Activation                                                         */
/* ------------------------------------------------------------------ */

/** Outcome of one contribution: the SDK's one error shape, nothing more. */
type ContributionOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: SdkIssues };

/**
 * Fails the activation when one contribution was rejected.
 *
 * `activate` cannot return diagnostics, so a throw is the only channel a plugin
 * has; the SDK turns it into `sdk.plugin-invalid` and the installation fails
 * closed.
 */
function assertRegistered(
  pluginId: string,
  label: string,
  outcome: ContributionOutcome,
): void {
  if (outcome.ok) return;
  const details = outcome.error
    .map((issue) => `${issue.code}: ${issue.message}`)
    .join("; ");
  throw new Error(`${pluginId} could not register its ${label}: ${details}`);
}

/** The plugin: property definitions, a validator and an importer. */
export const dataNodesPlugin: PluginDefinition<BuilderPluginApi> = {
  manifest: DATA_NODES_MANIFEST,
  activate({ api }) {
    for (const property of DATA_PROPERTIES) {
      assertRegistered(
        DATA_NODES_PLUGIN_ID,
        `property "${property.id}"`,
        api.properties.register(property),
      );
    }
    assertRegistered(
      DATA_NODES_PLUGIN_ID,
      "validator",
      api.validators.register(dataValidator),
    );
    assertRegistered(
      DATA_NODES_PLUGIN_ID,
      "importer",
      api.importers.register(jsonLinesImporter),
    );
  },
};
