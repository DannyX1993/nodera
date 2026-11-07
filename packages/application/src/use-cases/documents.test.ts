import { describe, expect, it, vi } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { addNode } from "./nodes.js";
import { createEdge } from "./edges.js";
import { exportDocument, importDocument, migrateDocument, type DocumentFormat } from "./documents.js";

const DOCUMENT_JSON = `{
  "format": "ggd",
  "version": "1.0.0",
  "metadata": { "id": "graph-doc", "name": "Imported", "description": "" },
  "extensions": [],
  "graph": {
    "nodes": [
      {
        "id": "n1",
        "type": "unknown.vendor.node",
        "version": "1.0.0",
        "position": { "x": 10, "y": 20 },
        "ports": [
          { "id": "in", "direction": "input" },
          { "id": "out", "direction": "output" }
        ],
        "properties": { "value": "hello" },
        "metadata": {}
      },
      {
        "id": "n2",
        "type": "unknown.vendor.node",
        "version": "1.0.0",
        "position": { "x": 30, "y": 40 },
        "ports": [
          { "id": "in", "direction": "input" },
          { "id": "out", "direction": "output" }
        ],
        "properties": {},
        "metadata": {}
      }
    ],
    "edges": [
      {
        "id": "e1",
        "source": { "nodeId": "n1", "portId": "out" },
        "target": { "nodeId": "n2", "portId": "in" }
      }
    ],
    "groups": []
  }
}`;

const OLD_VERSION_JSON = `{
  "format": "ggd",
  "version": "0.9.0",
  "metadata": { "id": "graph-old", "name": "Old", "description": "" },
  "extensions": [],
  "graph": { "nodes": [], "edges": [], "groups": [] }
}`;

const MIGRATIONS = [
  {
    id: "migrate-0.9.0-to-1.0.0",
    from: "0.9.0",
    to: "1.0.0",
    migrate: (document: Record<string, unknown>) => ({ ...document }),
  },
] as const;

function makeDefinition(id: string): NodeDefinition {
  return {
    id,
    name: id,
    version: "1.0.0",
    ports: [
      { id: "in", name: "in", direction: "input" },
      { id: "out", name: "out", direction: "output" },
    ],
    properties: [],
  } as unknown as NodeDefinition;
}

function makeEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "graph-1" });
  editor.domain.nodes.register(makeDefinition("example.node"));
  return editor;
}

function seed(editor: EditorEngine): void {
  for (const id of ["a", "b"]) {
    const result = addNode(editor, {
      definitionId: "example.node",
      nodeId: id,
      position: { x: 1, y: 2 },
      properties: { url: "x" },
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }
  const edge = createEdge(editor, {
    edgeId: "e1",
    source: { nodeId: "a", portId: "out" },
    target: { nodeId: "b", portId: "in" },
  });
  if (!edge.ok) {
    throw new Error(edge.error.message);
  }
}

describe("importDocument use case", () => {
  it("loads a JSON document as the new editing target, including unknown node types", () => {
    const editor = makeEditor();
    seed(editor);

    const result = importDocument(editor, { raw: DOCUMENT_JSON, format: "json" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(editor.graph.id).toBe("graph-doc");
      expect(editor.graph.nodeCount).toBe(2);
      expect(editor.graph.edgeCount).toBe(1);
      const node = editor.getNode("n1");
      expect(node?.definitionId).toBe("unknown.vendor.node");
      expect(node?.position).toEqual({ x: 10, y: 20 });
      expect(node?.getProperties()).toEqual({ value: "hello" });
    }
  });

  it("emits graph.loaded and resets the history for the new target", () => {
    const editor = makeEditor();
    seed(editor);
    const onLoaded = vi.fn();
    editor.events.subscribe("graph.loaded", onLoaded);

    importDocument(editor, { raw: DOCUMENT_JSON, format: "json" });

    expect(onLoaded).toHaveBeenCalledTimes(1);
    expect(editor.canUndo()).toBe(false);
  });

  it("imports YAML documents through the same pipeline", () => {
    const editor = makeEditor();
    const result = importDocument(editor, {
      raw: [
        "format: ggd",
        "version: 1.0.0",
        "metadata:",
        "  id: graph-yaml",
        "  name: From YAML",
        "  description: ''",
        "extensions: []",
        "graph:",
        "  nodes: []",
        "  edges: []",
        "  groups: []",
      ].join("\n"),
      format: "yaml",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(editor.graph.id).toBe("graph-yaml");
    }
  });

  it("returns structured issues for invalid documents without touching the current graph", () => {
    const editor = makeEditor();
    seed(editor);

    const result = importDocument(editor, { raw: "{ not json", format: "json" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
      expect(result.error[0]!.code).toBeTruthy();
    }
    expect(editor.graph.id).toBe("graph-1");
    expect(editor.graph.nodeCount).toBe(2);
  });
});

describe("exportDocument use case", () => {
  it("serializes the current graph to JSON and emits graph.exported", () => {
    const editor = makeEditor();
    seed(editor);
    const onExported = vi.fn();
    editor.events.subscribe("graph.exported", onExported);

    const result = exportDocument(editor, { format: "json" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = JSON.parse(result.value) as {
        format: string;
        version: string;
        graph: { nodes: { id: string; type: string; properties: Record<string, unknown> }[] };
      };
      expect(parsed.format).toBe("ggd");
      expect(parsed.graph.nodes).toHaveLength(2);
      expect(parsed.graph.nodes[0]!.type).toBe("example.node");
      expect(parsed.graph.nodes[0]!.properties).toEqual({ url: "x" });
    }
    expect(onExported).toHaveBeenCalledTimes(1);
    expect(onExported.mock.calls[0]![0]!.payload.format).toBe("json");
  });

  it("exports YAML when requested", () => {
    const editor = makeEditor();
    seed(editor);

    const result = exportDocument(editor, { format: "yaml" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain("format: ggd");
    }
  });

  it("fails with structured issues for an unsupported format", () => {
    const editor = makeEditor();
    seed(editor);
    const result = exportDocument(editor, { format: "xml" as DocumentFormat });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});

describe("migrateDocument use case", () => {
  it("migrates an old-version document to the target version", () => {
    const result = migrateDocument(OLD_VERSION_JSON, {
      format: "json",
      migrations: MIGRATIONS,
      targetVersion: "1.0.0",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe("1.0.0");
      expect(result.value.metadata.id).toBe("graph-old");
    }
  });

  it("returns structured issues for unsupported versions", () => {
    const result = migrateDocument(OLD_VERSION_JSON, {
      format: "json",
      migrations: [],
      targetVersion: "1.0.0",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("fails with parse issues for malformed text", () => {
    const result = migrateDocument("::bad::", {
      format: "yaml",
      migrations: MIGRATIONS,
      targetVersion: "1.0.0",
    });
    expect(result.ok).toBe(false);
  });
});
