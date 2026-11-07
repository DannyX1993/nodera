import type { NodeId, ValidationIssue } from "@nodera/contracts";
import type { Edge, PortDeclaration } from "@nodera/graph-model";
import type { NodeDefinition } from "@nodera/node-registry";
import { validatePropertyValues } from "@nodera/property-system";
import type { GraphValidator, ValidationContext } from "./context.js";

/**
 * Domain validation: node-type restrictions, connection cardinality, port
 * type compatibility, per-definition rules and required properties.
 *
 * A graph can be structurally valid and still misconfigured; this validator
 * reports configuration errors so both states are never conflated.
 */
export const domainValidator: GraphValidator = {
  id: "nodera.domain",
  level: "domain",
  validate(context: ValidationContext): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const { graph, nodes, edges, validators } = context;

    for (const node of graph.getNodes()) {
      const definition = nodes.get(node.definitionId);
      if (definition === undefined) {
        // Unknown definitions are a structural finding; skip domain rules.
        continue;
      }
      issues.push(...validateRequiredProperties(node.id, definition, node.getProperties()));
      issues.push(...validateConnectionPolicy(graph, node.id, definition));
      issues.push(...validatePortCardinality(graph, node.id, definition));
      for (const ruleId of definition.validationRuleIds ?? []) {
        const rule = validators.getNodeRule(ruleId);
        if (rule === undefined) {
          issues.push({
            code: "domain.unknown-node-rule",
            severity: "error",
            message: `Node "${node.id}" references unknown validation rule "${ruleId}"`,
            elementId: node.id,
            metadata: { ruleId },
          });
          continue;
        }
        for (const partial of rule.validate({ node: { id: node.id }, definition, graph, edges })) {
          issues.push({
            ...partial,
            severity: rule.severity,
            elementId: node.id,
          });
        }
      }
      issues.push(...validatePropertyRules(node.id, definition, node.getProperties(), validators));
      issues.push(...validatePropertyConditions(node.id, definition, node.getProperties(), validators));
    }

    for (const edge of graph.getEdges()) {
      issues.push(...validateEdgeEndpoints(context, edge));
      issues.push(...validateEdgeDefinitionRestrictions(context, edge));
      issues.push(...validateConnectionConditions(context, edge));
    }
    issues.push(...unknownConnectionConditionIds(context));
    return issues;
  },
};

function issue(
  code: string,
  message: string,
  elementId: string,
  metadata: Record<string, unknown>,
): ValidationIssue {
  return { code, severity: "error", message, elementId, metadata };
}

/**
 * Reports port declarations and edge definitions whose custom connection
 * condition id has no registered evaluator, even without connections.
 */
function unknownConnectionConditionIds(context: ValidationContext): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { graph, nodes, edges, validators } = context;
  const reported = new Set<string>();
  const report = (conditionId: string, elementId: string, kind: string): void => {
    if (reported.has(`${kind}:${conditionId}`)) {
      return;
    }
    reported.add(`${kind}:${conditionId}`);
    issues.push(
      issue(
        "domain.unknown-condition",
        `Custom condition "${conditionId}" referenced by ${kind} "${elementId}" has no registered evaluator`,
        elementId,
        { conditionId, conditionKind: kind },
      ),
    );
  };
  for (const node of graph.getNodes()) {
    const definition = nodes.get(node.definitionId);
    for (const port of definition?.ports ?? []) {
      if (port.customConditionId !== undefined && validators.getConnectionCondition(port.customConditionId) === undefined) {
        report(port.customConditionId, node.id, `port "${port.id}" of node`);
      }
    }
  }
  for (const edge of graph.getEdges()) {
    if (edge.definitionId === undefined) {
      continue;
    }
    const definition = edges.get(edge.definitionId);
    if (definition?.conditionId !== undefined && validators.getConnectionCondition(definition.conditionId) === undefined) {
      report(definition.conditionId, edge.id, `edge definition "${definition.id}" on edge`);
    }
  }
  return issues;
}

/**
 * Evaluates registered custom conditions for one edge: those declared on its
 * endpoint ports and on its edge definition. Each condition runs once per
 * edge; a failing condition is a domain error.
 */
function validateConnectionConditions(context: ValidationContext, edge: Edge): readonly ValidationIssue[] {
  const { graph, nodes, edges, validators } = context;
  const issues: ValidationIssue[] = [];
  const { source, target } = edge.connection;
  const sourceNode = graph.getNode(source.nodeId);
  const targetNode = graph.getNode(target.nodeId);
  const edgeDefinition = edge.definitionId === undefined ? undefined : edges.get(edge.definitionId);
  const checks: readonly { readonly conditionId: string | undefined; readonly role: "source" | "target" | "definition" }[] = [
    {
      conditionId: sourceNode === undefined
        ? undefined
        : nodes.get(sourceNode.definitionId)?.ports.find((p) => p.id === source.portId)?.customConditionId,
      role: "source",
    },
    {
      conditionId: targetNode === undefined
        ? undefined
        : nodes.get(targetNode.definitionId)?.ports.find((p) => p.id === target.portId)?.customConditionId,
      role: "target",
    },
    { conditionId: edgeDefinition?.conditionId, role: "definition" },
  ];
  const evaluated = new Set<string>();
  const input = {
    edgeId: edge.id,
    sourceNodeId: source.nodeId,
    sourcePortId: source.portId,
    targetNodeId: target.nodeId,
    targetPortId: target.portId,
  };
  for (const check of checks) {
    const conditionId = check.conditionId;
    if (conditionId === undefined || evaluated.has(conditionId)) {
      continue;
    }
    evaluated.add(conditionId);
    const condition = validators.getConnectionCondition(conditionId);
    if (condition !== undefined && !condition.evaluate(input)) {
      issues.push(
        issue(
          "domain.custom-condition-failed",
          `Connection "${edge.id}" does not satisfy custom condition "${conditionId}"`,
          edge.id,
          { conditionId, role: check.role },
        ),
      );
    }
  }
  return issues;
}

/**
 * Runs custom property validation rules referenced by definitions and
 * reports unknown rule ids: a declared reference must resolve or be reported.
 */
function validatePropertyRules(
  nodeId: string,
  definition: NodeDefinition,
  values: Readonly<Record<string, unknown>>,
  validators: ValidationContext["validators"],
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const property of definition.properties) {
    for (const validation of property.validations ?? []) {
      if (validation.kind !== "custom") {
        continue;
      }
      const rule = validators.getPropertyRule(validation.validatorId);
      if (rule === undefined) {
        issues.push(
          issue(
            "domain.unknown-property-rule",
            `Property "${property.id}" of node "${nodeId}" references unknown validation rule "${validation.validatorId}"`,
            nodeId,
            { propertyId: property.id, ruleId: validation.validatorId },
          ),
        );
        continue;
      }
      for (const partial of rule.validate({ definition: property, value: values[property.id] })) {
        issues.push({
          ...partial,
          severity: rule.severity,
          elementId: nodeId,
          metadata: { propertyId: property.id, ruleId: validation.validatorId },
        });
      }
    }
  }
  return issues;
}

/**
 * Reports custom visibility/editability condition ids without a registered
 * evaluator. Registered conditions are presentation concerns and are not
 * asserted here.
 */
function validatePropertyConditions(
  nodeId: string,
  definition: NodeDefinition,
  values: Readonly<Record<string, unknown>>,
  validators: ValidationContext["validators"],
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const property of definition.properties) {
    const conditions = [property.visibleWhen, property.enabledWhen];
    for (const condition of conditions) {
      if (condition?.kind !== "custom") {
        continue;
      }
      if (validators.getPropertyCondition(condition.conditionId) === undefined) {
        issues.push(
          issue(
            "domain.unknown-property-condition",
            `Property "${property.id}" of node "${nodeId}" references unknown condition "${condition.conditionId}"`,
            nodeId,
            { propertyId: property.id, conditionId: condition.conditionId },
          ),
        );
      }
    }
  }
  return issues;
}

function validateRequiredProperties(
  nodeId: string,
  definition: NodeDefinition,
  values: Readonly<Record<string, unknown>>,
): readonly ValidationIssue[] {
  return validatePropertyValues(definition.properties, values, { elementId: nodeId }).map(
    (i) => ({ ...i, code: `domain.${i.code}` }),
  );
}

function validateConnectionPolicy(
  graph: ValidationContext["graph"],
  nodeId: NodeId,
  definition: NodeDefinition,
): readonly ValidationIssue[] {
  const policy = definition.connectionPolicy;
  if (policy === undefined) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  const attached = graph.getEdgesOf(nodeId);
  const incoming = attached.filter((e) => e.connection.target.nodeId === nodeId).length;
  const outgoing = attached.filter((e) => e.connection.source.nodeId === nodeId).length;
  if (policy.incoming === "forbid" && incoming > 0) {
    issues.push(
      issue(
        "domain.incoming-forbidden",
        `Node "${nodeId}" of definition "${definition.id}" does not accept incoming connections`,
        nodeId,
        { definitionId: definition.id },
      ),
    );
  }
  if (policy.outgoing === "forbid" && outgoing > 0) {
    issues.push(
      issue(
        "domain.outgoing-forbidden",
        `Node "${nodeId}" of definition "${definition.id}" does not accept outgoing connections`,
        nodeId,
        { definitionId: definition.id },
      ),
    );
  }
  return issues;
}

function effectiveMaxConnections(port: PortDeclaration): number | null {
  if (port.maxConnections !== undefined) {
    return port.maxConnections;
  }
  return port.multiplicity === "multiple" ? null : 1;
}

function validatePortCardinality(
  graph: ValidationContext["graph"],
  nodeId: NodeId,
  definition: NodeDefinition,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const port of definition.ports) {
    const attached = graph
      .getEdgesOf(nodeId)
      .filter(
        (edge) =>
          (edge.connection.source.nodeId === nodeId &&
            edge.connection.source.portId === port.id) ||
          (edge.connection.target.nodeId === nodeId &&
            edge.connection.target.portId === port.id),
      );
    const count = attached.length;
    const min = port.minConnections ?? 0;
    const max = effectiveMaxConnections(port);
    if (count < min) {
      issues.push(
        issue(
          "domain.port-under-min",
          `Port "${port.id}" of node "${nodeId}" requires at least ${min} connection(s), has ${count}`,
          nodeId,
          { portId: port.id, min, count },
        ),
      );
    }
    if (max !== null && count > max) {
      issues.push(
        issue(
          "domain.port-over-max",
          `Port "${port.id}" of node "${nodeId}" accepts at most ${max} connection(s), has ${count}`,
          nodeId,
          { portId: port.id, max, count },
        ),
      );
    }
  }
  return issues;
}

function portDirectionCompatible(
  direction: PortDeclaration["direction"],
  endpoint: "source" | "target",
): boolean {
  if (direction === "bidirectional") {
    return true;
  }
  return endpoint === "source" ? direction === "output" : direction === "input";
}

function validateEdgeEndpoints(
  context: ValidationContext,
  edge: Edge,
): readonly ValidationIssue[] {
  const { graph, nodes } = context;
  const issues: ValidationIssue[] = [];
  const { source, target } = edge.connection;
  const sourceNode = graph.getNode(source.nodeId);
  const targetNode = graph.getNode(target.nodeId);
  if (sourceNode === undefined || targetNode === undefined) {
    return issues; // Structural findings already cover this.
  }
  const sourceDefinition = nodes.get(sourceNode.definitionId);
  const targetDefinition = nodes.get(targetNode.definitionId);
  const sourcePort = sourceDefinition?.ports.find((p) => p.id === source.portId);
  const targetPort = targetDefinition?.ports.find((p) => p.id === target.portId);

  if (sourcePort !== undefined && !portDirectionCompatible(sourcePort.direction, "source")) {
    issues.push(
      issue(
        "domain.port-direction",
        `Port "${source.portId}" of node "${source.nodeId}" is not usable as a connection source`,
        edge.id,
        { nodeId: source.nodeId, portId: source.portId },
      ),
    );
  }
  if (targetPort !== undefined && !portDirectionCompatible(targetPort.direction, "target")) {
    issues.push(
      issue(
        "domain.port-direction",
        `Port "${target.portId}" of node "${target.nodeId}" is not usable as a connection target`,
        edge.id,
        { nodeId: target.nodeId, portId: target.portId },
      ),
    );
  }
  issues.push(...validateDataTypeCompatibility(source, target, sourcePort, targetPort, edge));
  issues.push(...validateAllowedNodeDefinitions(source, target, sourceNode.definitionId, targetNode.definitionId, sourcePort, targetPort, edge));
  return issues;
}

function validateDataTypeCompatibility(
  source: Edge["connection"]["source"],
  target: Edge["connection"]["target"],
  sourcePort: PortDeclaration | undefined,
  targetPort: PortDeclaration | undefined,
  edge: Edge,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (sourcePort === undefined || targetPort === undefined) {
    return issues;
  }
  const sourceType = sourcePort.dataType;
  const targetType = targetPort.dataType;
  const targetAllows = targetPort.allowedDataTypes;
  if (sourceType !== undefined && targetType !== undefined && sourceType !== targetType) {
    const toleratedByTarget = targetAllows?.includes(sourceType) === true;
    const toleratedBySource = sourcePort.allowedDataTypes?.includes(targetType) === true;
    if (!toleratedByTarget && !toleratedBySource) {
      issues.push(
        issue(
          "domain.data-type-mismatch",
          `Connection on edge "${edge.id}" joins data types "${sourceType}" and "${targetType}"`,
          edge.id,
          { sourcePort: `${source.nodeId}:${source.portId}`, targetPort: `${target.nodeId}:${target.portId}` },
        ),
      );
    }
  }
  return issues;
}

function validateAllowedNodeDefinitions(
  source: Edge["connection"]["source"],
  target: Edge["connection"]["target"],
  sourceDefinitionId: string,
  targetDefinitionId: string,
  sourcePort: PortDeclaration | undefined,
  targetPort: PortDeclaration | undefined,
  edge: Edge,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (targetPort?.allowedNodeDefinitionIds !== undefined &&
      !targetPort.allowedNodeDefinitionIds.includes(sourceDefinitionId)) {
    issues.push(
      issue(
        "domain.node-type-not-allowed",
        `Target port "${target.portId}" of node "${target.nodeId}" does not accept source nodes of definition "${sourceDefinitionId}"`,
        edge.id,
        { sourceNodeId: source.nodeId, targetNodeId: target.nodeId },
      ),
    );
  }
  if (sourcePort?.allowedNodeDefinitionIds !== undefined &&
      !sourcePort.allowedNodeDefinitionIds.includes(targetDefinitionId)) {
    issues.push(
      issue(
        "domain.node-type-not-allowed",
        `Source port "${source.portId}" of node "${source.nodeId}" does not accept target nodes of definition "${targetDefinitionId}"`,
        edge.id,
        { sourceNodeId: source.nodeId, targetNodeId: target.nodeId },
      ),
    );
  }
  return issues;
}

function validateEdgeDefinitionRestrictions(
  context: ValidationContext,
  edge: Edge,
): readonly ValidationIssue[] {
  if (edge.definitionId === undefined) {
    return [];
  }
  const definition = context.edges.get(edge.definitionId);
  if (definition === undefined) {
    // Unknown edge definitions are reported by structural validation.
    return [];
  }
  const issues: ValidationIssue[] = [];
  const { source, target } = edge.connection;
  const sourceNode = context.graph.getNode(source.nodeId);
  const targetNode = context.graph.getNode(target.nodeId);
  if (
    sourceNode !== undefined &&
    definition.allowedSourceNodeDefinitionIds !== undefined &&
    !definition.allowedSourceNodeDefinitionIds.includes(sourceNode.definitionId)
  ) {
    issues.push(
      issue(
        "domain.source-node-type-not-allowed",
        `Edge definition "${definition.id}" does not allow source nodes of definition "${sourceNode.definitionId}"`,
        edge.id,
        { sourceNodeId: source.nodeId },
      ),
    );
  }
  if (
    targetNode !== undefined &&
    definition.allowedTargetNodeDefinitionIds !== undefined &&
    !definition.allowedTargetNodeDefinitionIds.includes(targetNode.definitionId)
  ) {
    issues.push(
      issue(
        "domain.target-node-type-not-allowed",
        `Edge definition "${definition.id}" does not allow target nodes of definition "${targetNode.definitionId}"`,
        edge.id,
        { targetNodeId: target.nodeId },
      ),
    );
  }
  return issues;
}

