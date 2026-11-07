import { describe, expect, it, vi } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { addNode } from "./nodes.js";
import { createEdge } from "./edges.js";
import { validateConnection, validateGraph, validateNode } from "./validate.js";

function makeDefinition(id: string, required?: string): NodeDefinition {
  return {
    id,
    name: id,
    version: "1.0.0",
    ports: [
      { id: "in", name: "in", direction: "input" },
      { id: "out", name: "out", direction: "output" },
    ],
    properties: required
      ? [{ id: required, name: required, type: "string", required: true }]
      : [],
  } as unknown as NodeDefinition;
}

function makeEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "graph-1" });
  editor.domain.nodes.register(makeDefinition("example.node"));
  editor.domain.nodes.register(makeDefinition("example.requires", "mandatory"));
  return editor;
}

function seed(editor: EditorEngine): void {
  for (const id of ["a", "b"]) {
    const result = addNode(editor, { definitionId: "example.node", nodeId: id });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
  }
}

describe("validateGraph use case", () => {
  it("runs the composed validation pipeline and returns the report", () => {
    const editor = makeEditor();
    seed(editor);

    const report = validateGraph(editor);

    expect(report.isValid).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("reports configuration issues from the domain validators", () => {
    const editor = makeEditor();
    const result = addNode(editor, {
      definitionId: "example.requires",
      nodeId: "r1",
    });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const report = validateGraph(editor);

    expect(report.isValid).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
    expect(report.issues.some((issue) => issue.elementId === "r1")).toBe(true);
  });

  it("emits validation.completed exactly once with the report", () => {
    const editor = makeEditor();
    seed(editor);
    const onCompleted = vi.fn();
    editor.events.subscribe("validation.completed", onCompleted);

    validateGraph(editor);

    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCompleted.mock.calls[0]![0]!.payload.report.isValid).toBe(true);
  });
});

describe("validateNode use case", () => {
  it("returns no issues for a well-configured node", () => {
    const editor = makeEditor();
    seed(editor);

    const result = validateNode(editor, { nodeId: "a" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.issues).toHaveLength(0);
      expect(result.value.valid).toBe(true);
    }
  });

  it("reports issues whose element is the node (configuration errors)", () => {
    const editor = makeEditor();
    const result = addNode(editor, { definitionId: "example.requires", nodeId: "r1" });
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    const nodeResult = validateNode(editor, { nodeId: "r1" });

    expect(nodeResult.ok).toBe(true);
    if (nodeResult.ok) {
      expect(nodeResult.value.valid).toBe(false);
      expect(nodeResult.value.issues.length).toBeGreaterThan(0);
    }
  });

  it("fails for an unknown node", () => {
    const editor = makeEditor();
    const result = validateNode(editor, { nodeId: "ghost" });
    expect(result.ok).toBe(false);
  });
});

describe("validateConnection use case", () => {
  it("accepts a structurally valid connection without mutating the graph", () => {
    const editor = makeEditor();
    seed(editor);
    const before = { nodes: editor.graph.nodeCount, edges: editor.graph.edgeCount };
    const historyBefore = editor.history.size();

    const result = validateConnection(editor, {
      source: { nodeId: "a", portId: "out" },
      target: { nodeId: "b", portId: "in" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(true);
      expect(result.value.issues).toHaveLength(0);
    }
    expect(editor.graph.nodeCount).toBe(before.nodes);
    expect(editor.graph.edgeCount).toBe(before.edges);
    expect(editor.history.size()).toBe(historyBefore);
  });

  it("rejects a connection to a missing port with a structured issue", () => {
    const editor = makeEditor();
    seed(editor);

    const result = validateConnection(editor, {
      source: { nodeId: "a", portId: "out" },
      target: { nodeId: "b", portId: "nope" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
      expect(result.value.issues.length).toBeGreaterThan(0);
    }
  });

  it("rejects self-loops when the graph settings forbid them", () => {
    const editor = new EditorEngine({
      graphId: "graph-1",
      graphSettings: { selfLoops: "forbid", multiEdges: "allow", cycles: "allow" },
    });
    editor.domain.nodes.register(makeDefinition("example.node"));
    seed(editor);

    const result = validateConnection(editor, {
      source: { nodeId: "a", portId: "out" },
      target: { nodeId: "a", portId: "in" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.valid).toBe(false);
    }
  });

  it("fails for unknown nodes", () => {
    const editor = makeEditor();
    const result = validateConnection(editor, {
      source: { nodeId: "ghost", portId: "out" },
      target: { nodeId: "b", portId: "in" },
    });
    expect(result.ok).toBe(false);
  });
});
