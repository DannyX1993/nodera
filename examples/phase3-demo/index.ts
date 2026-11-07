/**
 * Phase 3 demo: the framework-agnostic editing engine.
 *
 * Edit a graph through use cases (never touching the domain entities
 * directly), watch the events a host application would subscribe to, and
 * undo/redo everything — including a node deletion that restores its
 * connections.
 *
 * Run: pnpm install && node --experimental-strip-types examples/phase3-demo/index.ts
 */

import type { NodeDefinition } from "@nodera/node-registry";
import {
  EditorEngine,
  addNode,
  clearSelection,
  copySelection,
  createEdge,
  createGraph,
  exportDocument,
  pasteSelection,
  redo,
  removeNode,
  selectMultiple,
  selectNode,
  undo,
  updateNodeProperties,
  validateGraph,
  type EditorEvent,
} from "@nodera/application";

const httpRequest: NodeDefinition = {
  id: "http.request",
  name: "HTTP Request",
  version: "1.0.0",
  category: "network",
  ports: [
    { id: "in", name: "In", direction: "input" },
    { id: "out", name: "Out", direction: "output" },
  ],
  properties: [],
} as unknown as NodeDefinition;

const editor = new EditorEngine({ graphId: "graph-001" });

// The host app subscribes to the event bus to sync its UI.
const log: string[] = [];
for (const name of [
  "graph.created",
  "graph.loaded",
  "graph.changed",
  "node.created",
  "node.deleted",
  "node.selected",
  "edge.created",
  "edge.deleted",
  "property.changed",
  "validation.completed",
] as const) {
  editor.events.subscribe(name, (event: EditorEvent) => {
    log.push(`${name.padEnd(22)} ${JSON.stringify(event.payload)}`);
  });
}

console.log("== 1. Create a graph and build a small pipeline ==");
createGraph(editor, { graphId: "graph-001", metadata: { name: "Demo", description: "" } });
editor.domain.nodes.register(httpRequest);
addNode(editor, { definitionId: "http.request", nodeId: "fetch-a", position: { x: 0, y: 0 } });
addNode(editor, { definitionId: "http.request", nodeId: "fetch-b", position: { x: 200, y: 0 } });
createEdge(editor, {
  edgeId: "e1",
  source: { nodeId: "fetch-a", portId: "out" },
  target: { nodeId: "fetch-b", portId: "in" },
});
updateNodeProperties(editor, { nodeId: "fetch-a", name: "url", value: "https://example.com" });

console.log("== 2. Selection and clipboard ==");
selectNode(editor, { nodeId: "fetch-a" });
selectMultiple(editor, { nodeIds: ["fetch-a", "fetch-b"] });
clearSelection(editor);
selectMultiple(editor, { nodeIds: ["fetch-a", "fetch-b"] });
copySelection(editor);
pasteSelection(editor, { offset: { x: 400, y: 100 } });
console.log(`graph now: ${editor.graph.nodeCount} nodes, ${editor.graph.edgeCount} edges`);

console.log("== 3. Undo/redo (delete node -> undo restores its connections) ==");
removeNode(editor, { nodeId: "fetch-b" });
console.log(`after delete: ${editor.graph.nodeCount} nodes, ${editor.graph.edgeCount} edges`);
undo(editor);
console.log(`after undo:   ${editor.graph.nodeCount} nodes, ${editor.graph.edgeCount} edges (edge e1 back)`);
redo(editor);
undo(editor);

console.log("== 4. Validation pipeline ==");
const report = validateGraph(editor);
console.log(`valid=${report.isValid} issues=${report.issues.length}`);

console.log("== 5. Export a portable document ==");
const exported = exportDocument(editor, { format: "json" });
if (exported.ok) {
  console.log(exported.value.slice(0, 220) + " ...");
}

console.log("\n== Event log (what a host application would receive) ==");
for (const line of log) {
  console.log("  " + line);
}
