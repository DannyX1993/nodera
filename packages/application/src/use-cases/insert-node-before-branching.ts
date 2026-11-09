/**
 * Insert-node-before-branching use case: one node inserted between a parent and
 * **all** of its successors.
 *
 * The graph keeps its shape: `parent --a--> s1`, `parent --b--> s2` becomes
 * `parent --> node --> s1`, `node --> s2`, so a single insertion replaces the
 * whole split instead of one branch of it. It is what the branching "+" the host
 * can enable draws (odd S23): the affordance sits before the split, so the
 * operation it activates handles the split as one relation.
 *
 * The relation the insertion writes takes its endpoints from the edges that were
 * replaced — the parent's port from its outgoing edge, each successor's port from
 * its own — and its definition type from the first of them, because the
 * definition type is the semantic kind of the relation and every branch carries
 * it. A relation whose endpoints (nodes **and** ports) are already written is
 * skipped: two equivalent successor edges collapse into one relation from the
 * inserted node, instead of leaving a duplicate behind.
 *
 * One history unit, labelled `insert-node-before-branching` (AGENTS.md §12):
 * `apply` adds the node and the new edges and removes the replaced ones,
 * `reverse` re-adds the replaced edges, removes the new ones and removes the
 * node, so one undo puts the graph back exactly as it was, ids and ports
 * included.
 *
 * All-or-nothing (AGENTS.md §13): the parent, the definition, the instance id and
 * both of the node's ports are validated before anything is created, and a
 * structural refusal while an edge is written rolls the node and every edge
 * already written back. A refused request writes nothing, pushes nothing and
 * emits nothing. A parent with no successor is the degenerate one-edge case: the
 * node is created and the parent is joined to it, still in one unit; the SDK
 * routes that shape to the ordinary append instead (S23).
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

export interface InsertNodeBeforeBranchingInput {
  /** Parent node whose outgoing edges the new node is inserted before. */
  readonly nodeId: string;
  /** Registered node definition the inserted instance is created from. */
  readonly definitionId: string;
  /** Explicit instance id; generated from the definition when omitted. */
  readonly newNodeId?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  /** Presentation position; the host (or the SDK) decides it before this runs. */
  readonly position?: NodePosition;
}

export interface InsertNodeBeforeBranchingResult {
  readonly node: Node;
  /** The one edge from the parent to the inserted node. */
  readonly edge: Edge;
  /** One edge per former successor relation, all leaving from the inserted node. */
  readonly edges: readonly Edge[];
  /** Every edge the insertion replaced; `undo` restores them with the same ids. */
  readonly replacedEdges: readonly Edge[];
}

/**
 * Inserts one node between a parent and all of its successors, as a single
 * reversible unit.
 */
export function insertNodeBeforeBranching(
  editor: EditorEngine,
  input: InsertNodeBeforeBranchingInput,
): Result<InsertNodeBeforeBranchingResult, UseCaseError> {
  // --- Validate everything before the first write -------------------------
  const parent = editor.graph.getNode(createNodeId(input.nodeId));
  if (parent === undefined) {
    return err({
      kind: "node-not-found",
      message: `Graph has no node with id "${input.nodeId}"`,
      elementId: input.nodeId,
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
    input.newNodeId !== undefined &&
    editor.graph.getNode(createNodeId(input.newNodeId)) !== undefined
  ) {
    return err({
      kind: "duplicate-node-id",
      message: `Graph already contains a node with id "${input.newNodeId}"`,
      elementId: input.newNodeId,
    });
  }
  const incomingPort = firstPort(definition.ports, INCOMING_DIRECTIONS);
  if (incomingPort === undefined) {
    return err({
      kind: "invalid-input",
      message:
        `Node definition "${input.definitionId}" declares no input port to receive ` +
        `the connection from node "${input.nodeId}"`,
      elementId: input.definitionId,
    });
  }
  const outgoingPort = firstPort(definition.ports, OUTGOING_DIRECTIONS);
  if (outgoingPort === undefined) {
    return err({
      kind: "invalid-input",
      message:
        `Node definition "${input.definitionId}" declares no output port to reach ` +
        `the successors of node "${input.nodeId}"`,
      elementId: input.definitionId,
    });
  }

  // --- Decide every edge, still writing nothing ---------------------------
  const replacedEdges = editor.graph
    .getEdgesOf(parent.id)
    .filter((edge) => edge.connection.source.nodeId === parent.id);
  // The type the parent's outgoing relation carries is the one the insertion
  // passes on; with no successor there is no relation to inherit it from.
  const definitionId = replacedEdges[0]?.definitionId;

  // Every relation that stays in the graph is a reason to skip a pair, and so is
  // a pair this operation has just decided to write.
  const leaving = new Set(replacedEdges.map((edge) => String(edge.id)));
  const taken = new Set<string>();
  for (const edge of editor.graph.getEdges()) {
    if (!leaving.has(String(edge.id))) {
      taken.add(endpointsKey(edge));
    }
  }

  const created = editor.domain.createNode(editor.graph, input.definitionId, {
    ...(input.newNodeId === undefined ? {} : { nodeId: input.newNodeId }),
    ...(input.properties === undefined ? {} : { properties: input.properties }),
    ...(input.position === undefined ? {} : { position: input.position }),
  });
  if (!created.ok) {
    return err(toUseCaseError(created.error));
  }
  const node = created.value;
  let edge: Edge;
  let edges: Edge[];
  try {
    edge = new Edge(
      createEdgeId(nextEdgeId()),
      new Connection(
        { nodeId: parent.id, portId: parentOutgoingPort(replacedEdges) ?? outgoingPort.id },
        { nodeId: node.id, portId: incomingPort.id },
      ),
      definitionId,
    );
    edges = [];
    for (const replaced of replacedEdges) {
      const candidate = new Edge(
        createEdgeId(nextEdgeId()),
        new Connection(
          { nodeId: node.id, portId: outgoingPort.id },
          {
            nodeId: replaced.connection.target.nodeId,
            portId: replaced.connection.target.portId,
          },
        ),
        replaced.definitionId,
      );
      const key = endpointsKey(candidate);
      if (taken.has(key)) {
        // The relation is already there: writing it again would duplicate it.
        continue;
      }
      taken.add(key);
      edges.push(candidate);
    }
  } catch (error) {
    editor.graph.removeNode(node.id);
    return err({
      kind: "invalid-input",
      message: error instanceof Error ? error.message : "invalid connection",
      elementId: input.definitionId,
    });
  }

  // --- Write through the graph's own primitives, rolling back on refusal ---
  // The structural rules answer before the history does, so a refusal can still
  // report itself: the node and every edge already written are undone, and the
  // graph is left exactly as it was found.
  const written: Edge[] = [];
  for (const candidate of [edge, ...edges]) {
    const added = editor.graph.addEdge(candidate);
    if (!added.ok) {
      for (const previous of written) {
        editor.graph.removeEdge(previous.id);
      }
      editor.graph.removeNode(node.id);
      return err(toUseCaseError(added.error));
    }
    written.push(candidate);
  }

  // --- One history unit ---------------------------------------------------
  // `push` runs `apply` immediately. At that moment the node and the new edges are
  // already in the graph and the replaced ones are still there, so the adds hit
  // their own duplicate rejection and the removals do the real work — the
  // expected outcome, exactly like the sibling `insert-node-on-edge` command. On
  // redo they are applied for real.
  editor.history.push(editor.editorState, {
    label: "insert-node-before-branching",
    apply: () => {
      editor.graph.addNode(node);
      for (const candidate of written) {
        editor.graph.addEdge(candidate);
      }
      for (const replaced of replacedEdges) {
        editor.graph.removeEdge(replaced.id);
      }
    },
    reverse: () => {
      for (const replaced of replacedEdges) {
        editor.graph.addEdge(replaced);
      }
      for (const candidate of written) {
        editor.graph.removeEdge(candidate.id);
      }
      editor.graph.removeNode(node.id);
    },
  });
  editor.events.emit({
    name: "node.created",
    payload: { nodeId: node.id, definitionId: node.definitionId },
  });
  for (const candidate of written) {
    editor.events.emit({ name: "edge.created", payload: { edgeId: candidate.id } });
  }
  for (const replaced of replacedEdges) {
    editor.events.emit({ name: "edge.deleted", payload: { edgeId: replaced.id } });
  }
  emitChanged(editor, "insert-node-before-branching");
  return ok({ node, edge, edges, replacedEdges });
}

/** First declaration facing one of the given directions, in declaration order. */
function firstPort(
  ports: readonly PortDeclaration[],
  directions: readonly PortDirection[],
): PortDeclaration | undefined {
  return ports.find((port) => directions.includes(port.direction));
}

/**
 * Port the parent used to emit from: the source port of the relation the
 * insertion replaces.
 *
 * Reusing it keeps the parent's own vocabulary — a node with several outputs
 * keeps the one its successor edges left from — and falls back to the inserted
 * node's first output when the parent had no successor at all.
 */
function parentOutgoingPort(replacedEdges: readonly Edge[]): string | undefined {
  return replacedEdges[0]?.connection.source.portId;
}

/**
 * Identity of one relation: both endpoints and both ports.
 *
 * It is exactly the equality the graph's own multi-edge rule uses, which is what
 * "a pair that would duplicate an edge" means.
 */
function endpointsKey(edge: Edge): string {
  const { source, target } = edge.connection;
  return `${source.nodeId}:${source.portId} -> ${target.nodeId}:${target.portId}`;
}

/**
 * Edge id for one of the new edges, in the shape the edge use cases generate.
 * A collision is refused by the graph like any other duplicate id, and the
 * insertion rolls back.
 */
function nextEdgeId(): string {
  return `edge-${Math.random().toString(36).slice(2, 10)}`;
}
