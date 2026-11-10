import { describe, expect, it } from "vitest";
import { createEdgeId, createNodeId } from "@nodera/contracts";
import { Connection, Edge, type ConnectionEndpoint } from "./edge.js";

const endpoint = (nodeId: string, portId: string): ConnectionEndpoint => ({
  nodeId: createNodeId(nodeId),
  portId,
});

function makeEdge(): Edge {
  return new Edge(
    createEdgeId("e1"),
    new Connection(endpoint("n1", "out"), endpoint("n2", "in")),
  );
}

describe("Edge waypoints", () => {
  it("exposes no waypoints by default", () => {
    expect(makeEdge().waypoints).toBeUndefined();
  });

  it("replaces waypoints and copies them defensively", () => {
    const edge = makeEdge();
    const points = [{ x: 10, y: 20 }];
    edge.setWaypoints(points);
    expect(edge.waypoints).toEqual([{ x: 10, y: 20 }]);
    expect(edge.waypoints).not.toBe(points);
    // Mutating the caller's array must not reach the stored state.
    (points as { x: number; y: number }[]).push({ x: 99, y: 99 });
    expect(edge.waypoints).toEqual([{ x: 10, y: 20 }]);
  });

  it("clears waypoints with undefined", () => {
    const edge = makeEdge();
    edge.setWaypoints([{ x: 1, y: 2 }]);
    edge.setWaypoints(undefined);
    expect(edge.waypoints).toBeUndefined();
  });

  it("rejects a non-finite coordinate", () => {
    const edge = makeEdge();
    expect(() => edge.setWaypoints([{ x: Number.NaN, y: 0 }])).toThrow(RangeError);
    expect(() => edge.setWaypoints([{ x: 0, y: Number.POSITIVE_INFINITY }])).toThrow(
      RangeError,
    );
    // A refused call leaves the previous waypoints in place.
    edge.setWaypoints([{ x: 5, y: 5 }]);
    expect(() => edge.setWaypoints([{ x: Number.NaN, y: 0 }])).toThrow(RangeError);
    expect(edge.waypoints).toEqual([{ x: 5, y: 5 }]);
  });

  it("rejects a waypoints entry that is not a finite-number pair", () => {
    const edge = makeEdge();
    expect(() =>
      edge.setWaypoints([{ x: 1, y: 2 }, undefined as unknown as { x: number; y: number }]),
    ).toThrow(RangeError);
    expect(() =>
      edge.setWaypoints([{ x: "1", y: 2 } as unknown as { x: number; y: number }]),
    ).toThrow(RangeError);
    expect(edge.waypoints).toBeUndefined();
  });
});
