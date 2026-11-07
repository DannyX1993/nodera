import { describe, expect, it } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import { EditorEngine } from "../editor-engine.js";
import { addNode } from "./nodes.js";
import { selectMultiple } from "./selection.js";
import { copySelection, pasteSelection } from "./clipboard.js";

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

describe("pasteSelection failure atomicity (audit)", () => {
  it("removes already-created nodes when a later buffered node cannot be recreated", () => {
    const editor = new EditorEngine({ graphId: "graph-1" });
    editor.domain.nodes.register(makeDefinition("example.node"));
    editor.domain.nodes.register(makeDefinition("example.ephemeral"));
    for (const [id, def] of [
      ["a", "example.node"],
      ["b", "example.ephemeral"],
    ] as const) {
      const r = addNode(editor, { definitionId: def, nodeId: id });
      if (!r.ok) throw new Error(r.error.message);
    }
    const selected = selectMultiple(editor, { nodeIds: ["a", "b"] });
    if (!selected.ok) throw new Error(selected.error.message);
    const copied = copySelection(editor);
    if (!copied.ok) throw new Error("copy failed");

    // Sabotage: only the second node's definition becomes unavailable.
    editor.domain.nodes.unregister("example.ephemeral");

    const result = pasteSelection(editor, {});

    expect(result.ok).toBe(false);
    // Atomic failure: nothing from the paste may remain.
    expect(editor.graph.nodeCount).toBe(2);
    expect(editor.history.size()).toBe(2); // a, b (no paste unit)
  });
});
