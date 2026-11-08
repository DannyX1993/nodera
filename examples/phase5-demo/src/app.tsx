/**
 * Composition of the Phase 5 demo editor (S2, S3, S4).
 *
 * This component is the host application's answer to "how do I want my editor
 * to look": it decides which panels exist in which slot, which tools the
 * toolbar offers, which layouts the header can apply and which renderers are
 * replaced. Every decision is local — nothing here is required by the
 * framework, and a different host would compose the same components into a
 * completely different arrangement.
 */

import { useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import { addNode, type EditorEngine } from "@nodera/application";
import { GraphCanvas } from "@nodera/react-flow";
import {
  CANVAS_ONLY_LAYOUT_ID,
  createMemoryLayoutPreferenceStore,
} from "@nodera/layout-engine";
import type { DockRegion, LayoutState, ToolDefinition } from "@nodera/ui-core";
import {
  CanvasContainer,
  ContextMenu,
  DEFAULT_MENU_RENDERER_ID,
  EditorShell,
  Header,
  PanelHost,
  Toolbar,
  createDefaultPropertyRenderers,
  panelIdForRegion,
  useComponentRenderers,
  useEditorEngine,
  useLayoutActions,
  useLayoutRegistry,
  useNoderaUi,
  useToolRegistry,
  useUiState,
  useUiStateActions,
  type CanvasCommandHandlers,
} from "@nodera/ui-react";

import {
  BrandMenu,
  BrandPalette,
  BrandStringField,
  DefaultPalettePanel,
  PALETTE_RENDERER_ID,
  createDemoPortRenderers,
} from "./brand.js";
import { DEMO_WORKSPACE_LAYOUT_ID, ROWS_EDGE_DEFINITION_ID } from "./definitions.js";

/**
 * Tools the demo toolbar offers.
 *
 * The registry holds more than this (delete is deliberately left out of the
 * demo toolbar), which is the point: the host picks the tools it wants from the
 * declarative registry instead of accepting a fixed toolbar (D4).
 */
const TOOLBAR_TOOL_IDS: readonly string[] = [
  "tool.undo",
  "tool.redo",
  "tool.copy",
  "tool.cut",
  "tool.paste",
  "tool.validate",
  "tool.fit-view",
];

/** Rectangle the "Float search" action applies (host-chosen, never persisted). */
/**
 * Floating rectangles are host-owned pixels relative to the canvas container.
 * They must stay inside it: an overlay that overflows the container lands under
 * the host's own chrome (the external metadata column) and stops taking clicks.
 */
const FLOATING_SEARCH_RECT = Object.freeze({ x: 8, y: 48, width: 240, height: 190 });

/** Default property renderer, kept so the brand toggle can be undone. */
const DEFAULT_STRING_RENDERER = createDefaultPropertyRenderers().get("string");

/** True when the applied layout places the panel at all. */
function layoutPlaces(layout: LayoutState | undefined, panelId: string): boolean {
  if (layout === undefined) {
    return true;
  }
  return layout.panels.some((panel) => panel.panelId === panelId);
}

/** The composed editor. */
export function Workspace(props: { readonly editor: EditorEngine }): ReactNode {
  const editor = props.editor;
  const ui = useUiState();
  const uiActions = useUiStateActions();
  const layout = useLayoutActions();
  const layoutRegistry = useLayoutRegistry();
  const toolRegistry = useToolRegistry();
  const renderers = useComponentRenderers();
  const { store, themeRegistry } = useNoderaUi();
  const portRenderers = useMemo(createDemoPortRenderers, []);
  const preferences = useMemo(() => createMemoryLayoutPreferenceStore(), []);
  const [status, setStatus] = useState("Ready — Phase 5 host composition");
  const [brand, setBrand] = useState(false);
  const [brandMenu, setBrandMenu] = useState(false);

  const tools = useMemo<readonly ToolDefinition[]>(() => {
    const registered = toolRegistry.all();
    return TOOLBAR_TOOL_IDS.map((id) => registered.find((tool) => tool.id === id)).filter(
      (tool): tool is ToolDefinition => tool !== undefined,
    );
  }, [toolRegistry]);

  /**
   * Host capability the `fit-view` command needs.
   *
   * The canvas adapter keeps its React Flow instance private, so the host
   * bridges to the fit-view control the adapter renders instead of reaching
   * into React Flow state (S6: React Flow objects never leave the adapter).
   */
  const handlers = useMemo<CanvasCommandHandlers>(
    () => ({
      fitView: () => {
        const control =
          typeof document === "undefined"
            ? null
            : document.querySelector<HTMLButtonElement>(".react-flow__controls-fitview");
        if (control === null) {
          setStatus("Fit view unavailable: the canvas controls are not mounted");
          return;
        }
        control.click();
        setStatus("Fit view: the canvas fitted the graph into the viewport");
      },
      onCustom: (id: string) => {
        setStatus(`Host command '${id}' ran`);
      },
    }),
    [],
  );

  const searchPanel = ui.layout?.panels.find((panel) => panel.panelId === "search");
  const searchFloating =
    searchPanel !== undefined && searchPanel.visible && searchPanel.region === "floating"
      ? searchPanel
      : undefined;
  const searchDocked =
    searchPanel !== undefined &&
    searchPanel.region !== "floating" &&
    searchPanel.region !== "external";

  /** Makes sure the applied layout knows the search panel before acting on it. */
  const ensureSearchPanel = (): boolean => {
    if (layoutPlaces(store.getState().layout, "search")) {
      return true;
    }
    if (layoutRegistry.get(DEMO_WORKSPACE_LAYOUT_ID) === undefined) {
      setStatus("The applied layout does not place the search panel");
      return false;
    }
    layout.applyLayout(DEMO_WORKSPACE_LAYOUT_ID);
    setStatus("Applied the demo workspace layout (it declares the search panel)");
    return true;
  };

  const floatSearch = (): void => {
    if (!ensureSearchPanel()) {
      return;
    }
    layout.floatPanel("search", FLOATING_SEARCH_RECT);
    setStatus("Floated the search panel at an explicit rectangle");
  };

  const dockSearch = (): void => {
    if (!ensureSearchPanel()) {
      return;
    }
    layout.dockPanel("search", "left");
    setStatus("Docked the search panel into the left region");
  };

  const saveLayout = (): void => {
    layout.savePreferences(preferences);
    setStatus(`Saved '${store.getState().layoutId}' layout preferences (in memory)`);
  };

  /**
   * Restores the layout preferences and reports *why* nothing happened.
   *
   * `restorePreferences` returns the restore outcome instead of swallowing it:
   * a host can tell the user whether there was nothing stored, whether the stored
   * payload is unusable and which saved panels the declared layout no longer has.
   */
  const restoreLayout = (): void => {
    const restored = layout.restorePreferences(preferences);
    switch (restored.status) {
      case "restored": {
        const ignored =
          restored.ignoredPanelIds.length === 0
            ? "no saved panel was dropped"
            : `dropped saved panels: ${restored.ignoredPanelIds.join(", ")}`;
        setStatus(`Restored layout '${restored.layoutId ?? ""}' — ${ignored}`);
        return;
      }
      case "missing":
        setStatus("Restore: nothing saved yet — press 'Save layout' first");
        return;
      case "malformed":
        setStatus(`Restore rejected the stored preferences: ${restored.diagnostic ?? "unknown reason"}`);
        return;
      case "unknown-layout":
        setStatus(`Restore skipped: ${restored.diagnostic ?? "the stored layout is not declared here"}`);
        return;
    }
  };

  const toggleInteractionMode = (): void => {
    const next = ui.interactionMode === "select" ? "pan" : "select";
    uiActions.setInteractionMode(next);
    setStatus(
      next === "pan"
        ? "Interaction mode 'pan': any drag moves the canvas"
        : "Interaction mode 'select': left drag draws a selection box, middle/right drag pans",
    );
  };

  const toggleBrand = (): void => {
    const next = !brand;
    if (next) {
      renderers.panels.replace(PALETTE_RENDERER_ID, BrandPalette);
      renderers.properties.replace("string", BrandStringField);
    } else {
      renderers.panels.replace(PALETTE_RENDERER_ID, DefaultPalettePanel);
      renderers.properties.replace("string", DEFAULT_STRING_RENDERER);
    }
    setBrand(next);
    setStatus(
      next
        ? "Brand renderers active: palette panel and string property replaced"
        : "Default renderers restored",
    );
  };

  const openContextMenu = (event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const target = event.target instanceof Element ? event.target : null;
    const node = target?.closest(".react-flow__node") ?? null;
    const nodeId = node?.getAttribute("data-id") ?? "";
    uiActions.openMenu({
      kind: "context",
      targetKind: nodeId === "" ? "pane" : "node",
      targetId: nodeId,
      position: { x: event.clientX, y: event.clientY },
    });
  };

  /**
   * Swaps the menu presentation at runtime.
   *
   * The built-in menu is the default, so "back to built-in" is an `unregister`
   * of the renderer id rather than a second registration: `menus` starts empty
   * in `createDefaultComponentRenderers()`. The registry is the object the
   * provider holds, so the `ContextMenu` of this composition resolves the new
   * component on the next render — no remount, no second provider.
   */
  const toggleMenuRenderer = (): void => {
    const next = !brandMenu;
    if (next) {
      renderers.menus.replace(DEFAULT_MENU_RENDERER_ID, BrandMenu);
    } else {
      renderers.menus.unregister(DEFAULT_MENU_RENDERER_ID);
    }
    setBrandMenu(next);
    setStatus(
      next
        ? "Menu renderer: BrandMenu draws the open menu (items still come from the tool registry)"
        : "Menu renderer: back to the built-in menu",
    );
  };

  /**
   * Opens the context menu without a right-click.
   *
   * Only the *position* is fixed; the content is the store's: a node menu when
   * something is selected (the node and selection tools apply), a pane menu
   * otherwise (only the unconditional tools do).
   */
  const openFixedMenu = (): void => {
    const selected = editor.getSelectedNodes()[0];
    uiActions.openMenu({
      kind: "context",
      targetKind: selected === undefined ? "pane" : "node",
      targetId: selected ?? "",
      position: { x: 280, y: 200 },
    });
    setStatus(
      selected === undefined
        ? "Opened a pane menu at a fixed position — select a node for the node tools"
        : `Opened a node menu for '${selected}' at a fixed position`,
    );
  };

  return (
    <div
      data-demo-app=""
      style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0 }}
    >
      {/*
        The host owns stacking between the shell's overlay layer (canvas
        overlays live at z-index 1 inside the shell) and external chrome it
        mounts next to it: raising the shell above the external column keeps a
        floating overlay panel clickable instead of being covered by it.
      */}
      <div
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          position: "relative",
          zIndex: 2,
          /*
           * Panel widths are fixed (palette 250, properties 300): on a narrow
           * window the shell would otherwise overflow and let one region paint
           * over the canvas and its overlays. Scrolling keeps every region
           * clickable instead of stacking them on top of each other.
           */
          overflow: "auto",
        }}
      >
        <EditorShell
          onResizeRegion={(region: DockRegion, size: number) => {
            // `panelIdForRegion` is the documented mapping from a shell region to
            // the panel the layout engine can resize (S4: paneles redimensionables).
            const panelId = panelIdForRegion(store.getState().layout, region);
            if (panelId !== undefined) {
              layout.resizePanel(panelId, size);
            }
          }}
          slots={{
            header: (
              <Header
                title="Nodera"
                subtitle="Phase 5 · UI composition"
                actions={
                  <div className="demo-controls">
                    <select
                      className="demo-select"
                      aria-label="Theme"
                      data-demo-control="theme"
                      value={ui.themeId}
                      onChange={(event) => {
                        uiActions.setTheme(event.target.value);
                        setStatus(`Theme switched to '${event.target.value}'`);
                      }}
                    >
                      {themeRegistry.all().map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.name}
                        </option>
                      ))}
                    </select>

                    <select
                      className="demo-select"
                      aria-label="Layout"
                      data-demo-control="layout"
                      value={ui.layoutId}
                      onChange={(event) => {
                        layout.applyLayout(event.target.value);
                        setStatus(`Layout applied: '${event.target.value}'`);
                      }}
                    >
                      {layoutRegistry.all().map((definition) => (
                        <option key={definition.id} value={definition.id}>
                          {definition.name ?? definition.id}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="demo-button"
                      data-demo-control="canvas-only"
                      onClick={() => {
                        layout.applyLayout(CANVAS_ONLY_LAYOUT_ID);
                        setStatus("Canvas only: the same core with almost no chrome");
                      }}
                    >
                      Canvas only
                    </button>

                    <button
                      type="button"
                      className="demo-button"
                      data-demo-control="float-search"
                      onClick={floatSearch}
                    >
                      Float search
                    </button>

                    <button
                      type="button"
                      className="demo-button"
                      data-demo-control="dock-search"
                      onClick={dockSearch}
                    >
                      Dock search
                    </button>

                    <button
                      type="button"
                      className="demo-button"
                      data-demo-control="save-layout"
                      onClick={saveLayout}
                    >
                      Save layout
                    </button>

                    <button
                      type="button"
                      className="demo-button"
                      data-demo-control="restore-layout"
                      onClick={restoreLayout}
                    >
                      Restore layout
                    </button>

                    <button
                      type="button"
                      className="demo-button"
                      data-demo-control="interaction-mode"
                      data-active={ui.interactionMode === "pan"}
                      aria-pressed={ui.interactionMode === "pan"}
                      onClick={toggleInteractionMode}
                    >
                      {ui.interactionMode === "pan" ? "Mode: pan" : "Mode: select"}
                    </button>

                    <button
                      type="button"
                      className="demo-button"
                      data-demo-control="toggle-renderers"
                      data-active={brand}
                      onClick={toggleBrand}
                    >
                      {brand ? "Renderers: brand" : "Renderers: default"}
                    </button>

                    <button
                      type="button"
                      className="demo-button"
                      data-demo-control="menu-renderer"
                      data-active={brandMenu}
                      aria-pressed={brandMenu}
                      onClick={toggleMenuRenderer}
                    >
                      {brandMenu ? "Menu: brand" : "Menu: built-in"}
                    </button>

                    <button
                      type="button"
                      className="demo-button"
                      data-demo-control="open-menu"
                      onClick={openFixedMenu}
                    >
                      Open menu
                    </button>
                  </div>
                }
              >
                <Toolbar
                  tools={tools}
                  handlers={handlers}
                  onCommand={(command) => {
                    setStatus(`Command '${command.kind}' is not bound in this demo`);
                  }}
                />
              </Header>
            ),

            left: (
              <>
                {layoutPlaces(ui.layout, "palette") ? <PanelHost panelId="palette" /> : null}
                {searchDocked ? <PanelHost panelId="search" /> : null}
              </>
            ),

            right: (
              <>
                {layoutPlaces(ui.layout, "properties") ? <PanelHost panelId="properties" /> : null}
                {layoutPlaces(ui.layout, "minimap") ? <PanelHost panelId="minimap" /> : null}
              </>
            ),

            bottom: (
              <>
                {layoutPlaces(ui.layout, "validation") ? <PanelHost panelId="validation" /> : null}
                {layoutPlaces(ui.layout, "history") ? <PanelHost panelId="history" /> : null}
              </>
            ),

            canvas: (
              <CanvasContainer
                overlays={
                  <>
                    <ContextMenu
                      handlers={handlers}
                      onCommand={(command) => {
                        setStatus(`Menu command '${command.kind}' is not bound in this demo`);
                      }}
                    />
                    {searchFloating === undefined ? null : (
                      <div
                        className="demo-floating"
                        data-demo-floating="search"
                        style={{
                          left: searchFloating.rect?.x ?? 8,
                          top: searchFloating.rect?.y ?? 48,
                          width: searchFloating.rect?.width ?? 240,
                          height: searchFloating.rect?.height ?? 190,
                        }}
                      >
                        <PanelHost panelId="search" />
                      </div>
                    )}
                    <div className="demo-status" data-demo-status="" role="status">
                      {status}
                    </div>
                  </>
                }
              >
                <div className="demo-canvas" onContextMenu={openContextMenu}>
                  <GraphCanvas
                    editor={editor}
                    portRenderers={portRenderers}
                    /* Editor state → canvas behavior: the mode the host toggles in
                       the header is the one the adapter applies (S5). */
                    interactionMode={ui.interactionMode}
                    colorMode={ui.themeId === "nodera.dark" ? "dark" : "light"}
                    onNodeClick={(_event, node) => {
                      setStatus(`Selected node '${node.id}' — edit it in the properties panel`);
                    }}
                    onEdgeClick={(_event, edge) => {
                      setStatus(`Selected edge '${edge.id}' (definition ${ROWS_EDGE_DEFINITION_ID})`);
                    }}
                    onLinkValidate={(valid, issues) => {
                      setStatus(
                        valid
                          ? "Connection accepted by the application layer"
                          : `Connection rejected (${issues.length} issue(s))`,
                      );
                    }}
                    onDropNodeDefinition={(definitionId, position) => {
                      const added = addNode(editor, { definitionId, position });
                      setStatus(
                        added.ok
                          ? `Dropped '${definitionId}' at ${Math.round(position.x)},${Math.round(position.y)}`
                          : `Drop rejected: ${added.error.message}`,
                      );
                    }}
                  />
                </div>
              </CanvasContainer>
            ),
          }}
        />
      </div>

      {/*
        External panel (S4 "paneles externos al canvas"): `metadata` declares
        `region: "external"`, so no layout places it and the shell gives it no
        geometry. The host mounts it wherever it wants — here, a column of its
        own next to the shell, outside `EditorShell` entirely.
      */}
      <aside
        data-demo-external="metadata"
        aria-label="Host panels outside the shell"
        style={{
          display: "flex",
          flexDirection: "column",
          width: 260,
          minWidth: 0,
          position: "relative",
          zIndex: 1,
          borderLeft: "1px solid var(--ndr-colors-border, #d8dee9)",
          background: "var(--ndr-colors-surface, #ffffff)",
          overflow: "auto",
        }}
      >
        <PanelHost panelId="metadata" />
      </aside>
    </div>
  );
}
