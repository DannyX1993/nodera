# @nodera/graph-layout

Framework-agnostic graph placement. A strategy receives plain data — node ids,
the positions the document already carries, the edges and the host's options —
and answers either one position per selected node or a structured diagnostic.

It never imports React, React Flow or a canvas, never reads or writes a graph
instance, and never applies anything: the application layer decides when a
placement becomes a document change. Nothing here is applied automatically.

The package declares **no defaults of its own**. Every option is required in
`GraphLayoutOptions`, so the values a graph is arranged with are the host's
declaration or the SDK's documented resolution of it (see
[Defaults](#defaults) and `docs/GRAPH-LAYOUT.md`).

## Exports

Everything below is re-exported from the package root (`src/index.ts`).

| Export | Kind | What it is |
| --- | --- | --- |
| `GraphLayoutStrategy` | interface | The port: a qualified `id` and `place(input)` |
| `GraphLayoutInput` | interface | `nodes`, `edges` and `options` — the whole input |
| `GraphLayoutNodeInput` | interface | `id` plus the `position` the document already carries, when it has one |
| `GraphLayoutEdgeInput` | interface | `source` and `target` node ids |
| `GraphLayoutOptions` | interface | `direction`, `nodeSpacing`, `rankSpacing` and `scope` |
| `GraphLayoutDirection` | type | `"horizontal"` or `"vertical"` |
| `GraphLayoutScope` | type | `"all"` or `"unpositioned"` |
| `GraphLayoutPlacedNode` | interface | `nodeId` plus the computed `position` |
| `GraphLayoutResult` | interface | `positions`, the answer of a strategy |
| `GraphLayoutDiagnostic` | interface | `code`, `message` and the optional `nodeId` |
| `GraphLayoutDiagnosticCode` | type | The three stable codes below |
| `createFreeStrategy` / `FREE_STRATEGY_ID` | factory / constant | The no-op strategy, id `nodera.graph-layout.free` |
| `createLayeredStrategy` / `LAYERED_STRATEGY_ID` | factory / constant | The in-house layered strategy, id `nodera.graph-layout.layered` |
| `LayoutStrategyRegistry` | class | The composition point: holds strategies, names a default |
| `LayoutStrategyRegistryOptions` | interface | `strategies` and `defaultStrategyId` |
| `BUILT_IN_STRATEGIES` | constant | One instance each of `free` and `layered` |
| `BUILT_IN_STRATEGY_IDS` | constant | `[FREE_STRATEGY_ID, LAYERED_STRATEGY_ID]` |
| `DEFAULT_STRATEGY_ID` | constant | `LAYERED_STRATEGY_ID` |

Results use `Result` from `@nodera/contracts`; positions use `NodePosition` from
`@nodera/graph-model`. Those two packages are the only dependencies: the port
types import them type-only, and the registry takes `RegistryStore`, `ok`, `err`
and `notFoundError` from `@nodera/contracts` at runtime.

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
placed. The scopes cover the same graph: a node the document positions keeps its
slot in the grid, so switching between `all` and `unpositioned` does not shift the
nodes that are answered.

## Strategies

| Factory | Id | Behaviour |
| --- | --- | --- |
| `createFreeStrategy()` | `nodera.graph-layout.free` | places nothing (`positions: []`); every position stays in the host's hands |
| `createLayeredStrategy()` | `nodera.graph-layout.layered` | ranks by longest path from the source nodes, places the isolated and cycle-locked nodes after every resolved rank, and orders each rank by the barycenter of its parents in the previous rank (ties by node id) |

The free strategy never inspects its input, so it ignores the options and cannot
fail: an empty placement answer is the honest one, and the caller applies no write
at all.

### The layered placement rule

`createLayeredStrategy().place(input)` does exactly this, in this order:

1. **Validates the options** (see [Diagnostics](#diagnostics)) and returns the
   diagnostic before computing anything.
2. **Validates the input**: every node id must appear once, and every edge
   endpoint must be a known node id. The source endpoint of an edge is checked
   before its target.
3. **Sorts** the nodes by id and the edges by `(source, target)` before building
   the ranks, and starts every rank in id order before the barycenter sweep, so
   the answer depends on the *set* of nodes and edges and never on the order the
   caller listed them in.
4. **Ranks by longest path from the sources.** A source is a node with no incoming
   edge **and** at least one outgoing edge, and starts at rank `0`. Ranks are
   relaxed edge by edge, repeating over the sorted edge list; the number of
   passes is capped at the node count, so the relaxation always terminates even
   with a cycle in the graph.
5. **Places the nodes no rank can describe.** Two kinds of node never reach a
   resolved rank, and both land in one extra rank, `highest resolved rank + 1`,
   ordered by node id:
   - a node no source can reach — every node of a cycle, and every node that
     only depends on one — which the relaxation never ranks;
   - a node with **no incoming and no outgoing edge**. It belongs to no path at
     all, so it is not a source either; without this rule it would keep rank `0`
     and any recalculation would drop it at the origin (the hole the demo
     reported when a node added from the palette landed top-left).
6. **Orders each rank by a barycenter sweep** and then applies the axes:
   `horizontal` puts the rank on `x` (`rank × rankSpacing`) and the cross offset
   on `y`; `vertical` swaps them. The cross offset of the node at in-rank index
   `i` of a rank of `n` nodes is `(maxWidth - n) / 2 × nodeSpacing + i ×
   nodeSpacing`, where `maxWidth` is the length of the widest rank in the graph
   (the cycle-locked bucket included), so every rank is **centred** on the cross
   axis over the widest one: a node several branches depart from sits over the
   centre of those branches, and the widest rank itself keeps the cross
   coordinate `0`. The sweep visits the ranks in ascending order and orders each
   one by the **mean** in-rank index of
   a node's distinct parents in the previous rank (median was the alternative;
   the mean is what puts a node under the centre of its parents); equal keys fall
   back to node id, and a node with no parent in the previous rank — a source, an
   isolated node, a cycle-locked node — keeps its own current index. One sweep is
   enough because each rank is ordered only after the previous one is final, so a
   second identical sweep cannot change anything.

   This **reduces** crossings: it removes the sibling crossing an id order
   produces when a child's id sorts before its sibling's. It does **not**
   guarantee a crossing-free drawing — minimising crossings is NP-hard, and no
   rank-permutation heuristic can promise that. The ranking itself is never
   touched: the sweep only chooses in-rank indices.
7. **Filters by `scope`** last: `all` answers for every node, `unpositioned` drops
   the nodes the document positions but keeps their in-rank index — and the
   centring offset of the rank is computed from the **full** rank length, never
   from the emitted subset — so the slots of the answered nodes do not move.

The answer is a ranked, evenly spaced grid, which is what an explicit `Arrange`
action needs. There is no edge routing and no edge bend point (see
[Stated limitations](#stated-limitations)).

## Defaults

The strategy has no defaults: `direction`, `nodeSpacing`, `rankSpacing` and
`scope` are required members. The defaults a host actually sees are resolved
above this package, and these are the exact values:

| Setting | Declared by the host | Default | Resolved in |
| --- | --- | --- | --- |
| `graph.layout.mode` | `@nodera/sdk` | `"free"` | `packages/sdk/src/graph/placement.ts` (`resolveGraphLayout`) |
| `graph.layout.direction` | `@nodera/sdk` | `"horizontal"` | same |
| `graph.layout.spacing` | `@nodera/sdk` | `240` (`DEFAULT_GRAPH_LAYOUT_SPACING`), the `nodeSpacing` of `arrange()` | same |
| `graph.layout.rankSpacing` | `@nodera/sdk` | the declared `spacing` | `packages/sdk/src/builder/builder.ts` |
| `graph.layout.strategy` | `@nodera/sdk` | `DEFAULT_STRATEGY_ID`, which is `nodera.graph-layout.layered` | `LayoutStrategyRegistry` |
| `scope` of `arrange()` | not configurable | `"all"` | `packages/sdk/src/graph/graph-api.ts` |

The add-time grid of `mode: "auto"` is not this package: it is the SDK's own
`nextFreeSlot` over the positions the document already carries.

## Diagnostics

A failed `place` returns one `GraphLayoutDiagnostic` and never a partial answer.
Codes are stable and closed:

| Code | Meaning | `nodeId` |
| --- | --- | --- |
| `graph-layout.invalid-options` | `nodeSpacing` or `rankSpacing` is not a positive finite number, or `direction`/`scope` is outside its union | absent |
| `graph-layout.duplicate-node` | the input declares the same node id twice | the repeated id |
| `graph-layout.unknown-edge-node` | an edge endpoint is not in `nodes` | the unknown endpoint |

`message` is human-readable and must not be used to branch. The option checks run
first and in this order: `nodeSpacing`, `rankSpacing`, `direction`, `scope`.

## Who calls this

`@nodera/sdk` is the only caller today, and it calls one strategy per explicit
`builder.graph.arrange()` call: it reads the graph as plain data, asks the
strategy selected by `graph.layout.strategy` with the host's `direction`,
`spacing`, `rankSpacing` and `scope: "all"`, and applies the answer through
`@nodera/application` (`arrangeGraph`) as one history unit. A diagnostic becomes
an `sdk.invalid-input` issue and nothing is applied.

Nothing in this package knows about that: there is no planner, no scheduler and no
observer. It computes positions and writes nothing — no document, no history, no
event, no canvas. A host that calls `place` and drops the answer has a working
program with no side effect.

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

`LayoutStrategyRegistryOptions`:

- `strategies` — the list the host makes available. Omitted, it is
  `BUILT_IN_STRATEGIES`. Supplied, it **replaces** the built-ins entirely.
- `defaultStrategyId` — the selected strategy. Omitted, it is the first entry of
  the supplied list when the host supplied one, and `DEFAULT_STRATEGY_ID` (the
  layered strategy) when it did not.

Construction is fail-closed and throws, because a registry that cannot arrange is
a composition error, not data: a duplicate id inside the supplied list, an empty
list (`{ strategies: [] }`), or a `defaultStrategyId` no entry matches. The first
and the third throw the registry's own `duplicate-id` / `not-found` message; the
empty list throws its own.

Two rules keep the default honest once the registry is running:

- **A default never outlives its entry.** `unregister(selectedId)` removes the
  entry and moves the selection to the first remaining strategy.
- **An emptied registry has no default.** After unregistering everything,
  `size` is `0` and `getDefault()` throws; there is nothing left to select.

The layered strategy is the default (`DEFAULT_STRATEGY_ID`), so a host that
declares no `graph.layout.strategy` gets ranks without writing any configuration.

## Adding your own strategy

A strategy is code, so a host — or a later plugin — adds one by implementing the
port and registering it. The framework ships **no external layout dependency**:
an adapter may wrap a third-party library, and that dependency belongs to the
adapter and to the host's own build, never to this package (odd task T2, S9).

1. **Implement `GraphLayoutStrategy`.** Two members: a globally qualified `id`
   (`vendor.feature-name`, e.g. `acme.dagre`) and `place(input)`. It receives
   plain data only and must import no React, React Flow or canvas type. Return
   `err` with a `GraphLayoutDiagnostic` when it cannot place — never partial
   geometry.
2. **Register it.** `registry.register(strategy)`; a used id is rejected instead of
   shadowing the strategy the host already selected.
3. **Select it by id.** `new LayoutStrategyRegistry({ defaultStrategyId: "acme.dagre" })`
   or `registry.setDefault("acme.dagre")`. The id is the only thing configuration
   carries downstream, so swapping the algorithm never touches the SDK, the
   application layer or the canvas.

What the adapter itself must guarantee — the port cannot check any of it:

- **Determinism and no side effects.** The same node and edge set must always
  produce the same positions, and the input must not be mutated. Order everything
  the algorithm depends on by node or edge id before handing it over; several
  layout libraries document no output stability across input orders.
- **Id ordering as the tie-break.** Two nodes in the same rank or at the same
  distance must resolve by id, never by insertion order or by hash order, or the
  placement changes between runs and between machines.
- **Its own size threshold.** The port passes the whole graph; the adapter decides
  what it refuses. Above the threshold, delegate to
  `createLayeredStrategy().place(input)` (or return a diagnostic) instead of
  producing geometry the graph is too large for, and say so in the host's own
  diagnostics.
- **The declared semantics.** Honour `options.direction`, both spacings and
  `options.scope` (`unpositioned` means: answer only for the nodes the document
  does not position yet, and leave the others untouched).

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

**Crossing reduction, never elimination.** The barycenter sweep of the placement
rule removes the crossings an id order produces between siblings, and it is a
heuristic: it **reduces** crossings, it does not guarantee a crossing-free
drawing (minimising crossings is NP-hard), and a host must not read a
`place()` answer as one. There are no edge bend points and no edge routing
either. The result is a ranked, evenly spaced grid, which is what an explicit
`Arrange` action needs, with no knowledge of node sizes or edge geometry: it
never reads a node width, a port position or an edge path, and it returns
positions only, so nothing but the node ids, the edges and the declared options
influences the answer.

## See also

- `docs/GRAPH-LAYOUT.md` — the feature page: how the modes, the `Arrange`
  command, the SDK configuration and the example fit together.
- `packages/sdk/README.md` — `graph.layout`, `builder.graphLayout` and
  `builder.graph.arrange()`.
