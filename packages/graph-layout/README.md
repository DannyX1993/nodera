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
`GraphLayoutStrategy` interface are the whole contract; a host registers its own
implementation on `LayoutStrategyRegistry`, selects one **by id** in
configuration and never sees the algorithm.

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

## The strategy registry

`LayoutStrategyRegistry` is the composition point: it holds the strategies
available to a builder and names the one selected when the host names none. It
implements the framework's `DefinitionRegistry` contract, so it behaves like
every other registry — registering a used id is a `duplicate-id` error and never
overwrites, removing or requiring an unknown id is a `not-found` error, and
`setDefault` rejects an id that is not registered, keeping the previous default.

```ts
import { LayoutStrategyRegistry } from "@nodera/graph-layout";

const registry = new LayoutStrategyRegistry(); // free + layered, size === 2
registry.defaultStrategyId;                    // "nodera.graph-layout.layered"
registry.getDefault().id;                      // the same strategy instance
```

The layered strategy is the default (`DEFAULT_STRATEGY_ID`). A host that supplies
its own `strategies` list replaces the built-ins entirely, and the default is then
`defaultStrategyId` when declared, otherwise the first entry of that list.

## Adding your own strategy

A strategy is code, so a host — or a later plugin — adds one by implementing the
port and registering it. The framework ships **no external layout dependency**:
an adapter may wrap a third-party library, and that dependency belongs to the
adapter and to the host's own build, never to this package (odd task T2, S9).

1. **Implement `GraphLayoutStrategy`.** Two members: a globally qualified `id`
   (`vendor.feature-name`, e.g. `acme.dagre`) and `place(input)`. It receives
   plain data only and must import no React, React Flow or canvas type; it must be
   deterministic, side-effect free, and honour `options.direction`, the two
   spacings and `options.scope` (`unpositioned` means: answer only for the nodes
   the document does not position yet). Return `err` with a
   `GraphLayoutDiagnostic` when it cannot place — never partial geometry.
2. **Register it.** `registry.register(strategy)`; a used id is rejected instead of
   shadowing the strategy the host already selected.
3. **Select it by id.** `new LayoutStrategyRegistry({ defaultStrategyId: "acme.dagre" })`
   or `registry.setDefault("acme.dagre")`. The id is the only thing configuration
   carries downstream, so swapping the algorithm never touches the SDK, the
   application layer or the canvas.

```ts
// Host-side sketch, NOT shipped by Nodera and not imported by this package.
// The host that wants dagre installs it and pins `>= 3.1.3`, the release that
// scopes dynamic-layout state to the input graph instead of module state.
import dagre from "@dagrejs/dagre";
// Types and the built-in fallback come from "@nodera/graph-layout":
// import { createLayeredStrategy, type GraphLayoutStrategy } from "@nodera/graph-layout";
// import { ok } from "@nodera/contracts";

function createDagreStrategy(maxNodes: number): GraphLayoutStrategy {
  return {
    id: "acme.dagre",
    place(input) {
      const { nodes, edges, options } = input;
      if (nodes.length > maxNodes) {
        // Degradation path: fall back to the built-in strategy instead of
        // returning geometry the graph is too large for. The host decides; the
        // framework never guesses.
        return createLayeredStrategy().place(input);
      }

      // dagre's answer depends on input order: sort nodes and edges by id so the
      // same graph always arranges the same way.
      const byId = (a: { readonly id: string }, b: { readonly id: string }) => (a.id < b.id ? -1 : 1);
      const graph = new dagre.graphlib.Graph().setGraph({
        rankdir: options.direction === "vertical" ? "TB" : "LR",
      });
      for (const node of [...nodes].sort(byId)) {
        graph.setNode(node.id, { width: 1, height: 1 });
      }
      for (const edge of [...edges].sort((a, b) => (a.source === b.source ? (a.target < b.target ? -1 : 1) : a.source < b.source ? -1 : 1))) {
        graph.setEdge(edge.source, edge.target);
      }
      dagre.layout(graph);

      const positions = [...nodes]
        .filter((node) => options.scope === "all" || node.position === undefined)
        .map((node) => ({ nodeId: node.id, position: { x: graph.node(node.id).x, y: graph.node(node.id).y } }));
      return ok({ positions });
    },
  };
}

const registry = new LayoutStrategyRegistry();
registry.register(createDagreStrategy(500));
registry.setDefault("acme.dagre");
```

The obligations behind that sketch stay on the host, because they are properties
of the algorithm, not of Nodera: sorting the input (dagre documents no output
stability across input orders), a node-count threshold plus a degradation path
(its algorithms are super-linear per the maintainer, and its recursion is a
depth risk), honouring `scope`, and the version pin. The built-in layered
strategy is the natural fallback — call `createLayeredStrategy().place(input)`
above the threshold, as the sketch does.

## Stated limitations

No crossing minimization and no edge bend points. The result is a ranked,
evenly spaced grid, which is what an explicit "arrange" action needs; a quality
bar that asks for fewer crossings belongs behind this same port.
