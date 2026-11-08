# Phase 5 demo — UI composition

A runnable **host application** built on the Nodera core. It is not a library: it
imports `@nodera/*` packages (and React Flow for the canvas) and composes the
Phase 5 UI into one editor. Everything it shows is produced by the framework
packages — the demo only chooses, places and replaces.

The point of the demo is the last sentence of the Phase 5 definition: **two
applications can use exactly the same core and present radically different
experiences, with the same graph semantics.** Here that is proven in one
application: the same running editor serves a classic three-region layout, a
dense IDE layout and a canvas-only layout, with two themes and two renderer sets.

## Run it

```bash
pnpm install
pnpm --filter @nodera/phase5-demo dev      # http://127.0.0.1:5175
pnpm --filter @nodera/phase5-demo build    # production bundle in dist/
pnpm --filter @nodera/phase5-demo preview  # serve the built bundle
```

The demo is part of the workspace (`pnpm-workspace.yaml` covers `examples/*`), so
the `@nodera/*` dependencies resolve through the workspace protocol.

## What is where

| File | Purpose |
| --- | --- |
| `src/main.tsx` | Bootstrap: builds the editor session (`createDemoEditor()` — engine, three node definitions, one edge definition, two seeded nodes and one seeded edge), builds the registries, applies the initial theme (`nodera.light`) and layout (`nodera.layout.editor`), makes the external `metadata` panel non-hideable (the host owns that decision too), mounts the app. |
| `src/definitions.ts` | Host vocabulary: three node definitions in three categories, one edge definition, the seeded graph and a **host-declared layout** (`demo.layout.workspace`). |
| `src/brand.tsx` | Host-authored renderers: a brand palette panel, a brand `string` property field, a host-composed validation panel and a custom port renderer. |
| `src/demo.tsx` | `DemoApp`: wires the host registries into `NoderaUiProvider`. |
| `src/app.tsx` | `Workspace`: the actual composition — slots, toolbar, theme/layout/mode controls, context menu, floating search, the external metadata column, persistence. |
| `index.html` | Page chrome only (plus the demo's own control styles). Every editor surface is styled by `@nodera/ui-react` through `var(--ndr-*)` tokens. |

## Which control demonstrates which Phase 5 capability

| Control | Capability |
| --- | --- |
| **Theme** select (Light / Dark) | S3 Level 1 — the theme engine's `ThemeDefinition` tokens are written as CSS custom properties by `NoderaUiProvider`, so panels, canvas nodes/edges/handles and the demo's own chrome change together. The canvas `colorMode` follows the same selection. |
| **Layout** select | S4 predefined **and** custom layouts: `nodera.layout.editor`, `nodera.layout.canvas-only`, `nodera.layout.ide` and the demo's own `demo.layout.workspace`. The host declares the fourth one; the framework never imposes any of them. |
| **Canvas only** button | S2 in its strongest form: the same core, the same panels, almost no chrome. The canvas takes the window and the editor keeps working. |
| Region splitters (drag the separators) | S4 "paneles redimensionables": `EditorShell.onResizeRegion` → `panelIdForRegion` → `useLayoutActions().resizePanel`, with the layout engine's clamping. |
| Panel `×` button in any panel title bar | S4 "paneles ocultables": `PanelHost` → `togglePanel`, and the region collapses with the panel. Show it again by re-applying the layout. |
| **Float search** | S4 "paneles flotantes": `floatPanel("search", rect)` puts the panel in the `floating` region with an explicit rectangle; it is rendered as an overlay above the canvas. If the applied layout does not declare the panel, the demo applies its own layout first and says so in the status line. |
| **Dock search** | S4 "paneles acoplables": `dockPanel("search", "left")` moves the floating panel back into the left region. |
| **Save layout** / **Restore layout** | S4 "persistencia de preferencias de layout": `createMemoryLayoutPreferenceStore()` behind the `LayoutPreferenceStore` port, driven through `useLayoutActions().savePreferences/restorePreferences`. Resize a panel, save, re-apply a different layout, restore — the size and visibility come back. The status line reports what the restore returned: `restored` (with the dropped saved panel ids), `missing` (nothing stored yet), `malformed` (the stored payload is unusable, with the engine's diagnostic) or `unknown-layout` (the stored layout is not declared here). |
| **Mode: select / pan** button | S5 "Modo de interacción" wired end to end: `useUiStateActions().setInteractionMode` writes the mode to the UI store, the host passes `ui.interactionMode` to `GraphCanvas.interactionMode`, and the adapter maps it to React Flow's drag props (`select` = left drag draws a selection box, middle/right pan; `pan` = any drag pans). |
| **Graph metadata column** (right, outside the shell) | S4 "paneles externos al canvas": the built-in `metadata` panel declares `region: "external"`, so no layout places it and the shell gives it no geometry. The host mounts `<PanelHost panelId="metadata" />` in its own column next to `EditorShell` — the panel keeps its registry, renderer and chrome, it just is not part of the shell. |
| **Renderers: default / brand** button | S3 Level 2 "component replacement": `renderers.panels.replace("nodera.panel.palette", BrandPalette)` and `renderers.properties.replace("string", BrandStringField)`. The palette becomes the host's own catalogue (with its own `+ Add` buttons) and every `string` property becomes the host's own field, while the panel keeps its ordering, grouping, visibility and validation. |
| Custom port renderer | S3 Level 2 "Port Renderer": the CSV source output port declares `visual.renderer = "demo.port.badge"`; the host registers that id in a `PortRendererRegistry` and draws its own handle. Ports that declare nothing keep the framework handle. |
| **Break the graph** (in the validation panel) | S8 application data in a report surface: the button adds a sink node whose required `table` property is unset, and the auto-validating `ValidationPanel` shows the resulting error. Clicking the issue's element selects it. The panel is a host composition (`ValidationPanel autoValidate` plus the host's own action). |
| Palette drag → canvas drop | S4/S2 "paneles externos al canvas" + D7: dragging a palette item writes the stable `application/nodera-node-definition` payload and the canvas adapter reports the flow position through `onDropNodeDefinition`; the host creates the node through `addNode`. Clicking a palette item is the keyboard/touch fallback. |
| Right-click on the canvas or on a node | Context menu from the UI store: the host opens it (`useUiStateActions().openMenu`) with the target kind, the menu renders the registered tools, dispatch runs through the same command dispatcher as the toolbar, and the menu closes itself. |
| Toolbar (undo/redo/copy/cut/paste/validate/fit view) | Declarative `ToolDefinition`s from the `ToolRegistry`, translated into application use cases. The demo filters the registry (`delete` is left out) to show that the host picks its own toolbar. `fit view` is bridged to the canvas controls the adapter renders, because the adapter keeps its React Flow instance private. |
| Status line (bottom-left of the canvas) | Reporting surface for what the composition did: link validation from `onLinkValidate`, drop results, layout persistence, renderer swaps. It is host chrome, not a framework component. |

## The same core, radically different layouts

The layout select switches between four compositions of the *same* registries,
the *same* graph and the *same* panel components:

- `nodera.layout.editor` — header, palette, properties, validation.
- `demo.layout.workspace` — the host's own: palette, properties **and** minimap,
  validation **and** history, plus a floating search panel.
- `nodera.layout.ide` — palette and navigator on the left, properties on the
  right, validation below, footer at the bottom.
- `nodera.layout.canvas-only` — a header bar and nothing else.

No graph semantic changes between them: the portable document, the definitions
and the history are identical. That is what "el producto debe permitir layouts
completamente diferentes" means in practice.

## Architecture notes

- The demo is a **host**: React Flow objects never leave the canvas adapter's
  boundary except for the one custom port renderer, which draws a `Handle`
  because a port is a canvas connection point by definition.
- Definitions are data. Renderers are referenced by id, so both the framework
  and the host can resolve an id to a component (`ComponentRegistry.replace`
  never touches data).
- Presentation state (theme, layout, preferences, open menus, search query)
  lives in `UiStateStore`; selection, history and clipboard stay in the
  application layer; viewport and node measurements stay in the canvas adapter.
  None of it enters the portable document.
- The demo may be deleted without touching the framework: it only consumes the
  public entry points of the packages.
