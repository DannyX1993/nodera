# SDK integration guide

Audience: a developer building an application on Nodera who has not read the
packages. This document covers how to go from nothing to a rendered editor, which
public name means what, and what the framework deliberately does not do yet.

The package-level detail lives in `packages/sdk/README.md` and
`packages/react-flow/README.md`; the executable proof lives in
`examples/phase6-demo`.

## What the SDK is

`@nodera/sdk` is the public entry point of the framework. It composes the
framework-free core — domain, definitions, document, application use cases,
history, validation, UI contracts, theme and layout engines — into one object,
and it translates between the public vocabulary and the internal contracts in
both directions: a host writes `type`/`label` and reads `type`/`label` back.

Three properties define it:

- **Framework-free.** No React, no React DOM, no canvas library. Nothing in the
  SDK renders. `pnpm check:architecture` enforces it.
- **Engine-free.** The canvas engine is chosen at composition time by declaring
  what it can present (`BuilderAdapter`), not by importing it. The SDK validates
  authored definitions against that declaration and never mounts anything.
- **Execution-free.** Nodera models and edits graphs; it never runs nodes, tools
  or workflows. A graph is data.

`@nodera/react-flow` is the first binding: React components that read a
builder, plus the React Flow engine adapter. The same package also owns the
canvas adapter those components render (`GraphCanvas`, the renderer registries
and the default renderers), which is why both layers ship together. A host that
renders a UI imports the SDK *and* a binding; a host that only builds graphs,
documents or definitions imports the SDK alone.

### The three integration levels

The levels come from `docs/PRODUCT-DESCRIPTION.md` §10 and apply unchanged to the
SDK:

| Level | What the host does | SDK surface |
| --- | --- | --- |
| 1. Theme | Registers token data and applies it | `builder.theme.register` / `setDefault` |
| 2. Component replacement | Replaces a node, edge, port, property, panel, toolbar or menu renderer | `renderer` / `component` on a definition, `builder.bindRenderer` |
| 3. UI composition | Builds its own interface instead of the default editor | `NoderaBuilderProvider` + `@nodera/ui-react` / the canvas layer of `@nodera/react-flow` |

Two hosts can use the same core and present radically different editors; the graph
semantics do not change.

## Worked example: from `createBuilder` to a rendered editor

The example is the Phase 6 demo, trimmed to one node, one edge, one layout, one
theme and one plugin. Each block names the API it exercises.

```ts
// --- Builder Factory: the two Nodera imports of the whole host -----------
import {
  assertValid,
  createBuilder,
  type Builder,
  type BuilderPlugin,
  type EdgeDefinitionInput,
  type LayoutDefinition,
  type NodeDefinitionInput,
} from "@nodera/sdk";
import { createReactFlowAdapter } from "@nodera/react-flow";

// --- Node API: `type` is the identity, `label` the display name ----------
const HTTP_REQUEST: NodeDefinitionInput = {
  type: "acme.http.request",
  version: "1.0.0",
  label: "HTTP request",
  description: "Calls an endpoint and emits its response.",
  category: "Sources",
  ports: {
    outputs: [{ id: "response", name: "Records", dataType: "records" }],
  },
  properties: [
    { id: "url", type: "string", label: "URL", required: true, order: 0 },
    {
      id: "method",
      type: "select",
      label: "Method",
      order: 1,
      defaultValue: "GET",
      options: ["GET", "POST", "PUT", "DELETE"],
    },
  ],
  renderer: HttpRequestNode, // opaque value: the SDK never inspects it
};

// --- Edge API: declared style keys stay visual, the rest are hints -------
const DATA_FLOW: EdgeDefinitionInput = {
  type: "acme.data-flow",
  label: "Data flow",
  style: { lineStyle: "dashed", strokeWidth: 3 },
};

const SINK: NodeDefinitionInput = {
  type: "acme.sink",
  label: "Sink",
  category: "Destinations",
  ports: { inputs: [{ id: "in", name: "In" }] },
};

// --- Layout API: a declarative panel arrangement -------------------------
const PIPELINE_LAYOUT: LayoutDefinition = {
  id: "acme.layout.pipeline",
  name: "Pipeline",
  regionSizes: { left: 230, right: 320, bottom: 170 },
  panels: [
    { panelId: "palette", region: "left", size: 230 },
    { panelId: "properties", region: "right", size: 320 },
    { panelId: "acme.panel.insights", region: "right", size: 220 },
  ],
};

// --- Plugin API: contributions through one narrow api --------------------
const plugin: BuilderPlugin = {
  id: "acme.insights",
  version: "1.0.0",
  install(api) {
    api.panels.register({
      id: "acme.panel.insights",
      title: "Insights",
      region: "right",
      renderer: "acme.panel.insights",
    });
  },
};

// --- Builder Factory: one call, validated as a whole ---------------------
export function createAppBuilder(): Builder {
  const builder = assertValid(
    createBuilder({
      id: "acme.builder",
      adapter: createReactFlowAdapter(), // engine chosen as data
      registry: {
        nodes: [HTTP_REQUEST, SINK],
        edges: [DATA_FLOW],
        layouts: [PIPELINE_LAYOUT],
      },
      features: { minimap: true, history: true, validation: true },
      document: { format: "ggd", version: "1.0.0" },
      ui: { layout: "acme.layout.pipeline" },
      plugins: [plugin],
    }),
  );

  // --- Theme API: a theme is a complete token set (11 groups) -----------
  assertValid(builder.theme.register(ACME_THEME));
  assertValid(builder.theme.setDefault(ACME_THEME.id));

  // --- Graph API: the supported mutation surface -------------------------
  const request = assertValid(
    builder.graph.addNode({
      type: "acme.http.request",
      nodeId: "node-request",
      position: { x: 60, y: 120 },
      properties: { url: "https://api.example.com/orders", method: "GET" },
    }),
  );
  const sink = assertValid(
    builder.graph.addNode({
      type: "acme.sink",
      nodeId: "node-sink",
      position: { x: 360, y: 120 },
    }),
  );
  assertValid(
    builder.graph.connect({
      source: request.id,
      target: sink.id,
      sourcePort: "response",
      targetPort: "in",
      type: "acme.data-flow",
    }),
  );

  return builder;
}
```

```tsx
// --- React binding: mount one component ----------------------------------
import { createRoot } from "react-dom/client";
import { NoderaEditor } from "@nodera/react-flow";

const builder = createAppBuilder();
const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(<NoderaEditor builder={builder} />);
}
```

(`examples/phase6-demo/src/builder.ts`, `nodes.tsx`, `theme.ts`, `main.tsx` and
`demo-app.tsx`; reduced to one example per API and renamed to `acme.*`.)

One ordering rule the snippet shows implicitly: a plugin can contribute a panel
definition but never its geometry, so `acme.panel.insights` only appears because
`PIPELINE_LAYOUT` places it. That is also why the layout is declared as data in
the configuration and not by the plugin.

Two details of that flow are worth knowing before writing your own:

- `adapter: createReactFlowAdapter()` is the only line that involves React Flow,
  and it does not import React Flow: the binding declares the engine's
  capabilities. A host that renders with something else omits this line and
  declares its own `BuilderAdapterInput`.
- `assertValid` throws `SdkAssertionError` on the first failing configuration.
  Inside a host that wants to display diagnostics instead, use `.ok` and render
  the issues (next section).

Two values in that snippet are host data rather than SDK types, so the block
stays readable: `HttpRequestNode` is a React component the host writes (any
value is accepted, the SDK never inspects it), and `ACME_THEME` is a
`CreateThemeInput` whose `tokens` must cover **all eleven token groups** — the
complete example is `examples/phase6-demo/src/theme.ts`.

## Vocabulary: public name, what it is, where it comes from

The vocabulary is symmetric: PRODUCT-DESCRIPTION §9 names the public contracts
`type`/`label`, and the SDK speaks those names in both directions. What you write
and what you read back are the same fields, so a host never has to learn the
core `id`/`name` naming. The core shapes (`Node`, `Edge`, `NodeDefinition`,
`EdgeDefinition`) stay reachable through `builder.editor`, the documented
escape hatch.

| Public name | What it is | Where it comes from | Read back as |
| --- | --- | --- | --- |
| `type` (node) | globally qualified node definition identity, e.g. `acme.http.request` | `NodeDefinitionInput`; becomes `NodeDefinition.id` | `NodeDefinitionView.type` |
| `type` (node instance) | the definition type an instance was created from | `builder.graph.addNode` request | `NodeInstanceView.type` (the domain's `definitionId`) |
| `id` (node instance) | identity of one node in a graph | `builder.graph.addNode` returns the instance | `NodeInstanceView.id`; generated from the definition when omitted |
| `version` (instance) | definition version the instance was created against | the document when it pins one | `NodeInstanceView.version`, absent when the domain does not know it |
| `position` | where the host placed the node | `AddNodeRequest.position` / `graph.moveNode` | `NodeInstanceView.position`, absent until the node is placed |
| `label` | human-readable name of a definition | becomes `NodeDefinition.name` / `EdgeDefinition.name` | `NodeDefinitionView.label` / `EdgeDefinitionView.label` |
| `defaultLabel` (edge definition) | label an instance may inherit | `EdgeDefinition.label` | `EdgeDefinitionView.defaultLabel` |
| `category` | grouping of definitions in palettes and registries | required on `NodeDefinitionInput` | `NodeDefinitionView.category`; `registries.nodes.byCategory()` |
| `ports.inputs` / `ports.outputs` / `ports.bidirectional` | ports grouped by the direction a person thinks in | flattened by the SDK into `PortDeclaration[]` with `direction: "input" \| "output" \| "bidirectional"` | `NodeDefinitionView.ports` as `PortView[]` |
| `port.id` | stable port identity inside its definition, e.g. `response` | `PortInput.id`; an unqualified identifier, not a dot-qualified type | `PortView.id` |
| `port.required` | shorthand for `minConnections: 1` | `PortInput.required` | `PortView.required`, derived from `minConnections >= 1` |
| `properties[].options` | option list of a `select` / `multi-select` | `string[]` or `PropertyOption[]`; both normalize to `PropertyOption[]` (`{ value, label }`, `label === value` for a bare string) | `PropertyDefinition.options` |
| `properties[].component` | opaque renderer of a `custom` property, or a registered component id | `PropertyInput.component` | not part of a view: it is a renderer binding (`builder.renderers.properties`) |
| `renderer` | opaque presentation contribution of a node or edge | `NodeDefinitionInput.renderer` / `EdgeDefinitionInput.renderer` | `NodeDefinitionView.renderer` / `EdgeDefinitionView.renderer` (the derived id) |
| renderer id | the key a binding resolves the renderer by | derived: the definition `type` for nodes and edges, `<ownerType>.<propertyId>` for a property declared inside a node, `<propertyId>` for a standalone property | the same string, on the view |
| `source` / `sourcePort` / `target` / `targetPort` (edge instance) | the two endpoints of a connection, flat | `ConnectRequest` | `EdgeInstanceView`, flat — the serialized document keeps nested `{ nodeId, portId, direction? }` |
| `style` (edge) | declared visual keys plus renderer-only hints | `lineStyle`/`geometry`/`arrowStart`/`arrowEnd`/`color`/`animation`/`stateIndicatorIds` become the edge `visual`; every other key is stored under `visual.metadata.style` | `EdgeDefinitionView.visual` |
| `builder.id` | globally qualified id of the composition | defaults to `nodera.builder` | `builder.id` |
| `adapter.id` | globally qualified id of the presentation engine | e.g. `nodera.react-flow` | `builder.adapter?.id` |

Three naming rules follow from the table, and each of them is a deliberate
deviation from the illustrative contract in `docs/FASE6-DEFINITION.md`:

1. **Every `type`, plugin id, adapter id and builder id is globally qualified**
   (`vendor.feature-name`, at least one dot). Phase 1 rejects an unqualified
   definition id, and an unqualified one would collide silently across plugins.
   An unqualified value is `sdk.invalid-id`.
2. **`label` is not `id`.** `label` maps to the definition `name`; the public
   `type` is the definition `id`. The domain keeps using `id`/`name` internally;
   the SDK translates once, in `src/authoring/`.
3. **Renderer ids are derived, not authored.** You declare `renderer: MyNode` on
   the definition and the SDK binds it under the definition `type`. There is no
   second id to keep in sync.

### Reading a graph

A host that only displays state never has to touch `builder.editor`: the graph
reads speak the same vocabulary the mutations accept.

```ts
for (const node of builder.graph.nodes()) {
  // { id, type, version?, position?, properties, metadata? }
  table.set(node.id, { type: node.type, at: node.position, values: node.properties });
}

for (const edge of builder.graph.edges()) {
  // flat: source/sourcePort/target/targetPort, plus type?, label?, metadata?
  table.link(edge.source, edge.sourcePort, edge.target, edge.targetPort);
}

// definitions read the same way
const definition = builder.registries.nodes.get("acme.http.request");
if (definition !== undefined) {
  render(definition.label, definition.category, definition.ports);
}
```

Two things that surprise a host coming from the serialized format:

- **`EdgeInstanceView` is flat.** The document stores `source: { nodeId, portId }`
  because a round trip has to keep the direction each port was declared with, and
  the document is a separate published contract. A view keeps the port identity
  and hands you two strings.
- **Absent means absent.** `position` and `version` are omitted when the domain
  does not have them; nothing is defaulted to `{ x: 0, y: 0 }`.

## Errors are data

Every operation that can fail returns a `Result`. The SDK never throws for input
problems, and it exposes exactly one error type:

```ts
export interface SdkError {
  readonly code: SdkIssueCode;
  readonly message: string;
  readonly path?: readonly string[];                        // e.g. ["registry", "nodes", "acme.http.request"]
  readonly metadata?: Readonly<Record<string, unknown>>;    // structured context
}

export interface SdkIssue extends SdkError {
  readonly severity: "error" | "warning";
}

export type SdkIssues = readonly SdkIssue[];
```

`SDK_ISSUE_CODES` is the closed list of the 13 codes such an issue can carry.

Consequences worth designing around:

- **One list per failed call.** `createBuilder` collects the issues of every
  configured input, so you fix one round of mistakes, not one mistake per run.
  Post-construction calls return the issues of that call.
- **`error` versus `warning`.** An `error` means the call failed and nothing was
  applied — registrations are transactional, a rejected definition leaves no
  trace. A `warning` means the composition works but something cannot be
  honoured: `builder.diagnostics` currently carries the capability gaps between
  the selected engine and the authored definitions.
- **Codes are the branching surface.** `code` is stable and closed
  (`SDK_ISSUE_CODES`); `message` is for humans and may be reworded. Match on
  `code`, and keep `metadata` for detail you may display (`domainCode` keeps the
  originating document or parse code, `elementId` names the graph element).
- **Malformed data is a `Result`.** A value the SDK requires to be an object,
  an array, a string or a boolean is shape-checked once, at the boundary that
  owns it, and reported with the `path` of the offending input (`["features"]`,
  `["document"]`, `["panels", "id"]`, `["request"]`, or — inside a definition —
  `["label"]`). A `null` where an object is required, a number where a string is
  required and an object where an array is required are `sdk.invalid-input` (or
  the more specific code), never a `TypeError`.
- **Two ways to consume.** `.ok` for hosts that render diagnostics, `assertOk` /
  `assertValid` for linear boot code that should stop.

Rendering them is host code and small:

```ts
const result = builder.document.import(rawDocument);
if (!result.ok) {
  setStatus(result.error.map((issue) => `${issue.code}: ${issue.message}`).join(" | "));
  return;
}
```

(`examples/phase6-demo/src/demo-app.tsx`, same pattern in every handler.)

## Lifecycle: creating and disposing a builder

`createBuilder` returns the builder or every problem of the configuration,
whichever applies, and never a partially wired object:

```ts
const result = createBuilder({ registry: { nodes: [ACME_NODE] } });
if (!result.ok) {
  // one diagnostic per problem, none of them thrown
  return result.error.map((issue) => `${issue.path?.join(".") ?? ""} ${issue.code}`);
}
const builder = result.value; // fully composed: registries, store, editor, facades
```

`builder.dispose()` releases it. The contract is one sentence, and the columns
below are the complete lists:

> **After `dispose()` every operation that mutates the graph or extends the
> builder fails with `sdk.disposed`; every read keeps working.**

| Refused with `sdk.disposed` | Still available |
| --- | --- |
| `registerNode`, `registerEdge`, `registerProperty`, `registerPanel`, `registerTool` | `builder.registries.*`, `builder.properties` |
| `registries.nodes.unregister`, `registries.edges.unregister` | every other `builder.registries.*` member |
| `bindRenderer`, `use`, `createEditor` | `builder.events.on` / `once` / `off` / `emitSdk` |
| `theme.register`, `theme.setDefault` | `theme.active`, `theme.all` |
| `layout.register`, `layout.setDefault` | `layout.active`, `layout.all` |
| `graph.addNode`, `removeNode`, `moveNode`, `updateProperties`, `connect`, `disconnect`, `select`, `clearSelection` | `graph.validate`, `nodeCount`, `edgeCount`, `selectedNodes`, `selectedEdges`, `canUndo`, `canRedo` |
| `graph.undo`, `graph.redo` — nothing is undone, both return `false` | `document.create`, `export`, `serialize`, `deserialize`, `validate` |
| `document.import` | `builder.store` reads, `builder.renderers`, `builder.features`, `builder.diagnostics` |

Disposal closes mutations because they would change state the host is no longer
composing; it leaves reads open because a host that unmounts an editor still
renders the state it already received. `undo()` and `redo()` keep the history
engine's boolean signature, so they have no code to report: they perform nothing
and return `false`. Disposing twice is safe.

```ts
builder.dispose();

const refused = builder.graph.addNode({ type: "acme.http.request" });
// refused.ok === false && refused.error[0].code === "sdk.disposed"

const exported = builder.document.serialize("json"); // still exports
```

## Choosing the engine

The engine is a value, not an import. `BuilderAdapter` declares what the selected
engine can present:

```ts
export interface BuilderAdapter {
  readonly id: string;      // "vendor.canvas-engine"
  readonly label: string;
  readonly capabilities: AdapterCapabilities;
}
```

`AdapterCapabilities` is a fixed record of eleven booleans: `canvas`, `minimap`,
`controls`, `zoomPan`, `dragAndDrop`, `nodeRenderers`, `edgeRenderers`,
`portRenderers`, `propertyRenderers`, `edgeStyles`, `customPanels`.

To select an engine you either pass a binding's factory
(`createReactFlowAdapter()` from `@nodera/react-flow`) or declare it yourself:

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

Omitted capabilities are `false` (only `canvas` defaults to `true`). The builder
derives what your definitions need with `requirementsFrom({ nodes, edges })`,
compares it with `capabilityGaps(adapter, requirements)` and stores the result in
`builder.diagnostics` as `sdk.renderer-unsupported` warnings. A gap is a warning,
not an error: the definition stays registered and you may still wire that
renderer yourself.

### What a binding owns

A new graph engine (or a Vue/Angular adapter) is a new package, never an SDK
change. A binding owns exactly five things:

1. the `create<Engine>Adapter()` factory: one `BuilderAdapter` with the
   capabilities the engine really presents;
2. the framework provider that hands the builder's own store and registries to
   the framework layer (`NoderaBuilderProvider` does this for React);
3. the opaque-value boundary: converting `builder.renderers` (opaque `unknown`
   values keyed by id) into the framework's own renderer registries
   (`createRendererSet` does this for React, and is the only place allowed to
   assert that a value is a component);
4. mounting: the component or function that actually draws the canvas and the
   panels (`<NoderaEditor>`);
5. the engine's stylesheet, which the host imports (see Known limits).

The SDK itself stays untouched, and a host that only uses `@nodera/sdk` keeps
working.

## What a plugin can do in Phase 6

A plugin is `{ id, version, install(api) }`. `install` runs synchronously and can
contribute nodes, edges, properties, panels, tools, themes and layouts, plus bind
an opaque renderer value to a slot. Each contribution goes through the builder
method of the same name, so a plugin is subject to exactly the validation,
duplicate detection and renderer binding a host is.

Guarantees the SDK gives a plugin author:

- the id and version are validated **before** `install` runs, and a plugin id
  installs once per builder (`sdk.plugin-conflict`), so a rejected plugin leaves
  no half-registration;
- a throw inside `install` becomes `sdk.plugin-invalid` instead of escaping;
- a failing contribution does not undo the successful ones; every failure is
  returned in the `use()` result and announced once through `plugin.error`;
- a fully successful install announces exactly one `plugin.registered` with the
  contribution ids in registration order.

**What Phase 7 will add — not available today.** A plugin manifest with an SDK
version and declared dependencies, a registry of manifests, dependency
resolution, load/activate/deactivate lifecycle, cross-plugin conflict detection
and example plugins. In Phase 6 there is no manifest, no compatibility policy
beyond the id/version check, and no way for a plugin to be deactivated or
retracted.

## Known limits

These are honest boundaries of Phase 6, not roadmap guesses.

- **Renderer values are opaque by design.** The SDK stores what you pass and
  never inspects it, so a wrong value cannot be diagnosed by the SDK: the
  framework binding is what rejects a non-renderable value
  (`InvalidRendererBindingError` in `@nodera/react-flow`). A host that uses the
  SDK alone owns that check.
- **The SDK ships no stylesheet.** The React binding mounts the engine, so the
  host imports the engine's CSS itself (`import "@xyflow/react/dist/style.css";`)
  and declares that dependency. There is no Nodera stylesheet to include, and no
  CSS copy inside the binding.
- **A plugin's `install` cannot read the builder under construction.**
  `BuilderPluginApi` exposes the contribution slots, not the builder, and
  `install` runs before `createBuilder` returns. Read composition facts later
  (from the object `createBuilder` returned) or contribute them as data.
- **The default edge renderer honours some style hints only.** `strokeWidth` and
  `dashArray` from the definition's `style` are applied over the theme token
  fallbacks; `color` and `lineStyle` are carried on the mapped edge but the
  default renderer keeps the stroke token-driven, so a host that needs those
  writes a custom edge renderer. Nothing is dropped: the values stay on the edge.
- **No `exports` map and no bundle yet.** `@nodera/sdk` and `@nodera/react-flow`
  are consumed from source (`main`/`types` → `./src/index.ts`, `tsc --noEmit`),
  and publishing is a Phase 8 concern. A host bundler resolves the TypeScript
  sources directly.
- **`builder.editor` is an escape hatch.** It is the editing session behind the
  facades. `builder.graph` and `builder.document` are the supported surface for
  mutation; reaching into the editor bypasses no rule but does skip the SDK's
  translation, so prefer the facades.
- **No grouping, no runtime, no execution.** `features: { grouping: true }` is
  rejected with `sdk.feature-unsupported` because the capability does not exist;
  only `minimap`, `history` and `validation` are implemented.

## Where to go next

- `packages/sdk/README.md` — the package, its APIs and its error model.
- `packages/react-flow/README.md` — the React Flow integration: the canvas
  adapter (engine) and the SDK binding (composition).
- `docs/PROJECT-STRUCTURE.md` §7.3 — the package boundaries and the executable
  rules that enforce them.
- `examples/phase6-demo` — the complete integration, importing only
  `@nodera/sdk` and `@nodera/react-flow`. Its `pnpm test` runs
  `src/imports.test.ts`, which parses every source file and fails on any other
  internal `@nodera/*` package or on an `@xyflow/react` import other than its
  stylesheet.
- `odd/tasks/fase6-sdk.md` — the Phase 6 decisions (D1–D21) with their rationale.
