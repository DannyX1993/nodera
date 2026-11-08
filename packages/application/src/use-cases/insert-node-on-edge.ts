/**
 * Insert-node-on-edge use case: one node plus two edges replacing one edge.
 *
 * The graph keeps its connectivity: the original relation `source --e--> target`
 * becomes `source --> node --> target`, reusing the original source and target
 * ports on the two halves and the new node's own input and output port in the
 * middle. A host that renders a "+" affordance on an edge (odd S6) calls this
 * one use case; nothing here knows about a canvas, a dialog or a button.
 *
 * One history unit, labelled `insert-node-on-edge` (AGENTS.md §12): `apply` adds
 * the node and both edges and removes the original, `reverse` restores the
 * original edge, removes both halves and removes the node, so one undo puts the
 * graph back exactly as it was, including the original edge's id and ports.
 *
 * All-or-nothing (AGENTS.md §13): the edge, the definition, the instance id and
 * both middle ports are validated before anything is created, and a structural
 * refusal while the two halves are written rolls the node back. A refused
 * request writes nothing, pushes nothing and emits nothing.
 *
 * It is built from the same domain primitives `addNode`, `createEdge` and
 * `removeEdge` use — and never calls those use cases, because each of them
 * pushes a history unit of its own.
 */

import { createEdgeId, createNodeId, err, ok, type Result } from "@nodera/contracts";
import {
  Connection,
  Edge,
  type Node,
  type NodePosition,
  type PortDeclaration,
  type PortDirection,
} from "@nodera/graph-model";
import type { EditorEngine } from "../editor-engine.js";
import { emitChanged, toUseCaseError, type UseCaseError } from "./errors.js";

/** Direction a middle port may declare to carry one side of the relation. */
const INCOMING_DIRECTIONS: readonly PortDirection[] = ["input", "bidirectional"];
const OUTGOING_DIRECTIONS: readonly PortDirection[] = ["output", "bidirectional"];

export interface InsertNodeOnEdgeInput {
  /** Edge the node is inserted into; it is replaced by the two halves. */
  readonly edgeId: string;
  /** Registered node definition the inserted instance is created from. */
  readonly definitionId: string;
  /** Explicit instance id; generated from the definition when omitted. */
  readonly nodeId?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  /** Presentation position; the host (or the SDK) decides it before this runs. */
  readonly position?: NodePosition;
}

export interface InsertNodeOnEdgeResult {
  readonly node: Node;
  /** The two edges replacing the original, in flow order: source → node, node → target. */
  readonly edges: readonly [Edge, Edge];
  /** The edge this insertion removed; `undo` restores it with the same id. */
  readonly replacedEdge: Edge;
}

/**
 * Inserts a node on an existing edge as a single reversible unit.
 *
 * The two new edges inherit the original edge's definition type, because an
 * edge type is the semantic kind of the relation and both halves still carry
 * it. The original label and metadata describe the single original relation and
 * are not duplicated onto the halves, where they would be half-true.
 */
export function insertNodeOnEdge(
  editor: EditorEngine,
  input: InsertNodeOnEdgeInput,
): Result<InsertNodeOnEdgeResult, UseCaseError> {
  // --- Validate everything before the first write -------------------------
  const replacedEdge = editor.graph.getEdge(createEdgeId(input.edgeId));
  if (replacedEdge === undefined) {
    return err({
      kind: "edge-not-found",
      message: `Graph has no edge with id "${input.edgeId}"`,
      elementId: input.edgeId,
    });
  }
  const definition = editor.domain.nodes.get(input.definitionId);
  if (definition === undefined) {
    return err({
      kind: "node-definition-not-found",
      message: `No node definition registered with id "${input.definitionId}"`,
    });
  }
  if (
    input.nodeId !== undefined &&
    editor.graph.getNode(createNodeId(input.nodeId)) !== undefined
  ) {
    return err({
      kind: "duplicate-node-id",
      message: `Graph already contains a node with id "${input.nodeId}"`,
      elementId: input.nodeId,
    });
  }
  // The original endpoints are already valid: the graph accepted the edge. What
  // the insertion adds is the node's own two ports, one per half.
  const incomingPort = firstPort(definition.ports, INCOMING_DIRECTIONS);
  if (incomingPort === undefined) {
    return err({
      kind: "invalid-input",
      message:
        `Node definition "${input.definitionId}" declares no input port to receive ` +
        `the connection from node "${replacedEdge.connection.source.nodeId}"`,
      elementId: input.definitionId,
    });
  }
  const outgoingPort = firstPort(definition.ports, OUTGOING_DIRECTIONS);
  if (outgoingPort === undefined) {
    return err({
      kind: "invalid-input",
      message:
        `Node definition "${input.definitionId}" declares no output port to reach ` +
        `node "${replacedEdge.connection.target.nodeId}"`,
      elementId: input.definitionId,
    });
  }

  // --- Create, writing only through the graph's own primitives -------------
  const created = editor.domain.createNode(editor.graph, input.definitionId, {
    ...(input.nodeId === undefined ? {} : { nodeId: input.nodeId }),
    ...(input.properties === undefined ? {} : { properties: input.properties }),
    ...(input.position === undefined ? {} : { position: input.position }),
  });
  if (!created.ok) {
    return err(toUseCaseError(created.error));
  }
  const node = created.value;
  let halves: readonly [Edge, Edge];
  try {
    halves = [
      new Edge(
        createEdgeId(nextEdgeId()),
        new Connection(
          {
            nodeId: replacedEdge.connection.source.nodeId,
            portId: replacedEdge.connection.source.portId,
          },
          { nodeId: node.id, portId: incomingPort.id },
        ),
        replacedEdge.definitionId,
      ),
      new Edge(
        createEdgeId(nextEdgeId()),
        new Connection(
          { nodeId: node.id, portId: outgoingPort.id },
          {
            nodeId: replacedEdge.connection.target.nodeId,
            portId: replacedEdge.connection.target.portId,
          },
        ),
        replacedEdge.definitionId,
      ),
    ];
  } catch (error) {
    editor.graph.removeNode(node.id);
    return err({
      kind: "invalid-input",
      message: error instanceof Error ? error.message : "invalid connection",
      elementId: input.definitionId,
    });
  }
  // The graph's structural rules answer before the history does, so a refusal
  // can still report itself: the node and any half already written are undone.
  const firstAdded = editor.graph.addEdge(halves[0]);
  if (!firstAdded.ok) {
    editor.graph.removeNode(node.id);
    return err(toUseCaseError(firstAdded.error));
  }
  const secondAdded = editor.graph.addEdge(halves[1]);
  if (!secondAdded.ok) {
    editor.graph.removeEdge(halves[0].id);
    editor.graph.removeNode(node.id);
    return err(toUseCaseError(secondAdded.error));
  }

  // --- One history unit ---------------------------------------------------
  // `push` runs `apply` immediately. At that moment the node and both halves are
  // already in the graph — created and accepted just above — so their add is a
  // no-op whose duplicate rejection is the expected outcome, exactly like the
  // sibling `add-node` and `create-edge` commands. On redo they are re-added.
  editor.history.push(editor.editorState, {
    label: "insert-node-on-edge",
    apply: () => {
      editor.graph.addNode(node);
      editor.graph.addEdge(halves[0]);
      editor.graph.addEdge(halves[1]);
      editor.graph.removeEdge(replacedEdge.id);
    },
    reverse: () => {
      editor.graph.addEdge(replacedEdge);
      editor.graph.removeEdge(halves[0].id);
      editor.graph.removeEdge(halves[1].id);
      editor.graph.removeNode(node.id);
    },
  });
  editor.events.emit({
    name: "node.created",
    payload: { nodeId: node.id, definitionId: node.definitionId },
  });
  for (const half of halves) {
    editor.events.emit({ name: "edge.created", payload: { edgeId: half.id } });
  }
  editor.events.emit({ name: "edge.deleted", payload: { edgeId: replacedEdge.id } });
  emitChanged(editor, "insert-node-on-edge");
  return ok({ node, edges: halves, replacedEdge });
}

/** First declaration facing one of the given directions, in declaration order. */
function firstPort(
  ports: readonly PortDeclaration[],
  directions: readonly PortDirection[],
): PortDeclaration | undefined {
  return ports.find((port) => directions.includes(port.direction));
}

/**
 * Edge id for one of the two halves, in the shape the edge use cases generate.
 * A collision is refused by the graph like any other duplicate id, and the
 * insertion rolls back.
 */
function nextEdgeId(): string {
  return `edge-${Math.random().toString(36).slice(2, 10)}`;
}
