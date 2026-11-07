import {
  createNodeId,
  err,
  ok,
  type EdgeId,
  type GraphId,
  type NodeId,
  type Result,
} from "@nodera/contracts";
import { Edge, type ConnectionEndpoint } from "./edge.js";
import type { GraphError } from "./errors.js";
import type { GraphMetadata } from "./graph-settings.js";
import {
  DEFAULT_GRAPH_SETTINGS,
  type GraphSettings,
} from "./graph-settings.js";
import { Node } from "./node.js";

/**
 * A graph entity: the aggregate that owns node and edge instances and
 * guarantees their structural integrity.
 *
 * Integrity here is structural only: identifiers, references and declared
 * settings. Whether a connection is semantically correct (types, cardinality,
 * definition rules) is domain validation, a separate concern.
 */
export class Graph {
  private readonly nodesById = new Map<NodeId, Node>();
  private readonly edgesById = new Map<EdgeId, Edge>();

  constructor(
    readonly id: GraphId,
    readonly metadata: GraphMetadata = {},
    readonly settings: GraphSettings = DEFAULT_GRAPH_SETTINGS,
  ) {}

  /** Adds a node. Fails on a duplicate node id. */
  addNode(node: Node): Result<Node, GraphError> {
    if (this.nodesById.has(node.id)) {
      return err({
        kind: "duplicate-node-id",
        message: `Graph already contains a node with id "${node.id}"`,
        elementId: node.id,
      });
    }
    this.nodesById.set(node.id, node);
    return ok(node);
  }

  /**
   * Removes a node and every edge attached to it, so the operation can be
   * reversed later without dangling references.
   */
  removeNode(nodeId: NodeId): Result<{ node: Node; edges: readonly Edge[] }, GraphError> {
    const node = this.nodesById.get(nodeId);
    if (node === undefined) {
      return err({
        kind: "node-not-found",
        message: `Graph has no node with id "${nodeId}"`,
        elementId: nodeId,
      });
    }
    const attached = [...this.edgesById.values()].filter(
      (edge) =>
        edge.connection.source.nodeId === nodeId ||
        edge.connection.target.nodeId === nodeId,
    );
    for (const edge of attached) {
      this.edgesById.delete(edge.id);
    }
    this.nodesById.delete(nodeId);
    return ok({ node, edges: attached });
  }

  /** Adds an edge after checking every structural rule. */
  addEdge(edge: Edge): Result<Edge, GraphError> {
    const connection = edge.connection;
    if (this.edgesById.has(edge.id)) {
      return err({
        kind: "duplicate-edge-id",
        message: `Graph already contains an edge with id "${edge.id}"`,
        elementId: edge.id,
      });
    }
    const sourceNode = this.nodesById.get(connection.source.nodeId);
    if (sourceNode === undefined) {
      return err({
        kind: "node-not-found",
        message: `Edge "${edge.id}" references unknown source node "${connection.source.nodeId}"`,
        elementId: edge.id,
      });
    }
    if (!sourceNode.hasPort(connection.source.portId)) {
      return err({
        kind: "node-not-found",
        message: `Source node "${connection.source.nodeId}" has no port "${connection.source.portId}"`,
        elementId: connection.source.nodeId,
      });
    }
    const targetNode = this.nodesById.get(connection.target.nodeId);
    if (targetNode === undefined) {
      return err({
        kind: "node-not-found",
        message: `Edge "${edge.id}" references unknown target node "${connection.target.nodeId}"`,
        elementId: edge.id,
      });
    }
    if (!targetNode.hasPort(connection.target.portId)) {
      return err({
        kind: "node-not-found",
        message: `Target node "${connection.target.nodeId}" has no port "${connection.target.portId}"`,
        elementId: connection.target.nodeId,
      });
    }
    if (
      connection.source.nodeId === connection.target.nodeId &&
      this.settings.selfLoops === "forbid"
    ) {
      return err({
        kind: "self-loop-forbidden",
        message: `Graph settings forbid self-loops on node "${connection.source.nodeId}"`,
        elementId: edge.id,
      });
    }
    if (this.settings.multiEdges === "forbid" && this.hasEquivalentEdge(connection)) {
      return err({
        kind: "multi-edge-forbidden",
        message: `Graph settings forbid a second edge between "${connection.source.nodeId}":"${connection.source.portId}" and "${connection.target.nodeId}":"${connection.target.portId}"`,
        elementId: edge.id,
      });
    }
    if (this.settings.cycles === "forbid" && this.createsCycle(connection.source, connection.target)) {
      return err({
        kind: "cycle-forbidden",
        message: `Edge "${edge.id}" would create a directed cycle through "${connection.target.nodeId}"`,
        elementId: edge.id,
      });
    }
    this.edgesById.set(edge.id, edge);
    return ok(edge);
  }

  /** Removes an edge by id. */
  removeEdge(edgeId: EdgeId): Result<Edge, GraphError> {
    const edge = this.edgesById.get(edgeId);
    if (edge === undefined) {
      return err({
        kind: "edge-not-found",
        message: `Graph has no edge with id "${edgeId}"`,
        elementId: edgeId,
      });
    }
    this.edgesById.delete(edgeId);
    return ok(edge);
  }

  /** Node instance by id, if present. */
  getNode(nodeId: NodeId): Node | undefined {
    return this.nodesById.get(nodeId);
  }

  /** Edge instance by id, if present. */
  getEdge(edgeId: EdgeId): Edge | undefined {
    return this.edgesById.get(edgeId);
  }

  /** All node instances, in insertion order. */
  getNodes(): readonly Node[] {
    return [...this.nodesById.values()];
  }

  /** All edge instances, in insertion order. */
  getEdges(): readonly Edge[] {
    return [...this.edgesById.values()];
  }

  /** Edges whose source or target is the given node. */
  getEdgesOf(nodeId: NodeId): readonly Edge[] {
    return this.getEdges().filter(
      (edge) =>
        edge.connection.source.nodeId === nodeId ||
        edge.connection.target.nodeId === nodeId,
    );
  }

  /** Edges leaving the given node. */
  getEdgesFrom(nodeId: NodeId): readonly Edge[] {
    return this.getEdges().filter((edge) => edge.connection.source.nodeId === nodeId);
  }

  /** Edges entering the given node. */
  getEdgesTo(nodeId: NodeId): readonly Edge[] {
    return this.getEdges().filter((edge) => edge.connection.target.nodeId === nodeId);
  }

  get nodeCount(): number {
    return this.nodesById.size;
  }

  get edgeCount(): number {
    return this.edgesById.size;
  }

  /** Builds a node id already shaped for this graph's namespace. */
  createNodeId(value: string): NodeId {
    return createNodeId(value);
  }

  private hasEquivalentEdge(connection: {
    source: ConnectionEndpoint;
    target: ConnectionEndpoint;
  }): boolean {
    return this.getEdges().some(
      (edge) =>
        edge.connection.source.nodeId === connection.source.nodeId &&
        edge.connection.source.portId === connection.source.portId &&
        edge.connection.target.nodeId === connection.target.nodeId &&
        edge.connection.target.portId === connection.target.portId,
    );
  }

  /**
   * Depth-first search over outgoing edges from `target` to see whether
   * `source` is reachable, i.e. whether adding source→target closes a cycle.
   */
  private createsCycle(source: ConnectionEndpoint, target: ConnectionEndpoint): boolean {
    if (source.nodeId === target.nodeId) {
      return true;
    }
    const visited = new Set<NodeId>();
    const stack: NodeId[] = [target.nodeId];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) {
        continue;
      }
      if (current === source.nodeId) {
        return true;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      for (const edge of this.getEdgesFrom(current)) {
        stack.push(edge.connection.target.nodeId);
      }
    }
    return false;
  }
}
