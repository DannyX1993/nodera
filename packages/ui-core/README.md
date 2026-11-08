# @nodera/ui-core

Framework-agnostic contracts and state of the Nodera UI layer.

No React, no DOM, no React Flow: this package defines *what* the presentation
layer composed of, so hosts, plugins and future framework adapters can agree on
panel, tool, dialog, layout and UI-state shapes without importing a visual
library.

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

## Dialogs

A dialog is declarative data. `DialogDefinition` carries a qualified `id`, a
`title` (the accessible name the renderer must use), an optional `description`
(the accessible description), an optional `size` token (`"sm" | "md" | "lg"`),
an optional `dismissible` flag and optional `metadata`. The definition holds no
component and no pixel value: the size is a token, and both the component and
the measurement belong to the presentation adapter.

`resolveDialogDefaults` fills the documented defaults and
`DEFAULT_DIALOG_DEFAULTS` is that table (`size: "md"`, `dismissible: true`, so a
host opts *out* of dismissal instead of into it).

`DialogRegistry` stores definitions with the rules every other registry has: a
used id is a `duplicate-id` error and an unknown one a `not-found` error, and
nothing is overwritten silently. It keeps no default selection: a dialog is
always opened by id, so an id nobody registered can never be shown.

The registry seeds `DEFAULT_DIALOGS` so the framework's own "+" affordance works
out of the box. That set currently holds one definition:
`CREATE_NODE_DIALOG` (`nodera.dialog.create-node`, aliased by the exported
`NODERA_CREATE_NODE_DIALOG_ID`) — title "Create node", a short description, the
`"lg"` size token and `dismissible: true`. It is plain data: `ui-core` knows
nothing about the palette or the command the renderer dispatches.

`new DialogRegistry({ dialogs })` **replaces** the seeded list instead of
extending it, exactly like `LayoutRegistry` treats `layouts`, so a host removes
a built-in dialog by passing only its own definitions (`{ dialogs: [] }` for
none). There is no second registry concept and no separate factory.

## Layout model types

`DockRegion`, `PanelRegion`, `Rect`, `PanelState`, `LayoutState`,
`LayoutDefinition` and `LayoutPanelPlacement`. The types live here so
`@nodera/layout-engine` can compute over them without a dependency cycle;
the registry, reducers and geometry live in `layout-engine`.

## UI state

`UiStateStore` is the single presentation-state container: `themeId`,
`layoutId`, `layout` (panel state), `menu` (open context/panel menu),
`searchQuery`, `interactionMode`, `activePanelId`, `activeDialogId` and
`dragPolicy`.

- Immutable snapshots: `getState()` keeps its identity until something really
  changes, and a no-op mutation notifies nobody (that is what keeps panels from
  re-deriving on every event).
- `subscribe(listener)` returns the unsubscribe function; React binds it with
  `useSyncExternalStore`.
- Mutators: `setTheme`, `setLayout(layoutId, layout)`, `updateLayout(updater)`,
  `openMenu`, `closeMenu`, `setSearchQuery`, `setInteractionMode`,
  `setActivePanel`, `openDialog(dialogId)`, `closeDialog`, `setDragPolicy`.
- Drag policy: `DragPolicy` (`"free" | "locked" | "snap-back"`) says what a
  manual drag does with the positions the layout assigned. `"free"` (the store
  default, and today's behaviour) commits the dropped position, `"locked"` makes
  the canvas refuse the drag and `"snap-back"` returns the node to its assigned
  position when the drag ends without committing anything. The store only holds
  the value — `@nodera/sdk` validates it and seeds it from `graph.layout.drag`
  (`builder.graphLayout.dragPolicy()` / `setDragPolicy`), and the canvas
  re-renders from the state, so no module-level variable or React-only context
  carries it.
- Dialogs: the store takes an optional `dialogRegistry`, and `openDialog(id)`
  resolves the id through it. It returns the definition or the registry's
  `not-found` error and, when it refuses, neither the state nor its subscribers
  change. A store without a `dialogRegistry` opens nothing, so the open id is
  always a registered one. The check happens at open time: a host that
  deregisters a dialog which is currently open closes it too.

The store never touches graph domain state and is never serialized into the
portable document: selection and history stay in `@nodera/application`, viewport
stays in the canvas adapter.

## Drag protocol

`NODE_DEFINITION_MIME_TYPE` (`application/nodera-node-definition`) is the stable
payload a node palette writes and a canvas accepts; the adapter re-exports it so
neither side duplicates the string.

## Scripts

`pnpm --filter @nodera/ui-core test`, `typecheck`.
