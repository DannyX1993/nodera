import { createEdgeId, createGraphId, createNodeId } from "@nodera/contracts";
import {
  documentToGraph,
  graphToDocument,
  normalizeGraphDocument,
  validateGraphDocument,
} from "@nodera/document";
import { Connection, Edge, Graph, Node } from "@nodera/graph-model";
import { parseJsonDocument, serializeJson } from "@nodera/serialization-json";
import { parseYamlDocument, serializeYaml } from "@nodera/serialization-yaml";

/** Builds the same sample graph the Phase 1 demo uses, with ports and data. */
function sampleGraph(): Graph {
  const graph = new Graph(createGraphId("graph-001"), {
    name: "Example graph",
    description: "Example document",
    tags: ["demo"],
  });
  graph.addNode(
    new Node(
      createNodeId("node-001"),
      "example.input",
      [
        { id: "in", direction: "input" },
        { id: "out", direction: "output" },
      ],
      { value: "Hello world" },
      { x: 100, y: 100 },
    ),
  );
  graph.addNode(
    new Node(
      createNodeId("node-002"),
      "example.output",
      [{ id: "in", direction: "input" }],
      {},
      { x: 400, y: 100 },
    ),
  );
  graph.addEdge(
    new Edge(
      createEdgeId("edge-001"),
      new Connection(
        { nodeId: createNodeId("node-001"), portId: "out" },
        { nodeId: createNodeId("node-002"), portId: "in" },
      ),
      "example.flow",
      "main flow",
    ),
  );
  return graph;
}

const graph = sampleGraph();

// 1. Export the domain graph into the portable GGD contract.
const document = graphToDocument(graph);
console.log("--- Portable document (JSON) ---");
const json = serializeJson(document);
console.log(json.ok ? json.value : JSON.stringify(json.error));
console.log("--- Portable document (YAML) ---");
const yaml = serializeYaml(document);
console.log(yaml.ok ? yaml.value : JSON.stringify(yaml.error));

// 2. Structural document validation of a malformed payload.
const broken = validateGraphDocument({ version: "nope", graph: "nope" });
console.log("--- Validation of a malformed document ---");
console.log(
  broken.isValid ? "valid" : broken.issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"),
);

// 3. Parse both formats back and rebuild the graph.
const fromJson = parseJsonDocument(json.ok ? json.value : "{}");
const fromYaml = parseYamlDocument(yaml.ok ? yaml.value : "{}");
if (!fromJson.ok || !fromYaml.ok) {
  console.error("Parsing the demo document failed");
  process.exit(1);
}
const jsonGraph = documentToGraph(fromJson.value);
const yamlGraph = documentToGraph(fromYaml.value);
if (!jsonGraph.ok || !yamlGraph.ok) {
  console.error("Rebuilding the graph failed", jsonGraph.ok ? [] : jsonGraph.error);
  process.exit(1);
}

// Both formats describe the same logical model, so both rebuild equal graphs.
const normalize = (source: Graph) =>
  normalizeGraphDocument(graphToDocument(source, { formatVersion: document.version }));
const jsonShape = normalize(jsonGraph.value);
const yamlShape = normalize(yamlGraph.value);
console.log("--- Round-trip result ---");
console.log(
  `JSON and YAML rebuild equal graphs: ${JSON.stringify(jsonShape) === JSON.stringify(yamlShape)}`,
);
console.log(`Nodes: ${jsonGraph.value.nodeCount}, edges: ${jsonGraph.value.edgeCount}`);
const firstNode = jsonGraph.value.getNode(createNodeId("node-001"));
console.log(
  `Node "node-001": type=${firstNode?.definitionId}, value=${JSON.stringify(firstNode?.getProperties()["value"])}, position=${JSON.stringify(firstNode?.position)}`,
);
