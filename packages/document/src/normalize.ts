import {
  err,
  isValidSemver,
  ok,
  type Result,
  type ValidationIssue,
} from "@nodera/contracts";
import type { PortDirection } from "@nodera/graph-model";
import { GGD_FORMAT, type DocumentMetadata, type GraphDocument } from "./types.js";

const PORT_DIRECTIONS: readonly PortDirection[] = ["input", "output", "bidirectional"];
type Policy = "allow" | "forbid";
const POLICIES: readonly Policy[] = ["allow", "forbid"];

/** Issues found while structurally normalizing a document. */
export type DocumentIssues = readonly ValidationIssue[];

/** Checks a value is a plain, non-array object. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Scans a value tree for entries a portable document must never carry:
 * functions, symbols or other non-serializable inhabitants.
 */
function containsNonPortableValue(value: unknown, seen = new Set<unknown>()): boolean {
  if (typeof value === "function" || typeof value === "symbol") {
    return true;
  }
  if (!isPlainRecord(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  return Object.values(value).some((entry) => containsNonPortableValue(entry, seen));
}

function issue(
  code: string,
  message: string,
  propertyPath: readonly string[],
  elementId?: string,
): ValidationIssue {
  return { code, severity: "error", message, propertyPath, elementId };
}

/** Validates one node instance and reports diagnostics without mutating it. */
function validateNode(node: Record<string, unknown>, issues: ValidationIssue[]): void {
  const id = typeof node["id"] === "string" ? node["id"] : undefined;
  if (id === undefined || id === "" || typeof node["type"] !== "string") {
    issues.push(
      issue(
        "document.invalid-node",
        'Every node instance requires a string "id" and a string "type" referencing its node definition',
        ["graph", "nodes"],
        id,
      ),
    );
  }
  const version = node["version"];
  if (version !== undefined && !isValidSemver(version)) {
    issues.push(
      issue(
        "document.invalid-node-version",
        `Node "${id ?? "?"}" declares a version that is not a semantic version`,
        ["graph", "nodes"],
        id,
      ),
    );
  }
  const position = node["position"];
  if (
    position !== undefined &&
    (!isPlainRecord(position) ||
      typeof position["x"] !== "number" ||
      typeof position["y"] !== "number")
  ) {
    issues.push(
      issue(
        "document.invalid-position",
        `Node "${id ?? "?"}" position must be an object with numeric "x" and "y"`,
        ["graph", "nodes"],
        id,
      ),
    );
  }
  for (const key of ["properties", "metadata"] as const) {
    const value = node[key];
    if (value === undefined) {
      continue;
    }
    if (!isPlainRecord(value)) {
      issues.push(
        issue(
          `document.invalid-node-${key}`,
          `Node "${id ?? "?"}" ${key} must be an object`,
          ["graph", "nodes"],
          id,
        ),
      );
    } else if (containsNonPortableValue(value)) {
      issues.push(
        issue(
          "document.non-portable-value",
          `Node "${id ?? "?"}" ${key} contain a non-portable value (functions and symbols are not serializable)`,
          ["graph", "nodes"],
          id,
        ),
      );
    }
  }
  const ports = node["ports"];
  if (ports === undefined) {
    return;
  }
  if (!Array.isArray(ports)) {
    issues.push(
      issue("document.invalid-ports", `Node "${id ?? "?"}" ports must be an array`, ["graph", "nodes"], id),
    );
    return;
  }
  for (const port of ports) {
    if (
      !isPlainRecord(port) ||
      typeof port["id"] !== "string" ||
      !PORT_DIRECTIONS.includes(port["direction"] as PortDirection)
    ) {
      issues.push(
        issue(
          "document.invalid-port",
          `Node "${id ?? "?"}" ports require an "id" and a direction of input, output or bidirectional`,
          ["graph", "nodes"],
          id,
        ),
      );
    }
  }
}

function validateEdge(edge: Record<string, unknown>, issues: ValidationIssue[]): void {
  const id = typeof edge["id"] === "string" ? edge["id"] : undefined;
  if (id === undefined || id === "") {
    issues.push(
      issue("document.invalid-edge", 'Every edge requires a string "id"', ["graph", "edges"]),
    );
    return;
  }
  for (const key of ["source", "target"] as const) {
    const endpoint: unknown = edge[key];
    if (
      !isPlainRecord(endpoint) ||
      typeof endpoint["nodeId"] !== "string" ||
      typeof endpoint["portId"] !== "string"
    ) {
      issues.push(
        issue(
          "document.invalid-edge",
          `Edge "${id}" ${key} requires string "nodeId" and "portId" references`,
          ["graph", "edges"],
          id,
        ),
      );
    } else if (
      endpoint["direction"] !== undefined &&
      !PORT_DIRECTIONS.includes(endpoint["direction"] as PortDirection)
    ) {
      issues.push(
        issue(
          "document.invalid-endpoint-direction",
          `Edge "${id}" ${key} direction must be input, output or bidirectional`,
          ["graph", "edges"],
          id,
        ),
      );
    }
  }
}

/**
 * Validates the structural shape of a raw document object and reports every
 * violation. Structural document validity is independent of domain rules.
 */
export function findDocumentIssues(raw: unknown): DocumentIssues {
  const issues: ValidationIssue[] = [];
  if (!isPlainRecord(raw)) {
    return [issue("document.malformed-document", "A document must be a JSON object", [])];
  }
  if (raw["format"] !== GGD_FORMAT) {
    issues.push(
      issue("document.invalid-format", `A document requires format "${GGD_FORMAT}"`, ["format"]),
    );
  }
  if (!isValidSemver(raw["version"])) {
    issues.push(
      issue(
        "document.invalid-version",
        "A document requires an explicit semantic version",
        ["version"],
      ),
    );
  }
  const metadata = raw["metadata"];
  const metadataId = isPlainRecord(metadata) ? metadata["id"] : undefined;
  if (typeof metadataId !== "string" || metadataId === "") {
    issues.push(
      issue("document.missing-metadata-id", 'A document requires a string "metadata.id"', ["metadata", "id"]),
    );
  }
  if (isPlainRecord(metadata)) {
    const extra = metadata["extra"];
    if (extra !== undefined && (!isPlainRecord(extra) || containsNonPortableValue(extra))) {
      issues.push(
        issue(
          "document.invalid-metadata-extra",
          'Document "metadata.extra" must be an object of serializable values',
          ["metadata", "extra"],
        ),
      );
    }
  }
  const extensions = raw["extensions"];
  if (extensions !== undefined) {
    if (!Array.isArray(extensions)) {
      issues.push(
        issue("document.invalid-extensions", '"extensions" must be an array', ["extensions"]),
      );
    } else {
      for (const extension of extensions) {
        if (
          !isPlainRecord(extension) ||
          typeof extension["id"] !== "string" ||
          !isValidSemver(extension["version"])
        ) {
          issues.push(
            issue(
              "document.invalid-extension",
              'Every extension reference requires an "id" and a semantic "version"',
              ["extensions"],
            ),
          );
        }
      }
    }
  }
  const graph = raw["graph"];
  if (!isPlainRecord(graph) || !Array.isArray(graph["nodes"])) {
    issues.push(
      issue("document.missing-graph-nodes", 'A document requires "graph.nodes" as an array', ["graph", "nodes"]),
    );
    return issues;
  }
  const settings = graph["settings"];
  if (
    settings !== undefined &&
    (!isPlainRecord(settings) ||
      !POLICIES.includes(settings["selfLoops"] as Policy) ||
      !POLICIES.includes(settings["multiEdges"] as Policy) ||
      !POLICIES.includes(settings["cycles"] as Policy))
  ) {
    issues.push(
      issue(
        "document.invalid-settings",
        '"graph.settings" requires selfLoops, multiEdges and cycles set to allow or forbid',
        ["graph", "settings"],
      ),
    );
  }
  for (const node of graph["nodes"]) {
    if (isPlainRecord(node)) {
      validateNode(node, issues);
    } else {
      issues.push(
        issue("document.invalid-node", "Every node must be an object", ["graph", "nodes"]),
      );
    }
  }
  const edges = graph["edges"];
  if (edges !== undefined) {
    if (!Array.isArray(edges)) {
      issues.push(
        issue("document.invalid-edges", '"graph.edges" must be an array', ["graph", "edges"]),
      );
    } else {
      for (const edge of edges) {
        if (isPlainRecord(edge)) {
          validateEdge(edge, issues);
        } else {
          issues.push(
            issue("document.invalid-edge", "Every edge must be an object", ["graph", "edges"]),
          );
        }
      }
    }
  }
  const groups = graph["groups"];
  if (groups !== undefined) {
    if (!Array.isArray(groups)) {
      issues.push(
        issue("document.invalid-groups", '"graph.groups" must be an array', ["graph", "groups"]),
      );
    } else {
      for (const group of groups) {
        if (!isPlainRecord(group)) {
          issues.push(
            issue("document.invalid-group", "Every group must be an object", ["graph", "groups"]),
          );
        }
      }
    }
  }
  return issues;
}

/**
 * Normalizes a raw document object into a {@link GraphDocument}: validates
 * its structural shape, fills defaulted arrays (`extensions`, `graph.edges`,
 * `graph.groups`) and preserves every unknown field for lossless round-trips.
 *
 * The input is never mutated and invalid documents never become valid data.
 */
export function normalizeGraphDocument(
  raw: unknown,
): Result<GraphDocument, DocumentIssues> {
  const issues = findDocumentIssues(raw);
  if (issues.length > 0 || !isPlainRecord(raw)) {
    return err(issues);
  }
  const rawGraph = isPlainRecord(raw["graph"]) ? raw["graph"] : {};
  const rawMetadata = isPlainRecord(raw["metadata"]) ? raw["metadata"] : {};
  const document: GraphDocument = {
    ...raw,
    format: GGD_FORMAT,
    version: raw["version"] as string,
    metadata: { ...rawMetadata, id: rawMetadata["id"] as string } as DocumentMetadata,
    extensions: (Array.isArray(raw["extensions"]) ? raw["extensions"] : []) as GraphDocument["extensions"],
    graph: {
      ...rawGraph,
      nodes: rawGraph["nodes"] as GraphDocument["graph"]["nodes"],
      edges: (rawGraph["edges"] ?? []) as NonNullable<GraphDocument["graph"]["edges"]>,
      groups: (rawGraph["groups"] ?? []) as NonNullable<GraphDocument["graph"]["groups"]>,
    },
  };
  return ok(document);
}
