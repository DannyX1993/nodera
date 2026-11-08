# @nodera/sdk-react

The React binding of `@nodera/sdk` and the first presentation engine adapter.

It supplies the two things the framework-agnostic SDK cannot: React components
that read a builder, and a selected canvas engine. A host that wants React mounts
one component, or composes its own surface inside the provider:

```tsx
import { createRoot } from "react-dom/client";

import { NoderaEditor } from "@nodera/sdk-react";

import { createDemoBuilder } from "./builder.js";

const builder = createDemoBuilder();

const root = document.getElementById("root");
if (root === null) {
  throw new Error("missing #root mount point");
}

createRoot(root).render(<NoderaEditor builder={builder} />);
```

(`examples/phase6-demo/src/main.tsx` and `demo-app.tsx`, trimmed. The host's
entry module also imports the engine stylesheet,
`import "@xyflow/react/dist/style.css";`, once before rendering — see
[Import restrictions](#import-restrictions).)

## Responsibility

- Turn one assembled `Builder` into a renderable editor: state, registries,
  renderers and feature flags all come from the builder, never from a second
  wiring step.
- Provide the React Flow engine adapter (`createReactFlowAdapter`) so a host can
  pass `adapter` to `createBuilder`.
- Convert the SDK's opaque renderer values into React registries
  (`createRendererSet`).

It never implements a canvas, a graph rule or an editing use case: the canvas is
`@nodera/canvas-react-flow`, the rules are the application use cases the SDK
already delegates to, and mounting is by definition framework code.

## `NoderaBuilderProvider` and `useBuilder`

```tsx
import type { ReactNode } from "react";

import { NoderaBuilderProvider, useBuilder } from "@nodera/sdk-react";

function SaveButton(): ReactNode {
  const builder = useBuilder();
  return (
    <button
      type="button"
      onClick={() => {
        const text = builder.document.serialize("json");
        if (text.ok) {
          console.log(`exported ${text.value.length} characters`);
        }
      }}
    >
      Save
    </button>
  );
}

// `render` is your host's root: createRoot(element).render(...)
render(
  <NoderaBuilderProvider builder={builder}>
    <SaveButton />
  </NoderaBuilderProvider>,
);
```

The provider consumes the builder's **own** store and registries — `builder.store`,
`builder.editor`, `builder.registries.{themes,layouts,panels,tools}` — and passes
them into `NoderaUiProvider` instead of letting the UI layer build defaults. That
is what makes an SDK contribution visible in the UI with no extra step:

```ts
assertValid(builder.registerPanel({ id: "acme.panel.audit", title: "Audit", region: "right" }));
assertValid(builder.theme.setDefault("nodera.dark")); // the registry ships nodera.light and nodera.dark
```

Both calls reach the rendered surface (a panel without a bound renderer is shown
with the framework's labelled placeholder, not skipped). Building the defaults
again inside the provider would make them silently invisible.

`useBuilder()` returns the exact builder object and throws outside a provider
(`useBuilder must be used inside <NoderaBuilderProvider>`): a surface that asks
for the builder has no meaningful fallback. `useBuilderRenderers()` returns the
React `RendererSet` of the nearest provider and throws for the same reason.

## `<NoderaEditor>`

The default composition, and only a default: shell, panel hosts, canvas
container, canvas and context menu, in one component.

| Prop | Purpose |
| --- | --- |
| `builder` | the assembled builder the editor renders (required) |
| `base` | `ComponentRenderers` to start from; defaults to the framework presets |
| `layout` | layout id from `builder.registries.layouts`; applied on mount when the store has a different one |
| `slots` | `Partial<EditorShellSlots>`; only the regions named are replaced |
| `onResizeRegion` | host hook after a region splitter drag |
| `className` | wrapper class for host styling |

```tsx
<NoderaEditor
  builder={builder}
  layout="acme.pipeline"
  slots={{ header: <Header title="ACME pipeline" /> }}
  onResizeRegion={(region, size) => {
    console.log(region, size);
  }}
/>
```

The composition is honest about what it can show:

- panels come from `builder.registries.panels` **and** the applied layout state,
  so a panel the host unregistered or a layout that hides it is not composed;
- feature flags gate panels: `features.minimap === false` drops the minimap
  panel, `features.validation === false` drops the validation panel. A feature is
  a capability, not a naming convention, so the mapping is explicit in
  `featureAllowsPanel`;
- the canvas region passes `builder.features.minimap` and
  `builder.adapter?.capabilities.controls` to `GraphCanvas`, and a palette drop
  becomes `builder.graph.addNode({ type, position })` — one mutation route, not
  two.

`<NoderaEditor>` supplies its own `NoderaBuilderProvider`, so a host mounts one
component. A host that wants its own arrangement uses the provider directly and
composes `@nodera/ui-react` + `@nodera/canvas-react-flow` itself.

## `createReactFlowAdapter`

```ts
import { createBuilder } from "@nodera/sdk";
import { createReactFlowAdapter } from "@nodera/sdk-react";

const builder = createBuilder({
  adapter: createReactFlowAdapter(),
});
```

The adapter declares `id: "nodera.react-flow"`, `label: "React Flow"` and every
capability in `AdapterCapabilities` as `true`. `createReactFlowAdapter({ capabilities })`
withdraws individual capabilities (an omitted key keeps its `true` default), which
is how a host that deliberately replaces a surface avoids a misleading
declaration. The capability record is written out explicitly, so adding a
capability to the SDK makes this package fail to type-check until the engine
decision is made.

The adapter only *declares*. It does not mount anything; mounting is
`<NoderaEditor>`.

## `createRendererSet`

The SDK records renderers as opaque `unknown` values keyed by stable ids. This is
the only place in the framework where they become React component types.

```ts
import { createRendererSet } from "@nodera/sdk-react";

const renderers = createRendererSet(builder.renderers);
```

Mapping: `nodes` / `edges` / `ports` go to the canvas adapter registries
(`NodeRendererRegistry`, `EdgeRendererRegistry`, `PortRendererRegistry`);
`properties` / `panels` / `toolbars` / `menus` go to the matching
`ComponentRenderers` slot of `@nodera/ui-react`. The canvas registries start empty
and keep their duplicate detection; the component slots start from the framework
presets and bound ids **replace** them, which is how a host replaces a built-in
panel renderer without unregistering it.

A value that React cannot render is a host programming error at the framework
boundary, so it fails loudly instead of being skipped:

```ts
export function isRenderableComponent(value: unknown): boolean {
  if (typeof value === "function") {
    return true;                                   // function or class component
  }
  if (typeof value === "string") {
    return value.length > 0;                       // intrinsic element type
  }
  if (typeof value === "object" && value !== null) {
    return "$$typeof" in value;                    // memo / forwardRef / lazy
  }
  return false;
}
```

`createRendererSet` throws `InvalidRendererBindingError` naming every offending
binding as `<kind>:<id>`, **before** building any registry. Throwing is
intentional: skipping a broken binding would leave the host with a renderer that
never appears and no diagnostic explaining why, which is the same policy
`ComponentRegistry` in `@nodera/ui-react` already applies. Call it where a
programming error is still recoverable (render, a test, a boot check), not per
keystroke.

## Import restrictions

- This package depends on `@nodera/canvas-react-flow` and **never** on
  `@xyflow/react`. A binding selects an engine; it does not reimplement or import
  one. `pnpm check:architecture` (rule
  `sdk-react-declares-the-adapter`) fails if the manifest drops the adapter
  dependency or declares `@xyflow`.
- `@nodera/sdk` never depends on this package. The direction is
  `sdk-react → sdk → core packages`, and `sdk-react → ui-react + canvas-react-flow`.
- The engine's stylesheet is a host concern, the Phase 4 precedent: the host
  imports `@xyflow/react/dist/style.css` (and therefore declares `@xyflow/react`
  itself). This package ships no stylesheet and no CSS copy.

## Public vocabulary

`@nodera/sdk-react/src/vocabulary.ts` re-exports, type-only, the contracts a host
renderer receives once its opaque value reaches this binding: `NoderaNodeRendererProps`,
`NoderaNodeData`, `NoderaNodePort`, `NoderaPortRendererProps`, `GraphCanvasProps`
(from `@nodera/canvas-react-flow`) and `ComponentRenderers`, `EditorShellSlots`,
`PanelRendererProps`, `PropertyRendererProps`, `ToolbarRendererProps`,
`MenuRendererProps` (from `@nodera/ui-react`). One owner per name, no
re-declaration.

## Scripts

`pnpm --filter @nodera/sdk-react test` (jsdom), `typecheck`, `build`.
