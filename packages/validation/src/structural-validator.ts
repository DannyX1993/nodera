import type { ValidationIssue } from "@nodera/contracts";
import type { GraphValidator, ValidationContext } from "./context.js";

/**
 * Structural validation: duplicate identifiers, nonexistent nodes, invalid
 * connections, missing ports and inconsistent references.
 *
 * The graph entity already rejects most of these at mutation time; the
 * validator re-checks from data so the same rules guard imported documents
 * and programmatically assembled graphs alike.
 */
export const structuralValidator: GraphValidator = {
  id: "nodera.structural",
  level: "structural",
  validate(context: ValidationContext): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const { graph, nodes, edges } = context;

    issues.push(...duplicateNodeIds(graph));
    issues.push(...duplicateEdgeIds(graph));

    for (const node of graph.getNodes()) {
      if (!nodes.has(node.definitionId)) {
        issues.push({
          code: "structural.unknown-node-definition",
          severity: "error",
          message: `Node "${node.id}" references unregistered node definition "${node.definitionId}"`,
          elementId: node.id,
          metadata: { definitionId: node.definitionId },
        });
      }
    }

    for (const edge of graph.getEdges()) {
      const { source, target } = edge.connection;
      if (graph.getNode(source.nodeId) === undefined) {
        issues.push({
          code: "structural.missing-node",
          severity: "error",
          message: `Edge "${edge.id}" references nonexistent source node "${source.nodeId}"`,
          elementId: edge.id,
          metadata: { endpoint: "source", nodeId: source.nodeId },
        });
      } else {
        const sourceNode = graph.getNode(source.nodeId);
        if (sourceNode !== undefined && !sourceNode.hasPort(source.portId)) {
          issues.push({
            code: "structural.missing-port",
            severity: "error",
            message: `Edge "${edge.id}" references missing source port "${source.portId}" on node "${source.nodeId}"`,
            elementId: edge.id,
            metadata: { endpoint: "source", nodeId: source.nodeId, portId: source.portId },
          });
        }
      }
      if (graph.getNode(target.nodeId) === undefined) {
        issues.push({
          code: "structural.missing-node",
          severity: "error",
          message: `Edge "${edge.id}" references nonexistent target node "${target.nodeId}"`,
          elementId: edge.id,
          metadata: { endpoint: "target", nodeId: target.nodeId },
        });
      } else {
        const targetNode = graph.getNode(target.nodeId);
        if (targetNode !== undefined && !targetNode.hasPort(target.portId)) {
          issues.push({
            code: "structural.missing-port",
            severity: "error",
            message: `Edge "${edge.id}" references missing target port "${target.portId}" on node "${target.nodeId}"`,
            elementId: edge.id,
            metadata: { endpoint: "target", nodeId: target.nodeId, portId: target.portId },
          });
        }
      }
      if (edge.definitionId !== undefined && !edges.has(edge.definitionId)) {
        issues.push({
          code: "structural.unknown-edge-definition",
          severity: "error",
          message: `Edge "${edge.id}" references unregistered edge definition "${edge.definitionId}"`,
          elementId: edge.id,
          metadata: { definitionId: edge.definitionId },
        });
      }
    }
    return issues;
  },
};

function duplicateNodeIds(graph: Parameters<GraphValidator["validate"]>[0]["graph"]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const node of graph.getNodes()) {
    if (seen.has(node.id)) {
      issues.push({
        code: "structural.duplicate-node-id",
        severity: "error",
        message: `Node id "${node.id}" is duplicated`,
        elementId: node.id,
      });
    }
    seen.add(node.id);
  }
  return issues;
}

function duplicateEdgeIds(graph: Parameters<GraphValidator["validate"]>[0]["graph"]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const edge of graph.getEdges()) {
    if (seen.has(edge.id)) {
      issues.push({
        code: "structural.duplicate-edge-id",
        severity: "error",
        message: `Edge id "${edge.id}" is duplicated`,
        elementId: edge.id,
      });
    }
    seen.add(edge.id);
  }
  return issues;
}
