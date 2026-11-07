/**
 * Validation pipeline use cases: ValidateGraph, ValidateNode,
 * ValidateConnection.
 *
 * All of them run through the composed validation context of the domain
 * facade (structural + domain validators), never with ad-hoc logic, and emit
 * `validation.completed` for the graph-level report.
 */

import { createEdgeId, createNodeId, err, ok, type Result } from "@nodera/contracts";
import { Edge, Connection } from "@nodera/graph-model";
import type { ValidationLevel, ValidationReport } from "@nodera/validation";
import type { ValidationIssue } from "@nodera/contracts";
import type { EditorEngine } from "../editor-engine.js";
import type { UseCaseError } from "./errors.js";

export interface ValidateGraphInput {
  readonly levels?: readonly ValidationLevel[];
}

/** Validates the whole graph and emits `validation.completed`. */
export function validateGraph(
  editor: EditorEngine,
  input: ValidateGraphInput = {},
): ValidationReport {
  const options: { levels?: readonly ValidationLevel[] } = {};
  if (input.levels !== undefined) {
    options.levels = input.levels;
  }
  const report = editor.domain.validate(editor.graph, options);
  editor.events.emit({ name: "validation.completed", payload: { report } });
  return report;
}

export interface ValidateNodeInput {
  readonly nodeId: string;
}

export interface ElementValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
}

/** Validates one node: the issues of the full report that point at it. */
export function validateNode(
  editor: EditorEngine,
  input: ValidateNodeInput,
): Result<ElementValidationResult, UseCaseError> {
  const nodeId = createNodeId(input.nodeId);
  if (editor.graph.getNode(nodeId) === undefined) {
    return err({
      kind: "node-not-found",
      message: `Graph has no node with id "${input.nodeId}"`,
      elementId: input.nodeId,
    });
  }
  const report = editor.domain.validate(editor.graph);
  const issues = report.issues.filter((issue) => issue.elementId === nodeId);
  return ok({ valid: issues.length === 0, issues });
}

export interface ValidateConnectionInput {
  readonly source: { readonly nodeId: string; readonly portId: string };
  readonly target: { readonly nodeId: string; readonly portId: string };
}

/**
 * Validates a prospective connection without persisting it: a tentative edge
 * is checked by the graph's structural rules and, when admitted, the full
 * validation pipeline runs and the issues pointing at the tentative edge are
 * reported. The graph and the history are left untouched.
 */
export function validateConnection(
  editor: EditorEngine,
  input: ValidateConnectionInput,
): Result<ElementValidationResult, UseCaseError> {
  const sourceNodeId = createNodeId(input.source.nodeId);
  const targetNodeId = createNodeId(input.target.nodeId);
  if (editor.graph.getNode(sourceNodeId) === undefined) {
    return err({
      kind: "node-not-found",
      message: `Graph has no node with id "${input.source.nodeId}"`,
      elementId: input.source.nodeId,
    });
  }
  if (editor.graph.getNode(targetNodeId) === undefined) {
    return err({
      kind: "node-not-found",
      message: `Graph has no node with id "${input.target.nodeId}"`,
      elementId: input.target.nodeId,
    });
  }
  let edge: Edge;
  try {
    edge = new Edge(
      createEdgeId("validation-probe"),
      new Connection(
        { nodeId: sourceNodeId, portId: input.source.portId },
        { nodeId: targetNodeId, portId: input.target.portId },
      ),
    );
  } catch (error) {
    return ok({
      valid: false,
      issues: [
        {
          code: "application.invalid-connection",
          severity: "error",
          message: error instanceof Error ? error.message : "invalid connection",
          elementId: "validation-probe",
        },
      ],
    });
  }
  const added = editor.graph.addEdge(edge);
  if (!added.ok) {
    return ok({
      valid: false,
      issues: [
        {
          code: `application.${added.error.kind}`,
          severity: "error",
          message: added.error.message,
          elementId: "validation-probe",
        },
      ],
    });
  }
  const report = editor.domain.validate(editor.graph);
  editor.graph.removeEdge(edge.id);
  const issues = report.issues.filter((issue) => issue.elementId === "validation-probe");
  return ok({ valid: issues.length === 0, issues });
}
