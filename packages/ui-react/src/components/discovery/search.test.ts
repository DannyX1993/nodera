import { describe, expect, it } from "vitest";

import type { EditorEngine } from "@nodera/application";
import { NodeRegistry } from "@nodera/node-registry";

import {
  DEFAULT_SEARCH_LIMIT,
  groupDefinitionsByCategory,
  searchGraph,
  UNCATEGORIZED_CATEGORY,
} from "./search.js";
import {
  DATASOURCE_DEFINITION_ID,
  LOOSE_DEFINITION_ID,
  SINK_DEFINITION_ID,
  TRANSFORM_DEFINITION_ID,
  addTestNode,
  connectTestNodes,
  createDiscoveryEditor,
} from "./test-helpers.js";

function seededEditor(): EditorEngine {
  const editor = createDiscoveryEditor();
  addTestNode(editor, {
    nodeId: "node-alpha",
    name: "Alpha",
    properties: { endpoint: "https://api.example/v1" },
  });
  addTestNode(editor, {
    nodeId: "node-beta",
    definitionId: TRANSFORM_DEFINITION_ID,
    name: "Beta",
  });
  addTestNode(editor, {
    nodeId: "node-gamma",
    definitionId: SINK_DEFINITION_ID,
    name: "Gamma",
  });
  connectTestNodes(editor, {
    edgeId: "edge-1",
    from: "node-alpha",
    to: "node-beta",
    label: "Approved path",
  });
  return editor;
}

function nodeIds(result: ReturnType<typeof searchGraph>): readonly string[] {
  return result.nodes.map((match) => match.id);
}

function edgeIds(result: ReturnType<typeof searchGraph>): readonly string[] {
  return result.edges.map((match) => match.id);
}

describe("searchGraph", () => {
  it("returns every node and edge in graph order for an empty query", () => {
    const result = searchGraph(seededEditor(), "");

    expect(nodeIds(result)).toEqual(["node-alpha", "node-beta", "node-gamma"]);
    expect(edgeIds(result)).toEqual(["edge-1"]);
    expect(result.nodes[0]?.kind).toBe("node");
    expect(result.edges[0]?.kind).toBe("edge");
    expect(result.truncated).toBe(false);
  });

  it("labels matches with the node name and the edge label", () => {
    const result = searchGraph(seededEditor(), "");

    expect(result.nodes.map((match) => match.label)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(result.edges[0]?.label).toBe("Approved path");
  });

  it("treats a whitespace-only query as matching everything", () => {
    const result = searchGraph(seededEditor(), "   \t ");

    expect(nodeIds(result)).toEqual(["node-alpha", "node-beta", "node-gamma"]);
    expect(edgeIds(result)).toEqual(["edge-1"]);
  });

  it("trims the query before matching", () => {
    const result = searchGraph(seededEditor(), "  gamma  ");

    expect(nodeIds(result)).toEqual(["node-gamma"]);
    expect(edgeIds(result)).toEqual([]);
  });

  it("matches case-insensitively against the node name and id", () => {
    const editor = seededEditor();

    expect(nodeIds(searchGraph(editor, "ALPHA"))).toEqual(["node-alpha"]);
    expect(nodeIds(searchGraph(editor, "NODE-GAM"))).toEqual(["node-gamma"]);
  });

  it("matches the node definition name and id", () => {
    const editor = seededEditor();

    expect(nodeIds(searchGraph(editor, "datasource"))).toEqual(["node-alpha"]);
    expect(nodeIds(searchGraph(editor, "test.sink"))).toEqual(["node-gamma"]);
  });

  it("matches stringified primitive property values", () => {
    const editor = createDiscoveryEditor();
    addTestNode(editor, {
      nodeId: "node-alpha",
      name: "Alpha",
      properties: { endpoint: "https://api.example/v1", retries: 3 },
    });

    expect(nodeIds(searchGraph(editor, "api.example"))).toEqual(["node-alpha"]);
    expect(nodeIds(searchGraph(editor, "3"))).toEqual(["node-alpha"]);
  });

  it("matches the edge label and id", () => {
    const editor = seededEditor();

    expect(edgeIds(searchGraph(editor, "approved"))).toEqual(["edge-1"]);
    expect(edgeIds(searchGraph(editor, "EDGE-1"))).toEqual(["edge-1"]);
    expect(nodeIds(searchGraph(editor, "approved"))).toEqual([]);
  });

  it("applies the default limit across the combined result order", () => {
    const editor = createDiscoveryEditor();
    for (let index = 0; index < DEFAULT_SEARCH_LIMIT + 2; index += 1) {
      addTestNode(editor, { nodeId: `node-${index}`, name: `Node ${index}` });
    }
    addTestNode(editor, { nodeId: "node-last", name: "Node last" });
    connectTestNodes(editor, { edgeId: "edge-last", from: "node-0", to: "node-1" });

    const result = searchGraph(editor, "node");

    expect(result.nodes).toHaveLength(DEFAULT_SEARCH_LIMIT);
    expect(result.edges).toHaveLength(0);
    expect(result.truncated).toBe(true);
  });

  it("uses the requested limit for nodes first and edges afterwards", () => {
    const editor = seededEditor();

    const result = searchGraph(editor, "", { limit: 2 });
    expect(nodeIds(result)).toEqual(["node-alpha", "node-beta"]);
    expect(edgeIds(result)).toEqual([]);
    expect(result.truncated).toBe(true);

    const wide = searchGraph(editor, "", { limit: 4 });
    expect(nodeIds(wide)).toEqual(["node-alpha", "node-beta", "node-gamma"]);
    expect(edgeIds(wide)).toEqual(["edge-1"]);
    expect(wide.truncated).toBe(false);
  });

  it("reports no matches without truncation when nothing matches", () => {
    const result = searchGraph(seededEditor(), "nothing-matches-this");

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("returns the empty result for an empty graph", () => {
    const result = searchGraph(createDiscoveryEditor(), "");

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

describe("groupDefinitionsByCategory", () => {
  it("groups definitions by registry category order, keeping registration order", () => {
    const groups = groupDefinitionsByCategory(createDiscoveryEditor().domain.nodes);

    expect(groups.map((group) => group.category)).toEqual([
      "sinks",
      "sources",
      UNCATEGORIZED_CATEGORY,
    ]);
    expect(groups[0]?.definitions.map((definition) => definition.id)).toEqual([
      SINK_DEFINITION_ID,
    ]);
    expect(groups[1]?.definitions.map((definition) => definition.id)).toEqual([
      DATASOURCE_DEFINITION_ID,
      TRANSFORM_DEFINITION_ID,
    ]);
    expect(groups[2]?.definitions.map((definition) => definition.id)).toEqual([
      LOOSE_DEFINITION_ID,
    ]);
  });

  it("omits the uncategorized bucket when every definition declares a category", () => {
    const editor = createDiscoveryEditor();
    editor.domain.nodes.unregister(LOOSE_DEFINITION_ID);

    const groups = groupDefinitionsByCategory(editor.domain.nodes);

    expect(groups.map((group) => group.category)).toEqual(["sinks", "sources"]);
  });

  it("returns no groups for an empty registry", () => {
    expect(groupDefinitionsByCategory(new NodeRegistry())).toEqual([]);
  });
});
