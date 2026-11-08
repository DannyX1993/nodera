# @nodera/sdk

The public entry point of the Nodera graph editing framework: the builder
factory, the authoring vocabulary for nodes, edges, ports and properties, the
engine-agnostic presentation port, and the document, registry, event, plugin,
theme and layout APIs a host application composes.

The package is framework- and engine-free. It imports no React, no React DOM and
no canvas library; `pnpm check:architecture` fails when it does. It composes the
framework-free core (`@nodera/domain`, `@nodera/document`, `@nodera/application`,
`@nodera/ui-core`, `@nodera/theme-engine`, `@nodera/layout-engine` and the
definition registries) and adds two things of its own: the composition root and
the translation between the public vocabulary and the internal contracts — in
both directions, so a host writes `type`/`label` and reads `type`/`label` back.

It does not do the following:

- render or mount anything — no component is rendered, no DOM node is created,
  no engine is imported; `builder.editor` is an editing session, not a surface;
- inspect, type or validate a renderer value — renderers cross the boundary as
  opaque `unknown` values and are keyed by stable ids (`bindRenderer`);
- execute graphs, nodes or tools — Nodera models and edits graphs and never
  interprets them;
- own plugin manifests, dependency resolution or an activation lifecycle — the
  Phase 6 plugin contract is authoring plus synchronous installation.

A host that wants React and the React Flow canvas adds `@nodera/react-flow`, the
React binding and the first engine adapter — the same package that owns the
React Flow canvas adapter underneath.

## Install

The workspace package is consumed from source. `main` and `types` both point at
`./src/index.ts`, so there is no build step and no `exports` map yet:

```json
{
  "dependencies": {
    "@nodera/sdk": "workspace:*"
  }
}
```

Every public name is exported from `src/index.ts`; no other path is a supported
import. `pnpm --filter @nodera/sdk test`, `typecheck` and `build` run the package
scripts (`build` and `typecheck` are both `tsc --noEmit`).

## Composition root

`createBuilder(configuration)` validates one declarative configuration and wires
the builder. It is fail-closed: every issue of every configured input is
collected and returned together as `Result<Builder, SdkIssues>`, and no
partially wired builder escapes.

The whole integration of the Phase 6 demo is this function, trimmed of the graph
seeding and the panel-renderer replacement it performs afterwards:

```ts
export function createDemoBuilder(): Builder {
  const builder = assertValid(
    createBuilder({
      id: DEMO_BUILDER_ID,
      adapter: createReactFlowAdapter(),
      registry: {
        nodes: DEMO_NODES,
        edges: DEMO_EDGES,
        layouts: [DEMO_LAYOUT],
      },
      features: { minimap: true, history: true, validation: true },
      document: { format: "ggd", version: "1.0.0" },
      ui: { theme: BUILT_IN_THEME_ID, layout: DEMO_LAYOUT_ID },
      plugins: [demoPlugin],
    }),
  );

  composedBuilder = builder;

  assertValid(builder.theme.register(DEMO_THEME));
  assertValid(builder.theme.setDefault(DEMO_THEME_ID));

  return builder;
}
```

(`examples/phase6-demo/src/builder.ts`. `createReactFlowAdapter()` comes from
`@nodera/react-flow`; the `adapter` field accepts any `BuilderAdapterInput`, see
[Engine adapter port](#engine-adapter-port).)

Every configuration field is optional. `BuilderConfiguration` groups them by
concern — `id`, `adapter`, `registry`, `features`, `document`, `ui`, `graph`,
`plugins` — and defaults to the framework presets (`nodera.builder` as id, the
three supported features enabled, GGD format, the default theme and editor
layout, no plugins). `graph.layout` defaults to `{ mode: "free" }`: the
framework places nothing unless the host asks (see
[Graph layout mode](#graph-layout-mode--graphlayout)).

### `assertOk` and `assertValid`

Both helpers unwrap a `Result` for linear host code and throw a single
`SdkAssertionError` carrying the issue list. The SDK itself never throws for
data; these exist for hosts that prefer one throw at a boundary they chose.

```ts
import { assertOk, assertValid, createBuilder } from "@nodera/sdk";

const builder = assertValid(createBuilder({ id: "acme.builder" }));
assertOk(builder.registerNode(ACME_NODE));
```

Use `result.ok` when the host wants to render diagnostics instead of aborting
(see [Error model](#error-model)).

## Authoring vocabulary

### Nodes — `builder.registerNode`

```ts
const HTTP_REQUEST: NodeDefinitionInput = {
  type: "demo.http.request",
  version: "1.0.0",
  label: "HTTP request",
  description: "Calls an HTTP endpoint and emits its response.",
  category: "Sources",
  icon: "globe",
  ports: {
    outputs: [{ id: "response", name: "Records", dataType: "records" }],
  },
  properties: [
    {
      id: "url",
      type: "string",
      label: "URL",
      required: true,
      order: 0,
      defaultValue: "https://api.example.com/orders",
    },
    {
      id: "method",
      type: "select",
      label: "Method",
      required: true,
      order: 1,
      defaultValue: "GET",
      options: ["GET", "POST", "PUT", "DELETE"],
    },
  ],
  renderer: HttpRequestNode, // host component; the SDK never inspects it
};

assertValid(builder.registerNode(HTTP_REQUEST));
```

(`examples/phase6-demo/src/nodes.tsx`, trimmed.)

`NodeDefinitionInput` fields: `type`, `version?`, `label`, `description?`,
`category` (required), `icon?`, `ports?` (`inputs` / `outputs` /
`bidirectional`), `properties?`, `connectionPolicy?`, `visual?`,
`validationRuleIds?`, `metadata?` and `renderer?`.

Two deliberate deviations from `docs/FASE6-DEFINITION.md`:

- **`type` must be globally qualified** (`vendor.feature-name`, at least one
  dot). The Phase 1 definition validator rejects any definition id that is not
  dot-qualified, and an unqualified id such as the illustrative edge
  `type: "conditional"` of `docs/FASE6-DEFINITION.md` would collide silently
  across plugins. An unqualified type is `sdk.invalid-id` with a message naming
  the expected shape.
- **`label` becomes the definition `name`**. The public vocabulary says `type`
  and `label`, the internal packages say `id` and `name`; the translation
  happens once, in `src/authoring/`, and never leaks the internal naming.

### One vocabulary at the boundary

§9 of `docs/PRODUCT-DESCRIPTION.md` ("Contratos públicos y tipado") names the
public contracts `type`/`label`. A host must not meet two vocabularies at one
boundary, so the SDK speaks that vocabulary in **both directions**: what an
author writes and what the same host reads back are the same names.

| | In (authoring) | Out (reads) |
| --- | --- | --- |
| node definition | `type`, `label` | `NodeDefinitionView.type`, `.label` |
| edge definition | `type`, `label` | `EdgeDefinitionView.type`, `.label` |
| port | `id`, `dataType`, `required` | `PortView.id`, `.dataType`, `.required` |
| node instance | `type`, `position`, `properties` | `NodeInstanceView` — same names |
| edge instance | `type`, `source`, `sourcePort`, `target`, `targetPort` | `EdgeInstanceView` — same names, flat |
| core shape (`Node`, `Edge`, `NodeDefinition`, `EdgeDefinition`) | — | only through `builder.editor`, the documented escape hatch |

`registerNode`, `registerEdge`, `builder.registries.nodes`, `builder.registries.edges`
and every `builder.graph` method return those views:

```ts
const node = assertOk(builder.registerNode(ACME_NODE));
node.type; // "acme.node" — the definition id, under its public name
node.label; // "Acme node" — the definition name, under its public name

const added = assertValid(builder.graph.addNode({ type: "acme.node" }));
added.type; // the definition type; `added.definitionId` does not exist
added.position; // absent when the node has not been placed yet
```

Two rules the view types pin:

- **`required` is derived.** `PortView.required` is `minConnections >= 1`, so a
  renderer gets a boolean and a port without a declared minimum is simply not
  required.
- **No key is set to `undefined`.** The SDK compiles with
  `exactOptionalPropertyTypes`, so an absent value is an absent key.

**`EdgeInstanceView` is flat; the serialized document is not.** A view keeps
`source`/`sourcePort`/`target`/`targetPort` as four strings, which is what a host
needs to render an edge and to keep port identity intact in its own state. The
portable `GraphDocument` keeps nested endpoints
(`{ nodeId, portId, direction? }`), because its job is to survive a round trip
with the direction each port was declared with, and it is a separate published
contract (Phase 2). `builder.document` therefore returns and accepts the
document's own shape — the *wire* format — while every other read speaks §9.

### Edges — `builder.registerEdge`

```ts
const FALLBACK_EDGE: EdgeDefinitionInput = {
  type: "demo.edge.fallback",
  version: "1.0.0",
  label: "Fallback route",
  description: "Route taken when the primary stage produced nothing.",
  style: { lineStyle: "dotted", color: "#94a3b8", arrowEnd: true },
};

const DATA_FLOW_EDGE: EdgeDefinitionInput = {
  type: "demo.edge.data-flow",
  version: "1.0.0",
  label: "Data flow",
  style: { lineStyle: "dashed", strokeWidth: 3 },
};

assertValid(builder.registerEdge(DATA_FLOW_EDGE));
assertValid(builder.registerEdge(FALLBACK_EDGE));
```

(`examples/phase6-demo/src/builder.ts`.)

`style` is split honestly. The keys the domain declares (`lineStyle`,
`geometry`, `arrowStart`, `arrowEnd`, `color`, `animation`, `stateIndicatorIds`)
become the edge `visual`; every other key (`strokeWidth`, `dashArray`, any
renderer-only hint) is stored under `visual.metadata.style`, so nothing an author
writes is dropped and no domain field is invented. The value reaches a renderer
through the canvas adapter; the default edge renderer honours `strokeWidth` and
`dashArray` (see "Known limits" in `docs/SDK-GUIDE.md` for the others).

### Shared properties — `builder.registerProperty`

A property registered on its own is stored in `builder.properties` and can then
be referenced by any definition:

```ts
assertValid(
  builder.registerProperty({
    id: "acme.retryCount",
    type: "number",
    label: "Retries",
    defaultValue: 3,
    order: 0,
  }),
);
```

`PropertyInput.options` accepts plain strings or full `{ value, label }` pairs;
the SDK normalizes both to `PropertyOption[]` (`{ value, label }`, with
`label === value` for the shorthand). A `select` / `multi-select` property
requires at least one option, a `custom` property requires a `component`, and an
unknown `type` is `sdk.invalid-input` whose message lists the accepted property
types.

## Error model

Every operation on the public surface reports failures the same way.

```ts
export const SDK_ISSUE_CODES = [
  "sdk.invalid-id",
  "sdk.invalid-input",
  "sdk.duplicate-id",
  "sdk.unknown-definition",
  "sdk.feature-unsupported",
  "sdk.unknown-theme",
  "sdk.unknown-layout",
  "sdk.unsupported-format",
  "sdk.document-invalid",
  "sdk.renderer-unsupported",
  "sdk.plugin-invalid",
  "sdk.plugin-conflict",
  "sdk.disposed",
] as const;

export type SdkIssueCode = (typeof SDK_ISSUE_CODES)[number];
export type SdkSeverity = "error" | "warning";

export interface SdkError {
  readonly code: SdkIssueCode;
  readonly message: string;
  readonly path?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SdkIssue extends SdkError {
  readonly severity: SdkSeverity;
}

export type SdkIssues = readonly SdkIssue[];
```

(`packages/sdk/src/errors.ts`.)

- **Codes are closed and stable.** They are part of the public contract: a host
  may branch on them, and a new code is a deliberate addition to the list above.
- **One error shape on the whole surface.** `createBuilder`, every `register*`,
  `bindRenderer`, `theme.*`, `layout.*`, `graph.*`, `document.*`, `use()` and
  `createEditor()` all fail with `SdkIssues`. `SdkError` is the internal
  single-failure form; the builder converts it with `toIssues` before a caller
  can see it.
- **One `Result` level.** The core packages return nested results in places; the
  SDK flattens them, so `builder.document.import` is `Result<Graph, SdkIssues>`
  and never `Result<Result<…>>`.
- **`warning` versus `error`.** `error` means the call failed and nothing was
  applied. `warning` means the composition is usable but something cannot be
  honoured, currently the capability gaps collected in `builder.diagnostics`:
  a definition needs a renderer slot the selected engine does not declare
  (`sdk.renderer-unsupported`). A warning never fails `createBuilder`.
- **Malformed data is a `Result`, never a throw.** A value the SDK requires to
  be an object, an array, a string or a boolean is checked once at the boundary
  that owns it and reported with the `path` of the offending input: `["features"]`,
  `["adapter", "capabilities"]`, `["panels", "id"]`, `["request"]`, and — inside
  a definition, where every path is relative to it — `["label"]`. `null` where an
  object is required, a number where a string is required and an object where an
  array is required are `sdk.invalid-input` (or `sdk.invalid-id` when the rule is
  about an identifier, or `sdk.plugin-invalid` for a plugin), never a
  `TypeError`. An *internal invariant* violation still throws.
  `src/public-contract.test.ts` is the guard for this rule.
- **The list holds only codes the SDK actually emits.** A capability an engine
  cannot honour is a `sdk.renderer-unsupported` warning, and a renderer value
  that is not a component is rejected by the React binding with
  `InvalidRendererBindingError`, because that is a host programming error at the
  framework boundary and not data flowing through a `Result`.

## Engine adapter port

The engine is selected through data, never through an import.

```ts
export interface BuilderAdapter {
  /** Globally qualified id, e.g. `nodera.react-flow`. */
  readonly id: string;
  /** Human-readable engine name. */
  readonly label: string;
  readonly capabilities: AdapterCapabilities;
}

export const ADAPTER_CAPABILITIES = [
  "canvas",
  "minimap",
  "controls",
  "zoomPan",
  "dragAndDrop",
  "nodeRenderers",
  "edgeRenderers",
  "portRenderers",
  "propertyRenderers",
  "edgeStyles",
  "customPanels",
] as const;

export interface BuilderAdapterInput {
  readonly id: string;
  readonly label: string;
  /** Omitted capabilities are `false`; `canvas` is the only default `true`. */
  readonly capabilities?: Partial<AdapterCapabilities>;
}
```

(`packages/sdk/src/adapter/adapter.ts`.)

A host that is not using a binding declares the engine itself:

```ts
const builder = assertValid(
  createBuilder({
    adapter: {
      id: "acme.canvas-engine",
      label: "ACME canvas",
      capabilities: { canvas: true, zoomPan: true, nodeRenderers: true },
    },
  }),
);
```

Two functions connect authored definitions to an adapter:

- `requirementsFrom({ nodes, edges })` derives the presentation surface the
  definitions actually need (`nodeRenderers`, `edgeRenderers`, `portRenderers`,
  `propertyRenderers`, `edgeStyles`);
- `capabilityGaps(adapter, requirements)` compares the two and returns the
  `sdk.renderer-unsupported` warnings that end up in `builder.diagnostics`.

```ts
const gaps = capabilityGaps(adapter, requirementsFrom({ nodes, edges }));
```

**A new graph engine is a new binding package, never an SDK change.** The SDK
declares the port and validates against it; mounting a canvas is framework code
and belongs to a binding package like `@nodera/react-flow`, which ships the React
Flow adapter, the canvas layer, `createReactFlowAdapter()` and `<NoderaEditor>`.

## APIs

### Graph — `builder.graph`

The supported surface for editing the builder's graph. Every method delegates to
the application use case of the same name (`Result` returns, one history unit per
mutation); no use case is reimplemented.

```ts
const request = assertValid(
  builder.graph.addNode({
    type: "demo.http.request",
    nodeId: "demo-node-request",
    position: { x: 60, y: 120 },
    properties: { url: "https://api.example.com/orders", method: "GET" },
  }),
);

assertValid(
  builder.graph.connect({
    source: request.id,
    target: "demo-node-enrich", // an enrich instance added the same way
    sourcePort: "response",
    targetPort: "in",
    type: "demo.edge.data-flow",
    label: "records",
  }),
);

builder.graph.undo();
const report = builder.graph.validate();
```

(`examples/phase6-demo/src/builder.ts` and `demo-app.tsx`, trimmed.)

Members: `addNode`, `removeNode`, `moveNode`, `updateProperties`, `connect`,
`disconnect`, `arrange`, `nodes`, `edges`, `select`, `clearSelection`, `undo`,
`redo`, `canUndo`, `canRedo`, `validate`, `nodeCount`, `edgeCount`,
`selectedNodes`, `selectedEdges`. `sourcePort` / `targetPort` default to the
node's first output / input port.

Every mutation and every read answers in the §9 instance vocabulary
(`NodeInstanceView`, `EdgeInstanceView`), so a host can read the whole graph
without touching `builder.editor`:

```ts
for (const node of builder.graph.nodes()) {
  render(node.id, node.type, node.position, node.properties);
}

for (const edge of builder.graph.edges()) {
  // flat: no `edge.connection.source.nodeId` anywhere
  route(edge.source, edge.sourcePort, edge.target, edge.targetPort, edge.type);
}
```

### Graph layout mode — `graph.layout`

Who owns node placement is host configuration, never a behaviour the framework
invents. `"free"` (the default) is exactly the previous behaviour: a node added
without a position stays unpositioned, and the canvas adapter decides how to
render it until the host places it. `"auto"` places **only the nodes the host
left unpositioned**, on a grid anchored at the origin; a node that already
carries a position is never moved.

```ts
createBuilder({
  registry: { nodes: [ACME_NODE] },
  graph: {
    layout: { mode: "auto", direction: "vertical", spacing: 180 },
  },
});
```

Members: `mode` (`"free" | "auto"`, default `"free"`), `direction`
(`"horizontal" | "vertical"`, default `"horizontal"`; horizontal fills
row-major and arranges the ranks along `x`, vertical fills column-major and
arranges them along `y`), `spacing` (distance between adjacent slots, and the
in-rank distance of an arrangement, in document units, default `240`),
`strategy` (globally qualified id of the strategy [`arrange()`](#graph-layout-strategies--buildergraphlayout)
runs, default `nodera.graph-layout.layered`) and `rankSpacing` (distance between
consecutive ranks of an arrangement, default: the declared `spacing`).

The assigned position belongs to the same history unit as the creation: `undo()`
removes the node, `redo()` restores it where it was. A value outside these
unions, a spacing or rank spacing that is not a positive finite number, or a
`strategy` id no register holds, is a configuration problem reported as
`sdk.invalid-input` with path `graph.layout.<field>`, and the builder is not
created: nothing is guessed and no geometry is invented.

Re-laying out an existing graph is **not** part of the add: adding an edge or a
node never recalculates the whole graph. That is `graph.arrange()`, the explicit
`Arrange` command described below.

### Graph layout strategies — `builder.graphLayout`

`builder.graph.arrange()` is explicit and all-or-nothing: it asks the selected
strategy where every node goes, and applies the whole answer as one history unit,
so one `undo()` restores every previous position. The strategy sees plain data
(instance ids, current positions and edges), never a graph instance or a canvas,
so it can be replaced without touching any other layer.

```ts
const arranged = assertOk(builder.graph.arrange());
// the moved instances, in the §9 vocabulary: [{ id, type, position, ... }]

builder.graph.undo(); // every previous position, in one step
```

A call may override the configured direction and spacings **for that one
arrange**, and persists nothing: the next call without a request reads
`graph.layout` again, so a host can switch without rebuilding the builder. The
rules are the configuration's own — an unknown direction or a spacing that is not
a positive finite number is `sdk.invalid-input` at the field path (`direction`,
`spacing`, `rankSpacing`) and nothing moves.

```ts
assertOk(builder.graph.arrange({ direction: "vertical", spacing: 160, rankSpacing: 320 }));
assertOk(builder.graph.arrange()); // the configured direction and spacings again
```

The switching itself belongs to the host's own UI: the framework still ships no
runtime toggle for mode, direction or spacing inside the editor (S4),
`examples/layout-switch-demo` is the reference host.

A strategy answer that carries no position at all is an honest no-op: the `free`
strategy and an empty graph both return an empty list and push no history entry.
A strategy that answers a diagnostic makes `arrange()` return that diagnostic as
`"sdk.invalid-input"` (its own code stays in `metadata.strategyCode`) and moves
nothing.

Members of `builder.graphLayout`: `register(strategy)`, `setDefault(id)`,
`active()` (the selected id) and `all()` (every registered strategy). The
built-ins are `nodera.graph-layout.free` (no-op) and
`nodera.graph-layout.layered` (rank by longest path, in-rank order by node id,
no crossing minimization); a used id is a `sdk.duplicate-id` and an unknown one
is refused, so a plugin never shadows the host's selection.

A third-party layouter is a host-side adapter over this port: register it, then
select it by id — in configuration or with `setDefault`. The framework ships no
external layout dependency.

```ts
import type { GraphLayoutStrategy } from "@nodera/sdk";

const dagre: GraphLayoutStrategy = {
  id: "acme.dagre",
  place: (input) => dagreAdapter(input), // your adapter, your dependency
};

assertValid(builder.graphLayout.register(dagre));
assertValid(builder.graphLayout.setDefault(dagre.id));
builder.graphLayout.active(); // "acme.dagre" — the next arrange() runs it
```

There is no runtime toggle for any of this: mode, direction, spacing and
strategy are host configuration, never a control the framework puts in front of
a user. A host that wants a control of its own passes per-call overrides to
`arrange()` and selects the strategy with `builder.graphLayout.setDefault`; see
`examples/layout-switch-demo`.

### Document — `builder.document`

A thin facade over the Phase 2 document and serializer packages. Nothing is
reimplemented and nothing is thrown: document and parse diagnostics become
`sdk.document-invalid` issues that keep the originating code in
`metadata.domainCode`.

```ts
const serialized = builder.document.serialize("json");
if (!serialized.ok) {
  setStatus(issueSummary(serialized.error));
  return;
}

const imported = builder.document.import(JSON.parse(serialized.value));
const report = builder.document.validate(JSON.parse(serialized.value));

const serializer = builder.document.serializer("yaml");
const text = assertOk(serializer.serialize(builder.document.create()));
const reloaded = assertOk(serializer.deserialize(text));
```

(`examples/phase6-demo/src/demo-app.tsx` for the first two calls;
`serializer(format)` returns the FASE6 `{ serialize, deserialize }` object and is
illustrated from the interface.)

Members: `create()`, `import(input)`, `export(format)`, `serialize(format)`,
`deserialize(format, content)`, `validate(input)`, `serializer(format)` for
`"json" | "yaml"`. `import` is the only mutating call. `export` and `serialize`
announce `graph.exported`; both keep unknown document, graph, node and edge
fields from the last import, so a vendor document round-trips losslessly.

### Registry — `builder.registries`

The definition registries the builder owns and shares with its editors: `nodes`,
`edges`, `validators`, `themes`, `layouts`, `panels`, `tools`. They follow the
framework rule — a duplicate id is an explicit conflict, an unknown id an
explicit `not-found`, never a silent overwrite. The builder turns those into
`sdk.duplicate-id` / `sdk.unknown-definition`.

`nodes` and `edges` are **read adapters**: they answer in the §9 vocabulary
(`type`/`label`), and they are the supported way to read a definition. The
remaining slots are the framework registries themselves, unchanged.

```ts
const panel = builder.registries.panels.get("validation");
const nodeTypes = builder.registries.nodes.all().map((definition) => definition.type);

builder.registries.nodes.get("demo.http.request"); // NodeDefinitionView | undefined
builder.registries.nodes.require("demo.http.request"); // Result<NodeDefinitionView, SdkIssues>
builder.registries.nodes.byCategory("Sources"); // readonly NodeDefinitionView[]
builder.registries.nodes.categories(); // readonly string[]
builder.registries.edges.byConnectionType("data-flow"); // the edges registry's grouping
```

Members of both adapters: `all()`, `get(type)`, `has(type)`, `require(type)`,
`size` and `unregister(type)`. The node adapter adds `byCategory(category)` and
`categories()`; the edge adapter adds `byConnectionType(connectionType)`, because
the domain's `EdgeDefinition` declares connection types and no category — a
`byCategory` that could only ever return nothing would be a lie. `require` and
`unregister` return `Result`s (`sdk.unknown-definition`) and never throw; `get`
returns `undefined`.

Registering goes through the builder, not the registries, so validation, renderer
binding and diagnostics stay in one place: `registerNode`, `registerEdge`,
`registerProperty`, `registerPanel`, `registerTool`. Unregistering is the one
mutation the adapters expose, and it returns the view that left the registry.

### Event — `builder.events`

`builder.events` delegates the application events of the builder's editing
session verbatim (same names, payloads and order) and adds the two SDK-owned
events `plugin.registered` and `plugin.error`, because those describe builder
composition rather than graph editing. `EventBus` itself is unchanged.

```ts
useEffect(() => {
  const unsubscribe = [
    builder.events.on("node.created", (payload) => {
      append("node.created", `${payload.definitionId} → ${payload.nodeId}`);
    }),
    builder.events.on("graph.exported", (payload) => {
      append("graph.exported", `${payload.format} · ${payload.graphId}`);
    }),
  ];
  return () => {
    for (const off of unsubscribe) {
      off();
    }
  };
}, [builder, append]);
```

(`examples/phase6-demo/src/demo-app.tsx`.)

`on` / `once` return an idempotent unsubscribe function, `off(name, handler)`
removes by identity, `emitSdk(name, payload)` delivers an SDK-owned event only,
and `dispose()` releases every listener the API registered.

### Plugin — `builder.use`

A plugin is a stable identity, a semver version and synchronous contributions
through `BuilderPluginApi`:

```ts
export interface BuilderPlugin {
  /** Globally qualified id, e.g. `vendor.feature-name`. Installed once per builder. */
  readonly id: string;
  /** Version of the plugin itself, semver-shaped. */
  readonly version: string;
  readonly install: (api: BuilderPluginApi) => void;
}

export interface BuilderPluginApi {
  readonly nodes: { register(input: NodeDefinitionInput): Result<NodeDefinition, SdkIssues> };
  readonly edges: { register(input: EdgeDefinitionInput): Result<EdgeDefinition, SdkIssues> };
  readonly properties: { register(input: PropertyInput): Result<PropertyDefinition, SdkIssues> };
  readonly panels: { register(panel: PanelDefinition): Result<PanelDefinition, SdkIssues> };
  readonly tools: { register(tool: ToolDefinition): Result<ToolDefinition, SdkIssues> };
  readonly themes: { register(input: CreateThemeInput): Result<ThemeDefinition, SdkIssues> };
  readonly layouts: { register(layout: LayoutDefinition): Result<LayoutDefinition, SdkIssues> };
  readonly renderers: {
    bind(kind: RendererKind, id: string, value: unknown): Result<void, SdkIssues>;
  };
}
```

(`packages/sdk/src/plugin/plugin.ts`, member bodies abbreviated to their
signatures.)

```ts
const plugin: BuilderPlugin = {
  id: "acme.ai-nodes",
  version: "1.0.0",
  install(api) {
    const node = api.nodes.register(ACME_AGENT_NODE);
    if (!node.ok) {
      throw new Error(`acme.ai-nodes could not register its node: ${node.error[0]?.message}`);
    }
    const panel = api.panels.register({
      id: "acme.panel.ai",
      title: "AI configuration",
      region: "right",
      renderer: "acme.panel.ai",
    });
    if (!panel.ok) {
      throw new Error(`acme.ai-nodes could not register its panel: ${panel.error[0]?.message}`);
    }
  },
};

const installation = builder.use(plugin);
// installation.value: { pluginId, version, contributionIds }
```

Rules the SDK enforces: the id and version are checked **before** `install`
runs; a plugin id installs once per builder (`sdk.plugin-conflict`); a throwing
`install` becomes `sdk.plugin-invalid` instead of escaping; a failed contribution
does not undo the ones that worked (there is no rollback: what a plugin
registered before a throw stays registered). Failures of a run install are also
reported through `plugin.error`, one event per failed plugin: an install that
completes emits one event per failed contribution, while a throwing `install`
emits exactly one event describing the throw, because the throw aborted it. A
plugin rejected *before* `install` runs (invalid id or version, already
installed id) is reported in the issues `use()` returns and produces no event,
since nothing ran. Only a completely successful install announces
`plugin.registered`. Renderer bindings are not contributions and never appear in
`contributionIds`.

### Theme — `builder.theme`

`register(input)` takes a `CreateThemeInput` and goes through the theme engine's
validating `createTheme` (a throw becomes `sdk.invalid-input`).
`setDefault(themeId)` applies a registered theme to the builder's UI state, which
is what the presentation binding reads. `active()` and `all()` read the current
selection and the registry.

```ts
assertValid(builder.theme.register(DEMO_THEME));
const applied = builder.theme.setDefault(DEMO_THEME_ID);
```

### Layout — `builder.layout`

`register(layout)` takes a `LayoutDefinition`; `setDefault(layoutId)` applies it
together with the panel state the layout engine derives from the registered
panels, so the store never holds a layout whose panels the builder does not know.
`active()` and `all()` behave like their theme counterparts.

```ts
assertValid(
  builder.layout.register({
    id: "acme.pipeline",
    name: "Pipeline",
    regionSizes: { left: 230, right: 320, bottom: 170 },
    panels: [
      { panelId: "palette", region: "left", size: 230 },
      { panelId: "properties", region: "right", size: 320 },
    ],
  }),
);
assertValid(builder.layout.setDefault("acme.pipeline"));
```

### Renderer binding — `builder.bindRenderer` / `builder.renderers`

A renderer contribution is bound to a slot; the value is never inspected.

```ts
export const RENDERER_KINDS = [
  "nodes",
  "edges",
  "ports",
  "properties",
  "panels",
  "toolbars",
  "menus",
] as const;
```

Ids are derived, not invented: a node renderer is bound under its definition
`type`, an edge renderer under its definition `type`, and a property component
under `<ownerType>.<propertyId>` when the property is declared inside a node
(`<propertyId>` when it is registered on its own, and the plain id when the input
names an already-registered component).

```ts
const panel = builder.registries.panels.get("validation");
if (panel === undefined || panel.renderer === undefined) {
  throw new Error('the framework no longer registers the "validation" panel');
}
assertOk(builder.bindRenderer("panels", panel.renderer, HostValidationPanel));

const bound = builder.renderers.nodes.get("demo.http.request");
```

(`examples/phase6-demo/src/builder.ts`, trimmed.)

`builder.renderers` is an immutable snapshot of the bindings by kind, and it is a
new object after every registration, which is what the React binding memoises on.
Binding the same id twice is `sdk.duplicate-id`.

### Lifecycle — `builder.dispose()`

Disposing is how a host releases the composition. It is idempotent, and the
contract is one sentence you can rely on:

> **After `dispose()` every operation that mutates the graph or extends the
> builder fails with `sdk.disposed`; every read keeps working.**

The closed set, exactly:

| Refused with `sdk.disposed` | Still available |
| --- | --- |
| `registerNode`, `registerEdge`, `registerProperty`, `registerPanel`, `registerTool` | `builder.registries.*`, `builder.properties` |
| `registries.nodes.unregister`, `registries.edges.unregister` | every other `builder.registries.*` member |
| `bindRenderer`, `use`, `createEditor` | `builder.events.on` / `once` / `off` / `emitSdk` |
| `theme.register`, `theme.setDefault` | `theme.active`, `theme.all` |
| `layout.register`, `layout.setDefault` | `layout.active`, `layout.all` |
| `graph.addNode`, `removeNode`, `moveNode`, `updateProperties`, `connect`, `disconnect`, `select`, `clearSelection` | `graph.validate`, `nodeCount`, `edgeCount`, `selectedNodes`, `selectedEdges`, `canUndo`, `canRedo` |
| `graph.undo`, `graph.redo` — no mutation runs, both return `false` | `document.create`, `export`, `serialize`, `deserialize`, `validate` |
| `document.import` | `builder.store` reads, `builder.renderers`, `builder.features`, `builder.diagnostics` |

Reads stay open on purpose: a host that unmounts an editor still renders the
state it already received, so killing `document.create()` or `theme.active()`
would break a disposed builder's last frame. `undo()`/`redo()` are the two
mutations whose signature is the history engine's boolean, so they perform
nothing and report `false` instead of a code.

```ts
const builder = assertValid(createBuilder({ registry: { nodes: [ACME_NODE] } }));
builder.dispose();

const refused = builder.graph.addNode({ type: "acme.node" });
// refused.ok === false, refused.error[0].code === "sdk.disposed"

builder.graph.nodeCount(); // still a number: reads never fail
```

## Deliberately absent (Phases 7 and 8)

Phase 6 ships the plugin *authoring contract* and synchronous installation only.
The following do not exist and are not promised by any type here:

- plugin manifests (`PluginManifest`), a registry of manifests, sdk/compatibility
  checks, dependency resolution, load/activate/deactivate lifecycle, cross-plugin
  conflict detection and example plugins — Phase 7;
- `exports` maps, bundling, release automation, npm publishing, accessibility and
  i18n audits, performance work — Phase 8. Packages stay source-level
  (`main`/`types` → `./src/index.ts`, `tsc --noEmit`);
- Vue and Angular bindings. The adapter port is designed for them; none is
  implemented.

The Phase 6 decisions and their rationale are recorded in
`odd/tasks/fase6-sdk.md` (`## Decisions` D1–D21). The integration guide for a
third party is `docs/SDK-GUIDE.md`.

## Scripts

`pnpm --filter @nodera/sdk test`, `typecheck`, `build`.
