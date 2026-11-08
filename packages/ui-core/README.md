# @nodera/ui-core

Framework-agnostic contracts and state of the Nodera UI layer.

No React, no DOM, no React Flow: this package defines *what* the presentation
layer composed of, so hosts, plugins and future framework adapters can agree on
panel, tool, layout and UI-state shapes without importing a visual library.

## Panels

`PanelDefinition` describes a panel declaratively: `id`, `title`, `region`
(`header | footer | left | right | bottom | floating | external`), an optional
`renderer` **id** (never a component), sizing (`size`, `minSize`, `maxSize`) and
capabilities (`resizable`, `dockable`, `hideable`, `floating`, `visible`, `order`).
`resolvePanelDefaults` fills the documented defaults.

`PanelRegistry` stores them with registry semantics (explicit duplicate and
not-found results) and adds `byRegion(region)`.

## Tools and commands

Tools are the declarative actions shared by toolbars, palettes and context
menus. `ToolDefinition` carries `id`, `label`, `description?`, `icon?`, `group?`,
`command` and optional `availability`.

`ToolCommand` is data, never a function: `undo`, `redo`, `delete-selection`,
`copy-selection`, `cut-selection`, `paste-selection`, `validate`, `fit-view`,
`add-node`, `select-node`, `select-edge`, `clear-selection`, `toggle-panel`,
`dock-panel`, `float-panel` and `custom` (deferred to the host).

`isToolAvailable(tool, context)` evaluates the availability rules
(`always`, `undo-available`, `redo-available`, `selection`, `node-selection`,
`edge-selection`, `clipboard`) against `ToolAvailabilityContext`
(`{ canUndo, canRedo, selectedNodeCount, selectedEdgeCount, clipboardSize }`).

`ToolRegistry` adds `byGroup(group)` and `groups()`.

## Layout model types

`DockRegion`, `PanelRegion`, `Rect`, `PanelState`, `LayoutState`,
`LayoutDefinition` and `LayoutPanelPlacement`. The types live here so
`@nodera/layout-engine` can compute over them without a dependency cycle;
the registry, reducers and geometry live in `layout-engine`.

## UI state

`UiStateStore` is the single presentation-state container: `themeId`,
`layoutId`, `layout` (panel state), `menu` (open context/panel menu),
`searchQuery`, `interactionMode` and `activePanelId`.

- Immutable snapshots: `getState()` keeps its identity until something really
  changes, and a no-op mutation notifies nobody (that is what keeps panels from
  re-deriving on every event).
- `subscribe(listener)` returns the unsubscribe function; React binds it with
  `useSyncExternalStore`.
- Mutators: `setTheme`, `setLayout(layoutId, layout)`, `updateLayout(updater)`,
  `openMenu`, `closeMenu`, `setSearchQuery`, `setInteractionMode`,
  `setActivePanel`.

The store never touches graph domain state and is never serialized into the
portable document: selection and history stay in `@nodera/application`, viewport
stays in the canvas adapter.

## Drag protocol

`NODE_DEFINITION_MIME_TYPE` (`application/nodera-node-definition`) is the stable
payload a node palette writes and a canvas accepts; the adapter re-exports it so
neither side duplicates the string.

## Scripts

`pnpm --filter @nodera/ui-core test`, `typecheck`.
