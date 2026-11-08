# @nodera/layout-engine

Framework-agnostic layout composition for the Nodera UI layer: layout
definitions, panel state reducers, geometry resolution and layout preference
persistence.

It reads and produces plain data. It never modifies the graph model, never
imports React and never renders anything.

## Layout definitions

A host declares its compositions as `LayoutDefinition` values:

```ts
import { EDITOR_LAYOUT, LayoutRegistry, createLayoutState } from "@nodera/layout-engine";

const registry = new LayoutRegistry();            // ships the predefined layouts
const definition = registry.getDefault();         // nodera.layout.editor
const state = createLayoutState(defineLayout(), { panels: panelRegistry.all() });
```

`createLayoutState(definition, { panels? })` resolves each panel's size in this
order: the placement of the layout, the layout region size, the panel definition,
then the documented default. Visibility resolves from the placement, the panel
definition, then `true`. A floating placement keeps its rectangle.

Predefined layouts: `nodera.layout.editor`, `nodera.layout.canvas-only`,
`nodera.layout.ide`. `LayoutRegistry` follows the standard registry semantics
(duplicate ids are conflicts, unknown ids are not-found) and can start from
host-declared layouts only.

## Reducers

All reducers return the *same* state reference when nothing changes, so the UI
store can skip notifications and panels do not re-render for no reason:

| Function | Behaviour |
| --- | --- |
| `resizePanel(state, {panelId, size})` | clamps to the panel `minSize`/`maxSize`; ignored for non-resizable panels, unknown panels and non-finite sizes |
| `setPanelVisible(state, {panelId, visible})` | ignored for non-hideable panels |
| `togglePanel(state, {panelId})` | flips visibility of a hideable panel, keeping its size |
| `dockPanel(state, {panelId, region})` | moves a dockable panel and drops its floating rectangle |
| `floatPanel(state, {panelId, rect})` | floats a panel, making it visible |

## Geometry

`resolveLayout(definition, state, { viewport? })` returns
`{ viewport, regions, panels, hidden, external }`:

- Regions are reported in `header → left → right → bottom → footer` order; a
  region with no visible panel is absent, so the canvas keeps the space instead
  of the framework reserving an empty band.
- Panels docked into the same region split it (side regions stack vertically,
  stacked regions place them side by side).
- Floating panels keep their rectangle; without one they get a documented
  default position inside the canvas area.
- `external` panels are reported by id without geometry: they live outside the
  canvas on purpose.
- The default viewport is `1280x800`; values are never negative, even when a
  host declares sizes larger than the viewport.

## Preference persistence

- `toPreferences(layoutId, state)` / `serializePreferences(prefs)` produce a
  versioned payload (`LAYOUT_PREFERENCES_VERSION = 1`).
- `deserializePreferences(input)` accepts the object or its JSON text and rejects
  unparseable, incomplete or unknown-version payloads with a structured error
  (`malformed` or `unsupported-version`).
- `applyPreferences(prefs, definition, { panels? })` applies saved regions,
  visibility, sizes and rectangles onto the layout the host declares *today*; it
  drops preferences for panels the layout no longer declares and reports them in
  `ignoredPanelIds`.
- `LayoutPreferenceStore` is the port: `{ load(), save(value), clear() }`,
  with `createMemoryLayoutPreferenceStore(initial?)` for tests and ephemeral
  hosts, and `saveLayoutPreferences` / `restoreLayoutPreferences` helpers whose
  restore status is `restored`, `missing` or `malformed`.

The engine never invents a layout: a missing or malformed preference leaves the
declared default in place and tells the host why.

## Scripts

`pnpm --filter @nodera/layout-engine test`, `typecheck`.
