/**
 * Stable, portable identifiers for graph elements.
 *
 * Identifiers are branded strings: they gain compile-time distinction while
 * remaining plain, serializable strings at rest (portable documents must not
 * carry runtime-only wrappers). Array indices are never valid identifiers.
 */

declare const graphIdBrand: unique symbol;
declare const nodeIdBrand: unique symbol;
declare const edgeIdBrand: unique symbol;
declare const portIdBrand: unique symbol;

/** Unique identifier of a graph. */
export type GraphId = string & { readonly [graphIdBrand]: true };
/** Unique identifier of a node instance within a graph. */
export type NodeId = string & { readonly [nodeIdBrand]: true };
/** Unique identifier of an edge instance within a graph. */
export type EdgeId = string & { readonly [edgeIdBrand]: true };
/** Unique identifier of a port of a node instance. */
export type PortId = string & { readonly [portIdBrand]: true };

/** Identifier of any element that a validation issue can point at. */
export type ElementId = string;

const ID_PATTERN = /^[^\s]+$/;

/**
 * Checks whether a raw value is a well-formed identifier: non-empty and
 * without whitespace. Every element id must pass this rule; it guards against
 * accidental use of indices, labels or empty strings as identifiers.
 */
export function isValidIdShape(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && ID_PATTERN.test(value);
}

/** Creates a branded {@link GraphId}, throwing on malformed input. */
export function createGraphId(value: string): GraphId {
  assertIdShape(value, "GraphId");
  return value as GraphId;
}

/** Creates a branded {@link NodeId}, throwing on malformed input. */
export function createNodeId(value: string): NodeId {
  assertIdShape(value, "NodeId");
  return value as NodeId;
}

/** Creates a branded {@link EdgeId}, throwing on malformed input. */
export function createEdgeId(value: string): EdgeId {
  assertIdShape(value, "EdgeId");
  return value as EdgeId;
}

/** Creates a branded {@link PortId}, throwing on malformed input. */
export function createPortId(value: string): PortId {
  assertIdShape(value, "PortId");
  return value as PortId;
}

function assertIdShape(value: string, kind: string): void {
  if (!isValidIdShape(value)) {
    throw new RangeError(
      `Invalid ${kind}: expected a non-empty string without whitespace, got ${JSON.stringify(value)}`,
    );
  }
}
