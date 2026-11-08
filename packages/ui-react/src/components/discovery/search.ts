import type { EditorEngine } from "@nodera/application";
import type { Edge, Node } from "@nodera/graph-model";
import type { NodeDefinition, NodeRegistry } from "@nodera/node-registry";

/**
 * One searchable graph element.
 *
 * Matches carry what a list surface renders (kind, stable id and label), never
 * graph objects or framework objects: discovery panels stay consumers of the
 * portable model (AGENTS.md §5.3).
 */
export interface ElementMatch {
  readonly kind: "node" | "edge";
  readonly id: string;
  readonly label: string;
}

/** Options accepted by {@link searchGraph}. */
export interface SearchGraphOptions {
  /** Maximum number of matches across nodes and edges. Defaults to 20. */
  readonly limit?: number;
}

/** Result of {@link searchGraph}. */
export interface SearchGraphResult {
  readonly nodes: readonly ElementMatch[];
  readonly edges: readonly ElementMatch[];
  /** Whether the limit removed matches from the result. */
  readonly truncated: boolean;
}

/** Matches a search surface shows before it reports truncation. */
export const DEFAULT_SEARCH_LIMIT = 20;

/** Bucket that collects definitions which declare no category. */
export const UNCATEGORIZED_CATEGORY = "uncategorized";

/** One category of a node definition registry, ready for a palette section. */
export interface DefinitionCategoryGroup {
  readonly category: string;
  readonly definitions: readonly NodeDefinition[];
}

/**
 * Searches nodes and edges of the live graph.
 *
 * The query is trimmed and matched case-insensitively; an empty or whitespace
 * query matches every element in graph order, which is what a navigator shows
 * before the user types. Nodes are matched on id, name, definition name/id and
 * stringified primitive property values; edges on id and label.
 */
export function searchGraph(
  editor: EditorEngine,
  query: string,
  options: SearchGraphOptions = {},
): SearchGraphResult {
  const needle = query.trim().toLowerCase();
  const limit = normalizeLimit(options.limit);

  const matchedNodes = editor.graph.getNodes().filter((node) => matchesNode(editor, node, needle));
  const matchedEdges = editor.graph.getEdges().filter((edge) => matchesEdge(edge, needle));

  const nodes = matchedNodes.slice(0, limit).map((node) => toNodeMatch(editor, node));
  const remaining = Math.max(0, limit - nodes.length);
  const edges = matchedEdges.slice(0, remaining).map(toEdgeMatch);

  return {
    nodes,
    edges,
    truncated: matchedNodes.length + matchedEdges.length > nodes.length + edges.length,
  };
}

/**
 * Groups registry definitions for a palette.
 *
 * Categories follow `registry.categories()` (the registry's own ordering),
 * definitions keep registration order, and definitions without a category are
 * collected last in a bucket of their own instead of being dropped or rendered
 * under an empty heading.
 */
export function groupDefinitionsByCategory(
  registry: NodeRegistry,
): readonly DefinitionCategoryGroup[] {
  return groupDefinitions(registry.all());
}

/**
 * Groups an explicit definition list for a palette.
 *
 * Same rules as {@link groupDefinitionsByCategory} over a list the host chose
 * instead of a live registry (that is what lets a surface offer a narrowed
 * palette without inventing a registry of its own). Categories are sorted
 * alphabetically, definitions keep list order, and definitions without a
 * category are collected last.
 */
export function groupDefinitions(
  definitions: readonly NodeDefinition[],
): readonly DefinitionCategoryGroup[] {
  const categories = [...new Set(definitions.map((definition) => definition.category))].sort();
  const groups: DefinitionCategoryGroup[] = [];
  for (const category of categories) {
    if (category.trim().length === 0) {
      continue;
    }
    const ofCategory = definitions.filter((definition) => definition.category === category);
    if (ofCategory.length > 0) {
      groups.push({ category, definitions: ofCategory });
    }
  }

  const uncategorized = definitions.filter(
    (definition) => definition.category.trim().length === 0,
  );
  if (uncategorized.length > 0) {
    groups.push({ category: UNCATEGORIZED_CATEGORY, definitions: uncategorized });
  }
  return groups;
}

/** Display label of a node: its name, then its definition name, then its id. */
export function nodeDisplayLabel(editor: EditorEngine, node: Node): string {
  return metadataName(node) ?? editor.domain.nodes.get(node.definitionId)?.name ?? node.id;
}

/** Display label of an edge: its label, then its id. */
export function edgeDisplayLabel(edge: Edge): string {
  return edge.label ?? edge.id;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_SEARCH_LIMIT;
  }
  if (!Number.isFinite(limit)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, Math.trunc(limit));
}

function matchesNode(editor: EditorEngine, node: Node, needle: string): boolean {
  return needle.length === 0 || searchableNodeText(editor, node).includes(needle);
}

function matchesEdge(edge: Edge, needle: string): boolean {
  return (
    needle.length === 0 ||
    `${edge.id}\n${edgeDisplayLabel(edge)}`.toLowerCase().includes(needle)
  );
}

function searchableNodeText(editor: EditorEngine, node: Node): string {
  const parts: string[] = [node.id];
  const name = metadataName(node);
  if (name !== undefined) {
    parts.push(name);
  }
  const definition = editor.domain.nodes.get(node.definitionId);
  if (definition !== undefined) {
    parts.push(definition.name, definition.id);
  }
  for (const value of Object.values(node.getProperties())) {
    const text = primitiveText(value);
    if (text !== undefined) {
      parts.push(text);
    }
  }
  return parts.join("\n").toLowerCase();
}

function primitiveText(value: unknown): string | undefined {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
    case "boolean":
    case "bigint":
      return String(value);
    default:
      return undefined;
  }
}

function metadataName(node: Node): string | undefined {
  const name = node.metadata?.name;
  return typeof name === "string" && name.length > 0 ? name : undefined;
}

function toNodeMatch(editor: EditorEngine, node: Node): ElementMatch {
  return { kind: "node", id: node.id, label: nodeDisplayLabel(editor, node) };
}

function toEdgeMatch(edge: Edge): ElementMatch {
  return { kind: "edge", id: edge.id, label: edgeDisplayLabel(edge) };
}
