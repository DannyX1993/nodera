/**
 * Instance views: the §9 vocabulary of PRODUCT-DESCRIPTION for the nodes and
 * edges a host reads out of a graph.
 *
 * Two shapes are translated here, and both are renames rather than reshaping:
 *
 * - A node instance says `type` where the domain says `definitionId`, and
 *   `version` where the domain says `definitionVersion`.
 * - An edge instance is **flat**. The domain stores a `Connection` value object
 *   with two `ConnectionEndpoint` objects; §9 stores `source`, `sourcePort`,
 *   `target` and `targetPort` as four strings.
 *
 * The flat form is deliberate and is not the wire format. The portable document
 * keeps nested endpoints (`{ nodeId, portId, direction? }`) because a serialized
 * document must survive a round trip without losing the direction a port was
 * declared with, and it is a separate published contract (Phase 2). A host
 * reading the SDK wants the identity of the two ports, not the plumbing that
 * keeps them intact on disk, so the SDK hands the flat form to the host and
 * leaves the nested form to serialization.
 *
 * `toEdgeInstanceView` takes an `Edge`, not the `Connection` value object it
 * contains: an instance view carries the instance id, its definition type, its
 * label and its metadata, and a `Connection` holds none of those. §9's
 * `EdgeInstance` sketch names the flat endpoints, and this function maps exactly
 * that, from the one domain object that is an edge instance.
 */

import type { Edge, Node } from "@nodera/graph-model";

/** One node instance, in the §9 vocabulary. */
export interface NodeInstanceView {
  readonly id: string;
  /** Node definition type; the domain's `definitionId`. */
  readonly type: string;
  /** Definition version the instance was created against; the domain's `definitionVersion`. */
  readonly version?: string;
  /**
   * Presentation position, when the node has one.
   *
   * An absent position means the host has not placed the node yet — it does not
   * mean the origin, and no default is invented for it.
   */
  readonly position?: { readonly x: number; readonly y: number };
  /** Current property values, keyed by property id. */
  readonly properties: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** One edge instance, in the §9 vocabulary: flat endpoints, no nested objects. */
export interface EdgeInstanceView {
  readonly id: string;
  /** Edge definition type; the domain's `definitionId`. */
  readonly type?: string;
  /** Source node instance id. */
  readonly source: string;
  /** Source port id. */
  readonly sourcePort?: string;
  /** Target node instance id. */
  readonly target: string;
  /** Target port id. */
  readonly targetPort?: string;
  readonly label?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Maps one node instance to its §9 view. */
export function toNodeInstanceView(node: Node): NodeInstanceView {
  const position = node.position;
  return {
    id: node.id,
    type: node.definitionId,
    ...(node.definitionVersion === undefined ? {} : { version: node.definitionVersion }),
    ...(position === undefined ? {} : { position: { x: position.x, y: position.y } }),
    properties: node.getProperties(),
    ...(node.metadata === undefined ? {} : { metadata: node.metadata }),
  };
}

/** Maps one edge instance to its flat §9 view. */
export function toEdgeInstanceView(edge: Edge): EdgeInstanceView {
  return {
    id: edge.id,
    ...(edge.definitionId === undefined ? {} : { type: edge.definitionId }),
    source: edge.connection.source.nodeId,
    sourcePort: edge.connection.source.portId,
    target: edge.connection.target.nodeId,
    targetPort: edge.connection.target.portId,
    ...(edge.label === undefined ? {} : { label: edge.label }),
    ...(edge.metadata === undefined ? {} : { metadata: edge.metadata }),
  };
}
