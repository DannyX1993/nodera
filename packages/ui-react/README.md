# @nodera/ui-react

The React UI composition layer of Nodera: the components and bindings a host
application uses to build its own editor interface around
`@nodera/react-flow`.

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
| `ContextMenu` | store-driven menu at the pointer position, target-aware items, Escape/outside-click close, menu renderer replacement |
| `Dialog` | modal surface for one `DialogDefinition`: ARIA name/description, focus move and trap, focus restore, Escape/backdrop dismissal only when the definition is dismissible |
| `NodeCreationDialog` | the node palette inside `Dialog`: opens on the host's `open`, inserts the chosen definition on the pending edge through the `insert-node` command or adds exactly one node through `add-node` (or the host's `onAddNode`), closes on the accepted selection and clears the pending session |
| `CreateNodeButton` | the "+" affordance: a native button with `aria-haspopup="dialog"` that opens `nodera.dialog.create-node` through `useDialogActions` |
| `ValidationPanel` | severity counts, validate action, issue list with element links, optional auto-validate |
| `HistoryPanel` | undo/redo labels with a current marker and click-to-walk |

Every component derives its styles from the theme CSS custom properties
(`var(--ndr-*, fallback)`), so a host theme or its own stylesheet changes the look
without touching component code.

## Dialogs

`Dialog` renders one `DialogDefinition` and owns no state: `open` and `onClose`
come from the host, normally through `useDialogActions` over the same
`UiStateStore` the rest of the UI reads.

```tsx
const dialogs = useDialogActions();
const state = useUiState();
const definition = state.activeDialogId === undefined
  ? undefined
  : dialogRegistry.get(state.activeDialogId);

<Dialog definition={definition ?? CREATE_NODE} open={definition !== undefined} onClose={dialogs.close}>
  <button type="button" onClick={() => dialogs.close()}>Done</button>
</Dialog>
```

Accessibility is built in, not delegated to the host (AGENTS.md §15): the panel
is `role="dialog"` with `aria-modal="true"`, its accessible name is the
definition title (`aria-labelledby`) and its description is wired with
`aria-describedby` when the definition declares one. On open, focus moves to the
first focusable control inside the panel (or to the panel itself, which is
`tabindex="-1"`, when it holds none); `Tab` and `Shift+Tab` wrap inside the
panel in both directions; on close, focus returns to the element that had it
before opening. `Escape` and a backdrop click call `onClose` **only** when
`dismissible` is true — a `dismissible: false` dialog is dismissable through its
own controls only.

The size token is reflected as the `nodera-dialog-size-<size>` class and the
`data-nodera-dialog-size` attribute next to `nodera-dialog`, and the panel
measures from theme tokens (`--ndr-dialog-size-sm|md|lg`, `--ndr-colors-backdrop`,
spacing, borders, shadows) with the built-in fallbacks, so no colour is
hard-coded here.

The primitive does not portal and does not lock the rest of the document: the
trap covers the rendered panel only, and a host that needs a hard modal lock or
a portal wraps `Dialog` in its own overlay.

## Creating nodes from a dialog

`CreateNodeButton` + `NodeCreationDialog` are the S2 affordance: "+" opens a
dialog and the user picks which node to add. They are two pieces on purpose —
the button only opens a registered dialog id, the dialog only composes the
palette — so the host decides where both live and whether it wants one or the
other.

```tsx
import { DialogRegistry, NODERA_CREATE_NODE_DIALOG_ID, UiStateStore } from "@nodera/ui-core";
import {
  CreateNodeButton,
  NoderaUiProvider,
  NodeCreationDialog,
  useDialogActions,
  useUiState,
} from "@nodera/ui-react";

// The dialog must be registered: the store refuses ids it does not know.
const store = new UiStateStore({
  themeId: "nodera.light",
  layoutId: "nodera.editor",
  dialogRegistry: new DialogRegistry(),
});

function AddNode(): ReactNode {
  const state = useUiState();
  const dialogs = useDialogActions();
  return (
    <>
      <CreateNodeButton />
      <NodeCreationDialog
        open={state.activeDialogId === NODERA_CREATE_NODE_DIALOG_ID}
        onClose={dialogs.close}
      />
    </>
  );
}

<NoderaUiProvider editor={editor} store={store}>
  <AddNode />
</NoderaUiProvider>;
```

Props of `NodeCreationDialog`: `open`, `onClose` (required, both controlled by
the host), and the optional `definition` (defaults to `CREATE_NODE_DIALOG`, so a
host rewords or resizes it without touching the component), `definitions`
(defaults to the live editor registry — the same vocabulary the palette panel
shows), `onAddNode` (the host handler: it wins over the command and is how a host
adds placement, defaults or confirmation) and `emptyMessage`.

A selection runs the existing `{ kind: "add-node", definitionId }` command
through the command bus, never a second creation path, and the dialog closes
when the graph accepted the node: a refused add leaves it open. Keyboard and
focus behaviour come from `Dialog` and `NodePalette` — focus starts in the
palette search field, `Tab` cycles inside, and `Escape` closes the dialog because
`CREATE_NODE_DIALOG` is dismissible.

### Inserting a node on an edge

One dialog serves both creation paths. The canvas "+" (enabled by
`features.edgeInsertion`, see `packages/sdk/README.md`) records the edge with
`useEdgeInsertActions().begin(edgeId)`: it writes `pendingEdgeInsertId` to the UI
store and opens `nodera.dialog.create-node` through `useDialogActions`. While
that edge is pending, the dialog dispatches
`{ kind: "insert-node", edgeId, definitionId }` instead of `add-node`;
`useEditorCommands` executes it through the application's
`insert-node-on-edge` use case, which replaces the edge with `source → node →
target` as **one** history unit — one undo restores the original edge. A refusal
reports `false`, leaves the graph and the history untouched, and keeps the
dialog open. The pending edge is cleared when the insertion is accepted and,
from the store, whenever the dialog closes, so the next add cannot insert into an
old edge.

A host that wants its own control renders it through
`NoderaEditor.renderEdgeInsert={(edgeId) => <MyButton edgeId={edgeId} />}` (or
`GraphCanvas.renderEdgeInsert`), and can call `useEdgeInsertActions()` from the
component to keep the built-in behaviour. The canvas owns the midpoint position
and forwards activation; the host owns what the button looks like. A host that
handles the selection itself (`onAddNode`) receives the definition id and reads
`pendingEdgeInsertId` from `useUiState()` to decide between
`builder.graph.insertNode` and `builder.graph.addNode`.

### Growing a graph from nothing: the phantom "+"

`GraphCanvas.edgeInsertion` also covers the states that have no edge to put a "+"
on. With no node at all the canvas draws a dashed, muted **phantom node** carrying
the "`+`"; with exactly one node it draws that placeholder one step past the node
plus a dashed **phantom edge** from the node to it, "`+`" at the midpoint. From
two nodes on there is no empty-state phantom: every **leaf** (a node with no
outgoing edge) gets its own successor placeholder one step past it along
`layoutDirection`, joined by a dashed placeholder edge with the "`+`" at its
midpoint. The set is derived from the edges on every render, so a placeholder
disappears as soon as its node stops being a leaf — and a graph with a single
node never gets two placeholders for it. All of them live only in the arrays the
canvas hands to React Flow: never in the document, never in
`builder.graph.nodes()`/`edges()`, no event, no history entry, nothing to select,
drag or delete, and the minimap skips them.

Activating any of those "`+`" writes `pendingAppendAnchorId` (the node the
placeholder followed: absent on an empty graph, the single node's id in the
empty state, the leaf's id from two nodes on) to the UI store, clears any
`pendingEdgeInsertId`, and opens the same `nodera.dialog.create-node`. `NodeCreationDialog` treats that
session as an **add**, never as an edge insertion, and clears the anchor on an
accepted selection — exactly like the pending edge. The anchor reaches the graph
through the host's `onAddNode`:

```tsx
const anchorId = ui.pendingAppendAnchorId;
const added = builder.graph.addNode(
  anchorId === undefined ? { type } : { type, after: anchorId },
);
if (added.ok && anchorId !== undefined) {
  builder.graph.connect({ source: anchorId, target: added.value.id });
}
```

This path is **two history units** — create, then connect — unlike the edge "+",
whose insertion is one reversible unit, and it is the same path for both
placeholders. The framework does not hide that: one `undo()` removes the edge, a
second removes the node. The axis the placeholders step along comes from the host
(`GraphCanvas.layoutDirection`, `NoderaEditor.layoutDirection`, `"horizontal"` by
default), because the canvas cannot read `graph.layout.direction`. A single-unit
append-and-connect needs its own application use case, which does not exist yet,
so no API here promises atomicity for it. Both calls are reported to the host, and
a refused `connect` leaves the node it already created (there is no transaction to
roll it back).

`CreateNodeButton` props: `label` (accessible name, default `Add node`),
`children` (visible content, default `+`), `className` and `disabled`. It is a
native `button type="button"`, so `Enter` and `Space` activate it, it has no
autofocus, and it imposes no width, margin or position: the host owns the
layout. It opens the dialog through the store, which means a store without a
`DialogRegistry` opens nothing rather than rendering a dialog nobody registered.

## Providers and hooks

`NoderaUiProvider` supplies the `UiStateStore`, the theme/layout/panel/tool
registries, the component renderers and an optional `editor`, and writes the
theme variables on its wrapper element.

- `useNoderaUi`, `useEditorEngine`, `useTheme`, `useUiState`, `useUiStateActions`
- `useDialogActions` — `open(dialogId)` / `close()` over the UI store, which
  refuses an id its `DialogRegistry` does not know
- `useEdgeInsertActions` — `begin(edgeId)`: records the edge as the pending
  insertion and opens the node-creation dialog
- `useUiState().pendingAppendAnchorId` — the anchor a placeholder "`+`" recorded; the
  store exposes `setPendingAppendAnchorId(id | undefined)` and `closeDialog()`
  clears it together with `pendingEdgeInsertId` in one commit
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

Nodera's three customization levels apply to this package as a whole: themes
change the tokens (Level 1), the registries below replace whole renderers
(Level 2), and any component can be composed freely by the host instead of the
prebuilt arrangement (Level 3).

`ComponentRenderers` holds four `ComponentRegistry` instances: `panels`,
`properties`, `toolbars` and `menus`.

```ts
renderers.panels.replace("nodera.panel.palette", BrandPalette);
renderers.properties.replace("string", BrandStringField);
renderers.toolbars.replace("acme.toolbar", BrandToolbar);
renderers.menus.replace(DEFAULT_MENU_RENDERER_ID, BrandMenu);
```

`register` keeps protecting new contributions from duplicate ids;
`replace(id, component)` is the documented swap path for a built-in id and
`unregister(id)` restores the built-in path of a slot.
`createDefaultComponentRenderers()` registers the built-in panel renderers
(`nodera.panel.<panel id>`) and the built-in property renderers; `toolbars` and
`menus` stay empty on purpose so the built-in toolbar and menu paths are the
default until a host registers its own renderer id.

### Menus

Menus are replaceable at Level 2, styled by tokens at Level 1 and composable at
Level 3. The menu *content* — which tools apply to the open target and whether
each one is enabled — is **not** replaceable and is not part of the contract:
it always comes from the `ToolRegistry` plus the `UiStateStore`, so a renderer
cannot silently change what the editor offers.

`ContextMenu` resolves `rendererId` (default `DEFAULT_MENU_RENDERER_ID`,
`"nodera.menu.default"`) in `renderers.menus` and mounts the component it finds
inside the same positioned root, so `data-nodera-context-menu`,
`data-nodera-context-target`, the fixed `left`/`top` and the Escape/outside-click
closing keep working on both paths.

```tsx
import { isToolAvailable } from "@nodera/ui-core";
import type { MenuRendererProps } from "@nodera/ui-react";

function BrandMenu(props: MenuRendererProps) {
  return (
    <div data-brand-menu="">
      <span>{props.targetKind}</span>
      {props.items.map((tool) => (
        <button
          key={tool.id}
          type="button"
          role="menuitem"
          disabled={!isToolAvailable(tool, props.availability)}
          onClick={() => props.onCommand(tool.command)}
        >
          {tool.label}
        </button>
      ))}
      <button type="button" onClick={props.onClose}>Close</button>
    </div>
  );
}

renderers.menus.replace(DEFAULT_MENU_RENDERER_ID, BrandMenu);
```

`MenuRendererProps` carries `items` (the target-shaped `ToolDefinition[]` the
built-in path would render), `kind` (`context` | `panel`), `targetKind`,
`position`, `availability` (live editor facts), `onCommand` (dispatches through
the shared command dispatcher and closes the menu) and `onClose` (closes only).

## Boundaries

- This package must never import `@xyflow/react`: React Flow stays inside
  `@nodera/react-flow`, and the `MinimapPanel` is deliberately a plain SVG
  overview.
- Domain and document state are never written from here; `UiStateStore` holds
  presentation state only and is never serialized into the portable document.
- Components are presentation: they read the engine snapshot and translate
  interactions into commands and use cases.

## Scripts

`pnpm --filter @nodera/ui-react test`, `typecheck`, `build`.
