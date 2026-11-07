import "@xyflow/react/dist/style.css";

import { EditorEngine, addNode } from "@nodera/application";
import type { NodeDefinition } from "@nodera/node-registry";
import { DemoApp } from "./demo.js";

const httpNode: NodeDefinition = {
  id: "http.request",
  name: "HTTP Request",
  version: "1.0.0",
  category: "network",
  ports: [
    { id: "in", name: "In", direction: "input" },
    { id: "out", name: "Out", direction: "output" },
  ],
  properties: [],
  visual: { color: "#2563eb", icon: "🌐" },
} as unknown as NodeDefinition;

const transformNode: NodeDefinition = {
  id: "script.transform",
  name: "Transform",
  version: "1.0.0",
  category: "data",
  // Custom renderer resolved through the NodeRendererRegistry.
  renderer: "transform-card",
  ports: [
    { id: "in", name: "In", direction: "input" },
    { id: "out", name: "Out", direction: "output" },
  ],
  properties: [],
  visual: { color: "#059669", icon: "⚙️" },
} as unknown as NodeDefinition;

const editor = new EditorEngine({ graphId: "graph-001" });
editor.domain.nodes.register(httpNode);
editor.domain.nodes.register(transformNode);

// Seed the graph through the application core, never through visual state.
addNode(editor, { definitionId: "http.request", nodeId: "http-1", properties: [], position: { x: 120, y: 120 } });
addNode(editor, { definitionId: "script.transform", nodeId: "transform-1", properties: [], position: { x: 480, y: 260 } });

const root = document.getElementById("root");
if (!root) {
  throw new Error("missing #root mount point");
}

let counter = 0;
function onAddClick(definitionId: string): void {
  counter += 1;
  const result = addNode(editor, {
    definitionId,
    nodeId: `${definitionId}-${counter}`,
    properties: [],
    position: { x: 100 + counter * 40, y: 100 + counter * 30 },
  });
  if (!result.ok) {
    // Surface diagnostics instead of failing silently.
    console.error(result.error.message);
  }
}

const { createRoot } = await import("react-dom/client");
const { createElement } = await import("react");

createRoot(root).render(
  createElement(DemoApp, {
    editor,
    onAddHttp: () => onAddClick("http.request"),
    onAddTransform: () => onAddClick("script.transform"),
  }),
);
