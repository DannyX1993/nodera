# @nodera/ui-react

The React UI composition layer of Nodera: the components and bindings a host
application uses to build its own editor interface around
`@nodera/canvas-react-flow`.

The framework offers functional components; it never imposes a layout. The host
decides which components it uses, where it places them and how they look.

## Composition rules

- Only the canvas region is required. Every other region disappears when the host
  omits its slot or when the applied layout does not place a visible panel there.
- A host may skip `EditorShell` entirely and place components itself. The example
  composition is a convention, not a requirement:

```tsx
<NoderaUiProvider editor={editor} store={store}>
  <EditorShell
    onResizeRegion={(region, size) => {
      const panelId = panelIdForRegion(store.getState().layout, region);
      if (panelId) layoutActions.resizePanel(panelId, size);
    }}
    slots={{
      header: <Header title="Nodera"><Toolbar /></Header>,
      left: <PanelHost panelId="palette" />,
      right: <PanelHost panelId="properties" />,
      bottom: <PanelHost panelId="validation" />,
      canvas: <CanvasContainer><GraphCanvas editor={editor} /></CanvasContainer>,
    }}
  />
  <ContextMenu />
</NoderaUiProvider>
```

- Panels are resolved by id: `PanelHost` reads the `PanelDefinition` from the
  `PanelRegistry` and the renderer from the component-renderer registry
  (`panel.renderer ?? panel.id`). An unknown panel renders nothing; a known panel
  without a renderer renders a labelled placeholder instead of throwing.
- **External panels are mounted by the host, anywhere outside the shell.** A
  definition with `region: "external"` (the built-in `metadata` panel) takes part
  in no layout: `resolveLayout` reports it in `external`, `computeShellSizes`
  gives it no geometry, and `EditorShell` never renders it. The host places
  `<PanelHost panelId="metadata" />` wherever it wants — its own column, a
  sidebar, a separate window — which is what "paneles externos al canvas" (S4)
  means in practice.
- Region edges come from the layout engine: `computeShellSizes` delegates to
  `resolveLayout` (documented empty definition plus the default viewport) and only
  maps region rectangles to shell edges (`height` for `header`/`footer`/`bottom`,
  `width` for `left`/`right`). There is no second max-per-region rule in the React
  layer, so the shell and the engine cannot drift apart.

## Components

| Component | Purpose |
| --- | --- |
| `EditorShell` | optional region composition (`header`, `footer`, `left`, `right`, `bottom`, `canvas`, `floating`) with pointer splitters reporting `onResizeRegion` |
| `CanvasContainer` | canvas surface plus an `overlays` layer |
| `PanelChrome` / `PanelHost` | panel frame (title, actions, hide) and registry-driven panel rendering |
| `Header` / `Footer` / `Sidebar` | host-controlled region content, never mandatory |
| `NodePalette` | definitions grouped by category, local filter, drag payload for the canvas drop target, click-to-add |
| `Navigator` | node and edge list with selection markers, narrowed by the UI-state search query |
| `SearchPanel` | search input bound to the UI store with hint, empty and truncated states |
| `MinimapPanel` | plain SVG overview of graph positions and selection (no React Flow, no viewport projection) |
| `PropertiesPanel` | property form driven entirely by `PropertyDefinition` (visibility, enabled state, effective options, defaults, inline validation), plus edge-label mode |
| `InspectorPanel` | read-only structural view: ids, definition, position, ports, raw properties |
| `MetadataPanel` | graph metadata editor (`name`, `description`, `tags`) |
| `Toolbar` | registry-driven actions with availability gating and toolbar renderer replacement |
| `ContextMenu` | store-driven menu at the pointer position, target-aware items, Escape/outside-click close |
| `ValidationPanel` | severity counts, validate action, issue list with element links, optional auto-validate |
| `HistoryPanel` | undo/redo labels with a current marker and click-to-walk |

Every component derives its styles from the theme CSS custom properties
(`var(--ndr-*, fallback)`), so a host theme or its own stylesheet changes the look
without touching component code.

## Providers and hooks

`NoderaUiProvider` supplies the `UiStateStore`, the theme/layout/panel/tool
registries, the component renderers and an optional `editor`, and writes the
theme variables on its wrapper element.

- `useNoderaUi`, `useEditorEngine`, `useTheme`, `useUiState`, `useUiStateActions`
- `useLayoutActions` — apply/reset layouts, resize, show/hide/toggle, dock, float,
  save and restore preferences
- `useEditorSnapshot`, `useToolAvailability`, `useGraphQueries`,
  `useEditorCommands`, `useValidation`, `useHistory`

`restorePreferences(store)` never throws and never half-applies: it returns a
`RestorePreferencesResult` so the host can tell the user what happened instead of
seeing nothing change.

```ts
const result = layout.restorePreferences(store);
// { status: "restored", layoutId: "acme.ide", ignoredPanelIds: ["legacy"] }
// { status: "missing", ignoredPanelIds: [] }
// { status: "malformed", ignoredPanelIds: [], diagnostic: "layout preferences are not valid json" }
// { status: "unknown-layout", ignoredPanelIds: [], diagnostic: "Stored layout '…' is not declared by the host; the applied layout is unchanged" }
```

`ignoredPanelIds` lists the saved entries dropped because the declared layout no
longer has those panels; `diagnostic` is the layout engine's own message. Only
`"restored"` touches the UI store.

Each hook is a thin binding: mutations go through the application use cases, rules
come from the core packages, and no component re-implements them.

## Component replacement (Level 2)

`ComponentRenderers` holds three `ComponentRegistry` instances: `panels`,
`properties`, `toolbars`.

```ts
renderers.panels.replace("nodera.panel.palette", BrandPalette);
renderers.properties.replace("string", BrandStringField);
```

`register` keeps protecting new contributions from duplicate ids;
`replace(id, component)` is the documented swap path for a built-in id.
`createDefaultComponentRenderers()` registers the built-in panel renderers
(`nodera.panel.<panel id>`) and the built-in property renderers; `toolbars` stays
empty on purpose so the built-in toolbar path is the default until a host
registers its own renderer id.

## Boundaries

- This package must never import `@xyflow/react`: React Flow stays inside
  `@nodera/canvas-react-flow`, and the `MinimapPanel` is deliberately a plain SVG
  overview.
- Domain and document state are never written from here; `UiStateStore` holds
  presentation state only and is never serialized into the portable document.
- Components are presentation: they read the engine snapshot and translate
  interactions into commands and use cases.

## Scripts

`pnpm --filter @nodera/ui-react test`, `typecheck`, `build`.
