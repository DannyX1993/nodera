/**
 * `removeNodeSplicing`: one node removed, its predecessors joined to its
 * successors.
 *
 * Every assertion goes through the public surface the application layer owns:
 * the use case result, the graph the editor exposes, the history unit count and
 * labels, the event bus and `undo`/`redo`. Nothing reads a private store.
 *
 * The rules pinned here are the ones S22 names: the removed node's ports travel
 * on the spliced edge, the edge type is the incoming one, one predecessor by one
 * successor is one edge, several of each are the cartesian product with the
 * duplicates skipped, a node with no predecessor or no successor degrades to a
 * plain removal, and the whole change is **one** reversible unit (AGENTS.md §12,
 * §13).
 */

import { describe, expect, it } from "vitest";
import type { NodeDefinition } from "@nodera/node-registry";
import type { Edge, PortDirection } from "@nodera/graph-model";
import { EditorEngine } from "../editor-engine.js";
import { createEdge } from "./edges.js";
import { undo, redo } from "./history.js";
import { addNode } from "./nodes.js";
import { removeNodeSplicing } from "./remove-node-splicing.js";

/** Definition with exactly the given port directions, ids `in` / `out`. */
function makeDefinition(
  id: string,
  directions: readonly PortDirection[],
): NodeDefinition {
  return {
    id,
    name: id,
    version: "1.0.0",
    ports: directions.map((direction) => ({
      id: direction === "input" ? "in" : "out",
      name: direction,
      direction,
    })),
    properties: [],
  } as unknown as NodeDefinition;
}

const MIDDLE = "example.middle";
const SOURCE = "example.source";
const SINK = "example.sink";

/** Edge types used by the seeded relations: only the incoming one is carried. */
const INCOMING_TYPE = "example.flow";
const OUTGOING_TYPE = "example.tail";

function makeEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "graph-1" });
  editor.domain.nodes.register(makeDefinition(MIDDLE, ["input", "output"]));
  editor.domain.nodes.register(makeDefinition(SOURCE, ["output"]));
  editor.domain.nodes.register(makeDefinition(SINK, ["input"]));
  return editor;
}

function seedNode(editor: EditorEngine, nodeId: string, definitionId: string): void {
  const result = addNode(editor, { definitionId, nodeId });
  if (!result.ok) {
    throw new Error(`seed failed: ${result.error.message}`);
  }
}

function seedEdge(
  editor: EditorEngine,
  edgeId: string,
  source: string,
  target: string,
  definitionId: string,
): void {
  const result = createEdge(editor, {
    edgeId,
    source: { nodeId: source, portId: "out" },
    target: { nodeId: target, portId: "in" },
    definitionId,
  });
  if (!result.ok) {
    throw new Error(`seed failed: ${result.error.message}`);
  }
}

/** Graph `p1 --e-in--> mid --e-out--> s1`. */
function makeLinearEditor(): EditorEngine {
  const editor = makeEditor();
  seedNode(editor, "p1", SOURCE);
  seedNode(editor, "mid", MIDDLE);
  seedNode(editor, "s1", SINK);
  seedEdge(editor, "e-in", "p1", "mid", INCOMING_TYPE);
  seedEdge(editor, "e-out", "mid", "s1", OUTGOING_TYPE);
  return editor;
}

/** Every event name the removal may touch, as an ordered log. */
function eventLog(editor: EditorEngine): string[] {
  const names: string[] = [];
  for (const name of [
    "node.created",
    "node.deleted",
    "edge.created",
    "edge.deleted",
    "graph.changed",
  ] as const) {
    editor.events.subscribe(name, () => names.push(name));
  }
  return names;
}

/** Endpoints of one edge as `source:port -> target:port`, in reading order. */
function endpoints(edge: Edge | undefined): string | undefined {
  if (edge === undefined) {
    return undefined;
  }
  const { source, target } = edge.connection;
  return `${source.nodeId}:${source.portId} -> ${target.nodeId}:${target.portId}`;
}

/** Node ids the graph holds, in storage order. */
function nodeIds(editor: EditorEngine): readonly string[] {
  return editor.graph.getNodes().map((node) => node.id);
}

/** Edge ids the graph holds, in storage order. */
function edgeIds(editor: EditorEngine): readonly string[] {
  return editor.graph.getEdges().map((edge) => edge.id);
}

/**
 * Ids as a set.
 *
 * The graph stores its elements in insertion order, so an undo that re-adds what
 * a unit removed appends them: the restored graph holds exactly the same
 * elements, not necessarily in the same order. Content is what the unit
 * guarantees.
 */
function sameIds(ids: readonly string[]): readonly string[] {
  return [...ids].sort();
}

describe("removeNodeSplicing use case", () => {
  it("joins the predecessor to the successor, carrying the removed ports and incoming type", () => {
    const editor = makeLinearEditor();

    const result = removeNodeSplicing(editor, { nodeId: "mid" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.node.id).toBe("mid");
    expect(result.value.edges.map((edge) => edge.id)).toEqual(["e-in", "e-out"]);
    expect(result.value.spliced).toHaveLength(1);

    const spliced = result.value.spliced[0];
    expect(spliced).toBeDefined();
    if (spliced === undefined) return;
    // The predecessor's port comes from its incoming edge, the successor's from
    // its outgoing one; the type is the removed node's incoming edge type.
    expect(endpoints(spliced)).toBe("p1:out -> s1:in");
    expect(spliced.definitionId).toBe(INCOMING_TYPE);

    expect(nodeIds(editor)).toEqual(["p1", "s1"]);
    expect(edgeIds(editor)).toEqual([spliced.id]);
  });

  it("is one history unit: a single undo restores the node and its original edges", () => {
    const editor = makeLinearEditor();
    const before = {
      nodes: nodeIds(editor),
      edges: edgeIds(editor),
    };

    const removed = removeNodeSplicing(editor, { nodeId: "mid" });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;

    expect(editor.history.labels().at(-1)).toBe("remove-node-splicing");
    expect(editor.history.size()).toBe(before.nodes.length + before.edges.length + 1);

    expect(undo(editor)).toBe(true);

    // Exactly the graph that was there, ids and ports included.
    expect(sameIds(nodeIds(editor))).toEqual(sameIds(before.nodes));
    expect(sameIds(edgeIds(editor))).toEqual(["e-in", "e-out"]);
    expect(endpoints(editor.getEdge("e-in"))).toBe("p1:out -> mid:in");
    expect(endpoints(editor.getEdge("e-out"))).toBe("mid:out -> s1:in");
    expect(editor.getEdge("e-in")?.definitionId).toBe(INCOMING_TYPE);
    expect(editor.getEdge("e-out")?.definitionId).toBe(OUTGOING_TYPE);
    const splicedId = removed.value.spliced[0]?.id;
    expect(splicedId === undefined ? undefined : editor.getEdge(splicedId)).toBeUndefined();
    expect(editor.getNode("mid")).toBeDefined();

    // Redo is the same unit again: node and its edges gone, splice back.
    expect(redo(editor)).toBe(true);
    expect(editor.getNode("mid")).toBeUndefined();
    expect(splicedId === undefined ? [] : edgeIds(editor)).toEqual(
      removed.value.spliced.map((edge) => edge.id),
    );
  });

  it("joins every predecessor to every successor, skipping a pair that already exists", () => {
    const editor = makeEditor();
    for (const [id, definitionId] of [
      ["p1", SOURCE],
      ["p2", SOURCE],
      ["mid", MIDDLE],
      ["s1", SINK],
      ["s2", SINK],
    ] as const) {
      seedNode(editor, id, definitionId);
    }
    seedEdge(editor, "p1-mid", "p1", "mid", INCOMING_TYPE);
    seedEdge(editor, "p2-mid", "p2", "mid", INCOMING_TYPE);
    seedEdge(editor, "mid-s1", "mid", "s1", OUTGOING_TYPE);
    seedEdge(editor, "mid-s2", "mid", "s2", OUTGOING_TYPE);
    // A relation that already joins p1 to s1: the pair p1 × s1 would duplicate
    // it, so it is skipped instead of being written twice.
    seedEdge(editor, "p1-s1", "p1", "s1", INCOMING_TYPE);

    const result = removeNodeSplicing(editor, { nodeId: "mid" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.spliced.map(endpoints).sort()).toEqual([
      "p1:out -> s2:in",
      "p2:out -> s1:in",
      "p2:out -> s2:in",
    ]);
    for (const edge of result.value.spliced) {
      expect(edge.definitionId).toBe(INCOMING_TYPE);
    }

    // The four carried edges and the node are gone; the pre-existing relation and
    // the three spliced ones stay, and nothing was written twice.
    expect(nodeIds(editor)).toEqual(["p1", "p2", "s1", "s2"]);
    expect(edgeIds(editor)).toEqual(
      expect.arrayContaining([
        "p1-s1",
        ...result.value.spliced.map((edge) => edge.id),
      ]),
    );
    expect(editor.graph.edgeCount).toBe(4);

    // A single undo restores everything the unit removed and drops every splice.
    expect(undo(editor)).toBe(true);
    expect(sameIds(edgeIds(editor))).toEqual([
      "mid-s1",
      "mid-s2",
      "p1-mid",
      "p1-s1",
      "p2-mid",
    ]);
    expect(editor.graph.nodeCount).toBe(5);
  });

  it("degrades to a plain removal when the node has no predecessor or no successor", () => {
    // No predecessor: `mid --> s1` only.
    const tail = makeEditor();
    seedNode(tail, "mid", MIDDLE);
    seedNode(tail, "s1", SINK);
    seedEdge(tail, "e-out", "mid", "s1", OUTGOING_TYPE);

    const removedTail = removeNodeSplicing(tail, { nodeId: "mid" });
    expect(removedTail.ok).toBe(true);
    if (!removedTail.ok) return;
    expect(removedTail.value.spliced).toEqual([]);
    expect(nodeIds(tail)).toEqual(["s1"]);
    expect(tail.graph.edgeCount).toBe(0);
    expect(undo(tail)).toBe(true);
    expect(sameIds(nodeIds(tail))).toEqual(["mid", "s1"]);
    expect(edgeIds(tail)).toEqual(["e-out"]);

    // No successor: `p1 --> mid` only.
    const head = makeEditor();
    seedNode(head, "p1", SOURCE);
    seedNode(head, "mid", MIDDLE);
    seedEdge(head, "e-in", "p1", "mid", INCOMING_TYPE);

    const removedHead = removeNodeSplicing(head, { nodeId: "mid" });
    expect(removedHead.ok).toBe(true);
    if (!removedHead.ok) return;
    expect(removedHead.value.spliced).toEqual([]);
    expect(nodeIds(head)).toEqual(["p1"]);
    expect(head.graph.edgeCount).toBe(0);
    expect(undo(head)).toBe(true);
    expect(edgeIds(head)).toEqual(["e-in"]);
  });

  it("emits the node removal, its edge removals, the splices and one graph.changed", () => {
    const editor = makeLinearEditor();
    const names = eventLog(editor);

    removeNodeSplicing(editor, { nodeId: "mid" });

    expect(names).toEqual([
      "node.deleted",
      "edge.deleted",
      "edge.deleted",
      "edge.created",
      "graph.changed",
    ]);
  });

  it("refuses an unknown node without side effects", () => {
    const editor = makeLinearEditor();
    const names = eventLog(editor);

    const result = removeNodeSplicing(editor, { nodeId: "ghost" });

    expect(result.ok ? undefined : result.error.kind).toBe("node-not-found");
    expect(result.ok ? undefined : result.error.elementId).toBe("ghost");
    expect(nodeIds(editor)).toEqual(["p1", "mid", "s1"]);
    expect(edgeIds(editor)).toEqual(["e-in", "e-out"]);
    expect(editor.history.labels().at(-1)).toBe("create-edge");
    expect(names).toEqual([]);
  });
});
