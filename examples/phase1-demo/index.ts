/**
 * Manual Phase 1 demo: run the domain core in a terminal with no UI.
 *
 *   pnpm dlx tsx examples/phase1-demo.ts
 */
import { createEdgeId, createGraphId } from "@nodera/contracts";
import { Connection, Edge, Graph } from "@nodera/graph-model";
import { NoderaDomain } from "@nodera/domain";

const domain = new NoderaDomain();

// 1. Register what node types the application offers.
domain.nodes.register({
  id: "vendor.http-request",
  name: "HTTP Request",
  category: "network",
  version: "1.0.0",
  ports: [
    { id: "target", direction: "input", dataType: "string" },
    { id: "response", direction: "output", dataType: "string" },
  ],
  properties: [
    { id: "url", type: "string", required: true, schema: { pattern: "^https?://" } },
  ],
});
domain.nodes.register({
  id: "vendor.logger",
  name: "Logger",
  category: "utility",
  version: "1.0.0",
  ports: [{ id: "message", direction: "input", dataType: "string" }],
  properties: [],
});

// 2. Create a graph and add node instances from those definitions.
const graph = new Graph(createGraphId("my-graph"), { name: "Demo" });
const http = domain.createNode(graph, "vendor.http-request", {
  nodeId: "node-123",
  properties: { url: "nota-url" }, // invalid on purpose
});
const logger = domain.createNode(graph, "vendor.logger", { nodeId: "node-456" });

if (!http.ok || !logger.ok) {
  throw new Error("fixture nodes failed");
}

// 3. Connect them: an edge stores endpoints + definition id, nothing visual.
const connected = graph.addEdge(
  new Edge(
    createEdgeId("edge-1"),
    new Connection(
      { nodeId: http.value.id, portId: "response" },
      { nodeId: logger.value.id, portId: "message" },
    ),
  ),
);
console.log("edge added:", connected.ok);

// 4. Validate. Structural and configuration results stay apart.
const report = domain.validate(graph);
console.log("structurally valid:  ", report.structurallyValid);
console.log("configuration valid: ", report.configurationValid);
for (const issue of report.issues) {
  console.log(` [${issue.severity}] ${issue.code} -> ${issue.elementId ?? "-"} ${JSON.stringify(issue.propertyPath ?? [])}`);
  console.log(`    ${issue.message}`);
}

// 5. Query the graph.
console.log("nodes:", graph.getNodes().map((n) => `${n.id} (${n.definitionId})`));
console.log("edges of node-123:", graph.getEdgesOf(http.value.id).map((e) => e.id));
console.log("registry categories:", domain.nodes.categories());
