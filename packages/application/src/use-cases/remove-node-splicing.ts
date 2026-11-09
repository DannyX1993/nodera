/**
 * Remove-node-splicing use case: one node removed and its predecessors joined to
 * its successors.
 *
 * The graph keeps its connectivity: `p --a--> n --b--> s` becomes `p --> s`, so
 * the hierarchy above and below stays connected through one hop instead of being
 * left apart. It is what a host that puts the layout in charge of its graph asks
 * for when it removes a node in the middle (odd S22).
 *
 * The relation the splice writes takes its endpoints from the edges that were
 * removed — the predecessor's port from its incoming edge, the successor's port
 * from its outgoing edge — and its definition type from the node's **incoming**
 * edge, because that is the relation the node received and now passes on. The
 * original labels and metadata describe relations that are gone and are not
 * copied onto the hop. One predecessor by one successor is one edge; several of
 * each are the cartesian product, because dropping a pair would silently sever a
 * branch. A pair whose endpoints (nodes **and** ports) already carry an edge is
 * skipped: the relation exists, so writing it again would only duplicate it.
 *
 * One history unit, labelled `remove-node-splicing` (AGENTS.md §12): `apply`
 * removes the node — which takes its attached edges with it — and adds the
 * spliced edges, `reverse` removes the spliced edges, restores the node and
 * re-adds its original edges, so one undo puts the graph back exactly as it was,
 * ids and ports included.
 *
 * All-or-nothing (AGENTS.md §13): the node is resolved before the first write,
 * and the change is written through the graph's own primitives first, so a
 * structural refusal while the spliced edges are added rolls the node and its
 * edges back. A refused request writes nothing, pushes nothing and emits
 * nothing. A node with no predecessor or no successor has no pair to write and
 * degrades to a plain removal, in the same one unit.
 *
 * It is built from the same domain primitives `removeNode`, `createEdge` and
 * `removeEdge` use — and never calls those use cases, because each of them
 * pushes a history unit of its own.
 */

import { createEdgeId, createNodeId, err, ok, type NodeId, type Result } from "@nodera/contracts";
import { Connection, Edge, type Node } from "@nodera/graph-model";
import type { EditorEngine } from "../editor-engine.js";
import { emitChanged, toUseCaseError, type UseCaseError } from "./errors.js";

export interface RemoveNodeSplicingInput {
  /** Node that is removed; every edge it carries is removed with it. */
  readonly nodeId: string;
}

export interface RemoveNodeSplicingResult {
  readonly node: Node;
  /** Every edge the node carried, removed by the same unit; `undo` restores them. */
  readonly edges: readonly Edge[];
  /** One edge per predecessor × successor pair that was written. */
  readonly spliced: readonly Edge[];
  /**
   * Nodes that reach the removed node, in edge order and without repetition:
   * what an automatic downstream arrangement starts from afterwards.
   */
  readonly predecessors: readonly NodeId[];
}

/**
 * Removes a node and joins each of its predecessors to each of its successors as
 * a single reversible unit.
 */
export function removeNodeSplicing(
  editor: EditorEngine,
  input: RemoveNodeSplicingInput,
): Result<RemoveNodeSplicingResult, UseCaseError> {
  // --- Validate before the first write ------------------------------------
  const node = editor.graph.getNode(createNodeId(input.nodeId));
  if (node === undefined) {
    return err({
      kind: "node-not-found",
      message: `Graph has no node with id "${input.nodeId}"`,
      elementId: input.nodeId,
    });
  }

  // --- Decide the pairs, still writing nothing ----------------------------
  const attached = editor.graph.getEdgesOf(node.id);
  // A self-loop has no other endpoint to join, so it leaves with the node like
  // any other edge the node carried and contributes no pair.
  const incoming = attached.filter(
    (edge) =>
      edge.connection.target.nodeId === node.id && edge.connection.source.nodeId !== node.id,
  );
  const outgoing = attached.filter(
    (edge) =>
      edge.connection.source.nodeId === node.id && edge.connection.target.nodeId !== node.id,
  );
  // The type the node received is the one the hop passes on; with no incoming
  // edge there is no pair to write, so the type is simply absent.
  const definitionId = incoming[0]?.definitionId;

  // Every relation that already stays in the graph is a reason to skip a pair,
  // and so is a pair this operation has just decided to write.
  const leaving = new Set(attached.map((edge) => edge.id));
  const taken = new Set<string>();
  for (const edge of editor.graph.getEdges()) {
    if (!leaving.has(edge.id)) {
      taken.add(endpointsKey(edge));
    }
  }

  const spliced: Edge[] = [];
  try {
    for (const predecessorEdge of incoming) {
      for (const successorEdge of outgoing) {
        const candidate = new Edge(
          createEdgeId(nextEdgeId()),
          new Connection(
            {
              nodeId: predecessorEdge.connection.source.nodeId,
              portId: predecessorEdge.connection.source.portId,
            },
            {
              nodeId: successorEdge.connection.target.nodeId,
              portId: successorEdge.connection.target.portId,
            },
          ),
          definitionId,
        );
        const key = endpointsKey(candidate);
        if (taken.has(key)) {
          // The relation is already there: writing it again would duplicate it.
          continue;
        }
        taken.add(key);
        spliced.push(candidate);
      }
    }
  } catch (error) {
    return err({
      kind: "invalid-input",
      message: error instanceof Error ? error.message : "invalid connection",
      elementId: input.nodeId,
    });
  }

  const predecessors: NodeId[] = [];
  for (const edge of incoming) {
    const predecessorId = edge.connection.source.nodeId;
    if (!predecessors.includes(predecessorId)) {
      predecessors.push(predecessorId);
    }
  }

  // --- Write through the graph's own primitives, rolling back on refusal ---
  // The structural rules answer before the history does, so a refusal can still
  // report itself: the node and every splice already written are undone, and the
  // graph is left exactly as it was found.
  editor.graph.removeNode(node.id);
  const written: Edge[] = [];
  for (const edge of spliced) {
    const added = editor.graph.addEdge(edge);
    if (!added.ok) {
      for (const previous of written) {
        editor.graph.removeEdge(previous.id);
      }
      editor.graph.addNode(node);
      for (const edge of attached) {
        editor.graph.addEdge(edge);
      }
      return err(toUseCaseError(added.error));
    }
    written.push(edge);
  }

  // --- One history unit ---------------------------------------------------
  // `push` runs `apply` immediately. At that moment the node is already gone and
  // the spliced edges are already in the graph, so the removal has nothing left
  // to do and the adds hit their own duplicate rejection — the expected outcome,
  // exactly like the sibling `remove-node` and `insert-node-on-edge` commands. On
  // redo they are applied for real.
  editor.history.push(editor.editorState, {
    label: "remove-node-splicing",
    apply: () => {
      editor.graph.removeNode(node.id);
      for (const edge of spliced) {
        editor.graph.addEdge(edge);
      }
    },
    reverse: () => {
      for (const edge of spliced) {
        editor.graph.removeEdge(edge.id);
      }
      editor.graph.addNode(node);
      for (const edge of attached) {
        editor.graph.addEdge(edge);
      }
    },
  });
  editor.events.emit({ name: "node.deleted", payload: { nodeId: node.id } });
  for (const edge of attached) {
    editor.events.emit({ name: "edge.deleted", payload: { edgeId: edge.id } });
  }
  for (const edge of spliced) {
    editor.events.emit({ name: "edge.created", payload: { edgeId: edge.id } });
  }
  emitChanged(editor, "remove-node-splicing");
  return ok({ node, edges: attached, spliced, predecessors });
}

/**
 * Identity of one relation: both endpoints and both ports.
 *
 * It is what "a pair that would duplicate an existing edge" means, and it is
 * exactly the equality the graph's own multi-edge rule uses.
 */
function endpointsKey(edge: Edge): string {
  const { source, target } = edge.connection;
  return `${source.nodeId}:${source.portId} -> ${target.nodeId}:${target.portId}`;
}

/**
 * Edge id for a spliced edge, in the shape the edge use cases generate.
 * A collision is refused by the graph like any other duplicate id, and the
 * removal rolls back.
 */
function nextEdgeId(): string {
  return `edge-${Math.random().toString(36).slice(2, 10)}`;
}
