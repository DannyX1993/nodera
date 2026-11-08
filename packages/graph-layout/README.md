# @nodera/graph-layout

Framework-agnostic graph placement. A strategy receives plain data — node ids,
the positions the document already carries, the edges and the host's options —
and answers either one position per selected node or a structured diagnostic.

It never imports React, React Flow or a canvas, never reads or writes a graph
instance, and never applies anything: the application layer decides when a
placement becomes a document change. Nothing here is applied automatically.

## The strategy port

```ts
import { createNodeId } from "@nodera/contracts";
import { createLayeredStrategy } from "@nodera/graph-layout";

const strategy = createLayeredStrategy();
const result = strategy.place({
  nodes: [
    { id: createNodeId("start") },
    { id: createNodeId("work"), position: { x: 40, y: 0 } },
  ],
  edges: [{ source: createNodeId("start"), target: createNodeId("work") }],
  options: { direction: "horizontal", nodeSpacing: 40, rankSpacing: 120, scope: "unpositioned" },
});

if (result.ok) {
  result.value.positions; // [{ nodeId, position }]
} else {
  result.error.code;      // graph-layout.invalid-options | graph-layout.duplicate-node
                          // | graph-layout.unknown-edge-node
}
```

`GraphLayoutInput`/`GraphLayoutResult`/`GraphLayoutDiagnostic` and the
`GraphLayoutStrategy` interface are the whole contract; a host selects a strategy
in configuration and never sees the algorithm.

`scope` decides which nodes the answer covers: `"all"` places every node of the
graph, `"unpositioned"` answers only for the nodes the document does not position
yet, so an automatic placement can never move a node the host or the user already
placed.

## Strategies

| Factory | Id | Behaviour |
| --- | --- | --- |
| `createFreeStrategy()` | `nodera.graph-layout.free` | places nothing (`positions: []`); every position stays in the host's hands |
| `createLayeredStrategy()` | `nodera.graph-layout.layered` | ranks by longest path from the source nodes and lays the ranks out in node-id order |

The layered strategy ranks every node by longest path from the source nodes
(nodes with no incoming edge). A node no source can reach — a cycle, and whatever
depends on it — is placed after every resolved rank, ordered by node id, so the
answer stays deterministic. Within a rank the nodes are ordered by node id, never
by the order the caller listed them: the same graph always arranges the same way.
`horizontal` puts the rank on `x` (`rankSpacing`) and the in-rank index on `y`
(`nodeSpacing`); `vertical` swaps the axes.

Validation is fail-closed: `nodeSpacing` and `rankSpacing` must be positive finite
numbers, node ids must be unique and every edge endpoint must be a known node. A
failed call returns only a diagnostic — never a partial placement.

## Stated limitations

No crossing minimization and no edge bend points. The result is a ranked,
evenly spaced grid, which is what an explicit "arrange" action needs; a quality
bar that asks for fewer crossings belongs behind this same port.
