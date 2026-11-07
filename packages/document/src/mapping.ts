import {
  createEdgeId,
  createGraphId,
  createNodeId,
  type EdgeId,
  type NodeId,
  type Result,
  type ValidationIssue,
} from "@nodera/contracts";
import {
  Connection,
  type ConnectionEndpoint,
  Edge,
  Graph,
  type GraphSettings,
  Node,
  type PortInstance,
} from "@nodera/graph-model";
import { GGD_FORMAT, type DocumentEdgeEndpoint, type DocumentMetadata, type DocumentEdgeInstance, type DocumentNodeInstance,
  type DocumentPortInstance, type GraphDocument } from "./types.js";

/** Default document format version emitted when none is requested. */
export const DEFAULT_FORMAT_VERSION = "1.0.0";

/** Options for exporting a graph into a portable document. */
export interface GraphToDocumentOptions {
  /** Document format version to stamp; defaults to {@link DEFAULT_FORMAT_VERSION}. */
  readonly formatVersion?: string;
}

/** Issues found while mapping between graphs and documents. */
export type MappingIssues = readonly ValidationIssue[];

function issue(
  code: string,
  message: string,
  elementId?: string,
): ValidationIssue {
  return { code, severity: "error", message, elementId };
}

const GRAPH_ERROR_CODE_BY_KIND: Record<string, string> = {
  "duplicate-node-id": "document.duplicate-node-id",
  "duplicate-edge-id": "document.duplicate-edge-id",
  "self-loop-forbidden": "document.self-loop-forbidden",
  "multi-edge-forbidden": "document.multi-edge-forbidden",
  "cycle-forbidden": "document.cycle-forbidden",
  "node-not-found": "document.edge-references-unknown-node",
  "edge-not-found": "document.edge-not-found",
};

/**
 * Exports a domain graph into a portable {@link GraphDocument}.
 *
 * The document contains only serializable data: identifiers, types,
 * properties, positions, ports, connections, settings and metadata. Nothing
 * is dropped silently: whatever the domain holds and the contract cannot
 * represent is preserved (e.g. groups stay empty until a grouping model
 * exists, and unknown host metadata stays in `metadata.extra`).
 */
export function graphToDocument(graph: Graph, options: GraphToDocumentOptions = {}): GraphDocument {
  const metadata = graphToDocumentMetadata(graph);
  return {
    format: GGD_FORMAT,
    version: options.formatVersion ?? DEFAULT_FORMAT_VERSION,
    metadata,
    extensions: [],
    graph: {
      nodes: graph.getNodes().map(nodeToDocumentNode),
      edges: graph.getEdges().map(edgeToDocumentEdge),
      groups: [],
      settings: { ...graph.settings },
    },
  };
}

function graphToDocumentMetadata(graph: Graph): DocumentMetadata {
  const source = graph.metadata;
  const metadata: {
    id: string;
    name?: string;
    description?: string;
    tags?: readonly string[];
    extra?: Readonly<Record<string, unknown>>;
  } = { id: graph.id };
  if (source.name !== undefined) metadata["name"] = source.name;
  if (source.description !== undefined) metadata["description"] = source.description;
  if (source.tags !== undefined) metadata["tags"] = source.tags;
  if (source.extra !== undefined) metadata["extra"] = source.extra;
  return metadata;
}

function nodeToDocumentNode(node: Node): DocumentNodeInstance {
  const payload: {
    id: string;
    type: string;
    version?: string;
    position?: { x: number; y: number };
    properties: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    ports: DocumentPortInstance[];
  } = {
    id: node.id,
    type: node.definitionId,
    properties: { ...node.getProperties() },
    ports: node.getPorts().map((port) => portToDocumentPort(port)),
  };
  if (node.definitionVersion !== undefined) {
    payload["version"] = node.definitionVersion;
  }
  if (node.position !== undefined) {
    payload["position"] = { x: node.position.x, y: node.position.y };
  }
  if (node.metadata !== undefined) {
    payload["metadata"] = { ...node.metadata };
  }
  return payload;
}

function portToDocumentPort(port: PortInstance): DocumentPortInstance {
  return port.declarationId === undefined
    ? { id: port.id, direction: port.direction }
    : { id: port.id, direction: port.direction, declarationId: port.declarationId };
}

function edgeToDocumentEdge(edge: Edge): DocumentEdgeInstance {
  const payload: {
    id: string;
    source: DocumentEdgeEndpoint;
    target: DocumentEdgeEndpoint;
    type?: string;
    label?: string;
    metadata?: Record<string, unknown>;
  } = {
    id: edge.id,
    source: endpointToDocumentEndpoint(edge.connection.source),
    target: endpointToDocumentEndpoint(edge.connection.target),
  };
  if (edge.definitionId !== undefined) {
    payload["type"] = edge.definitionId;
  }
  if (edge.label !== undefined) {
    payload["label"] = edge.label;
  }
  if (edge.metadata !== undefined) {
    payload["metadata"] = { ...edge.metadata };
  }
  return payload;
}

function endpointToDocumentEndpoint(endpoint: ConnectionEndpoint): DocumentEdgeEndpoint {
  return endpoint.direction === undefined
    ? { nodeId: endpoint.nodeId, portId: endpoint.portId }
    : { nodeId: endpoint.nodeId, portId: endpoint.portId, direction: endpoint.direction };
}

function toEndpoint(payload: {
  readonly nodeId: string;
  readonly portId: string;
  readonly direction?: ConnectionEndpoint["direction"];
}): ConnectionEndpoint {
  // Branded ids are plain strings at rest; document ids referencing existing
  // nodes were already admitted through createNodeId during node import.
  const nodeId = payload.nodeId as NodeId;
  return payload.direction === undefined
    ? { nodeId, portId: payload.portId }
    : { nodeId, portId: payload.portId, direction: payload.direction };
}

/** Rebuild result: a fresh graph or the `document.*` issues found. */
export type GraphImportResult = Result<Graph, MappingIssues>;

/**
 * Rebuilds a domain {@link Graph} from a normalized {@link GraphDocument}.
 *
 * Every structural failure is reported as a `document.*` issue instead of
 * being thrown or silently repaired: documents are untrusted input until
 * validated, and consumers must be able to see exactly what went wrong.
 */
export function documentToGraph(
  document: GraphDocument,
): GraphImportResult {
  const issues: ValidationIssue[] = [];
  let graph: Graph | undefined;
  try {
    graph = new Graph(
      createGraphId(document.metadata.id),
      readGraphMetadata(document),
      readGraphSettings(document),
    );
  } catch {
    issues.push(
      issue(
        "document.invalid-metadata-id",
        `Document metadata id "${document.metadata.id}" is not a valid graph id`,
        document.metadata.id,
      ),
    );
  }
  if (graph !== undefined) {
    for (const node of document.graph.nodes) {
      importNode(graph, node, issues);
    }
    for (const edge of document.graph.edges ?? []) {
      importEdge(graph, edge, issues);
    }
  }
  return issues.length === 0 && graph !== undefined
    ? { ok: true, value: graph }
    : { ok: false, error: issues };
}

function readGraphMetadata(document: GraphDocument): Graph["metadata"] {
  const { name, description, tags, extra } = document.metadata;
  const metadata: { name?: string; description?: string; tags?: readonly string[]; extra?: Readonly<Record<string, unknown>> } = {};
  if (name !== undefined) metadata["name"] = name;
  if (description !== undefined) metadata["description"] = description;
  if (tags !== undefined) metadata["tags"] = tags;
  if (extra !== undefined) metadata["extra"] = extra;
  return metadata;
}

function readGraphSettings(document: GraphDocument): GraphSettings {
  const settings = document.graph.settings;
  return {
    selfLoops: settings?.selfLoops ?? "allow",
    multiEdges: settings?.multiEdges ?? "allow",
    cycles: settings?.cycles ?? "allow",
  };
}

function importNode(
  graph: Graph,
  node: GraphDocument["graph"]["nodes"][number],
  issues: ValidationIssue[],
): void {
  const metadata = node.metadata === undefined ? undefined : { ...node.metadata };
  const position = node.position === undefined ? undefined : { x: node.position.x, y: node.position.y };
  const ports: PortInstance[] = (node.ports ?? []).map((port) =>
    port.declarationId === undefined
      ? { id: port.id, direction: port.direction }
      : { id: port.id, direction: port.direction, declarationId: port.declarationId },
  );
  let nodeId: InstanceType<typeof Node>["id"] | undefined;
  try {
    nodeId = createNodeId(node.id);
  } catch {
    issues.push(
      issue("document.invalid-node-id", `Node id "${node.id}" is not a valid node id`, node.id),
    );
    return;
  }
  const instance = new Node(
    nodeId,
    node.type,
    ports,
    { ...(node.properties ?? {}) },
    position,
    metadata,
    node.version,
  );
  const added = graph.addNode(instance);
  if (!added.ok) {
    const kind = added.error.kind;
    issues.push(
      issue(
        GRAPH_ERROR_CODE_BY_KIND[kind] ?? "document.mapping-error",
        added.error.message,
        node.id,
      ),
    );
  }
}

function importEdge(
  graph: Graph,
  edge: NonNullable<GraphDocument["graph"]["edges"]>[number],
  issues: ValidationIssue[],
): void {
  const sourceNode = graph.getNode(edge.source.nodeId as NodeId);
  if (sourceNode === undefined) {
    issues.push(
      issue(
        "document.edge-references-unknown-node",
        `Edge "${edge.id}" references unknown source node "${edge.source.nodeId}"`,
        edge.id,
      ),
    );
  }
  const targetNode = graph.getNode(edge.target.nodeId as NodeId);
  if (targetNode === undefined) {
    issues.push(
      issue(
        "document.edge-references-unknown-node",
        `Edge "${edge.id}" references unknown target node "${edge.target.nodeId}"`,
        edge.id,
      ),
    );
  }
  if (sourceNode !== undefined && !sourceNode.hasPort(edge.source.portId)) {
    issues.push(
      issue(
        "document.edge-references-unknown-port",
        `Source node "${edge.source.nodeId}" has no port "${edge.source.portId}"`,
        edge.id,
      ),
    );
  }
  if (targetNode !== undefined && !targetNode.hasPort(edge.target.portId)) {
    issues.push(
      issue(
        "document.edge-references-unknown-port",
        `Target node "${edge.target.nodeId}" has no port "${edge.target.portId}"`,
        edge.id,
      ),
    );
  }
  if (
    sourceNode === undefined ||
    targetNode === undefined ||
    !sourceNode.hasPort(edge.source.portId) ||
    !targetNode.hasPort(edge.target.portId)
  ) {
    return;
  }
  let connection: Connection;
  try {
    connection = new Connection(
      toEndpoint(edge.source),
      toEndpoint(edge.target),
    );
  } catch {
    issues.push(
      issue(
        "document.invalid-edge",
        `Edge "${edge.id}" joins a port to itself`,
        edge.id,
      ),
    );
    return;
  }
  const edgeId = createEdgeIdOrReport(edge.id, issues);
  if (edgeId === undefined) {
    return;
  }
  const metadata = edge.metadata === undefined ? undefined : { ...edge.metadata };
  const instance = new Edge(
    edgeId,
    connection,
    edge.type,
    edge.label,
    metadata,
  );
  const added = graph.addEdge(instance);
  if (!added.ok) {
    issues.push(
      issue(
        GRAPH_ERROR_CODE_BY_KIND[added.error.kind] ?? "document.mapping-error",
        added.error.message,
        edge.id,
      ),
    );
  }
}

function createEdgeIdOrReport(
  value: string,
  issues: ValidationIssue[],
): EdgeId | undefined {
  try {
    return createEdgeId(value);
  } catch {
    issues.push(
      issue("document.invalid-edge-id", `Edge id "${value}" is not a valid edge id`, value),
    );
    return undefined;
  }
}
