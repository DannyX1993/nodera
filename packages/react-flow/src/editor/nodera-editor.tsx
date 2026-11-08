/**
 * `<NoderaEditor>`: the default editor composition of the React binding.
 *
 * It replaces the manual composition a Phase 5 host writes by hand — shell,
 * panel hosts, canvas container, canvas and context menu — with one component
 * that reads everything from the builder. It is a default, not a policy: the
 * `slots` prop replaces any region and the `layout` prop selects a different
 * registry layout, so a host keeps full composition authority (Level 3) without
 * touching the internals of this file.
 *
 * Two rules make the composition honest rather than decorative:
 * - panels are composed from `builder.registries.panels` *and* the applied
 *   layout state, so a panel the host removed never renders and a hidden panel
 *   stays hidden;
 * - `builder.features` is observable: a disabled feature drops its panel
 *   instead of painting a panel whose capability the builder refused (D7).
 */

import { useEffect, type ReactNode } from "react";

import type { Builder, ResolvedFeatures } from "@nodera/sdk";
import type { DockRegion, LayoutState, PanelRegion, PanelRegistry } from "@nodera/ui-core";
import {
  CanvasContainer,
  ContextMenu,
  EditorShell,
  PanelHost,
  Toolbar,
  panelIdForRegion,
  useLayoutActions,
  usePanelRegistry,
  useTheme,
  useUiState,
  type ComponentRenderers,
  type EditorShellSlots,
} from "@nodera/ui-react";

import { GraphCanvas } from "../canvas/graph-canvas.js";
import { NoderaCanvasProvider } from "../canvas/nodera-canvas-provider.js";
import {
  NoderaBuilderProvider,
  useBuilderRenderers,
} from "../providers/builder-provider.js";

/** Props accepted by {@link NoderaEditor}. */
export interface NoderaEditorProps {
  /** The assembled builder the editor renders. */
  readonly builder: Builder;
  /** Component renderers to start from. Defaults to the framework presets. */
  readonly base?: ComponentRenderers;
  /**
   * Layout id from `builder.registries.layouts`. Defaults to the layout the
   * builder's UI state already has applied. Naming a layout applies it once on
   * mount, so the shell geometry and the composed panels cannot disagree.
   */
  readonly layout?: string;
  /**
   * Host composition override. Only the regions the host names are replaced;
   * every other region keeps its default composition.
   */
  readonly slots?: Partial<EditorShellSlots>;
  /** Host hook for a region splitter drag, after the panel was resized. */
  readonly onResizeRegion?: (region: PanelRegion, size: number) => void;
  /**
   * Replaces the framework's "+" button on every edge (S6).
   *
   * The canvas keeps the midpoint position and the activation path (the edge
   * becomes the pending insertion and the node-creation dialog opens); this prop
   * only changes what the control looks like, so a host can ship an icon, a
   * different label or its own component. The affordance itself is still enabled
   * by `features.edgeInsertion`, never by rendering it, and the phantom empty
   * state (a placeholder node, plus a placeholder edge while the graph holds one
   * node) keeps the framework's own `"+"`: it records an append anchor instead of
   * an edge, so a host button wired to `useEdgeInsertActions` could not run it.
   */
  readonly renderEdgeInsert?: (edgeId: string) => ReactNode;
  readonly className?: string;
}

/**
 * Panel ids whose capability a feature flag owns.
 *
 * The mapping is explicit because a feature is a *capability*, not a naming
 * convention: `minimap: false` means "this builder has no minimap surface", so
 * the minimap panel is not composed at all.
 */
function featureAllowsPanel(panelId: string, features: ResolvedFeatures): boolean {
  if (panelId === "minimap" && !features.minimap) {
    return false;
  }
  if (panelId === "validation" && !features.validation) {
    return false;
  }
  return true;
}

/**
 * Panels the editor composes in one region.
 *
 * The applied layout decides placement and visibility; the registry decides
 * existence and the feature flags decide capability. A layout that still places
 * a panel the host unregistered, or a panel a flag disabled, composes nothing.
 * With no applied layout the registry's own region is the fallback.
 */
function composedPanelIds(
  registry: PanelRegistry,
  layout: LayoutState | undefined,
  region: PanelRegion,
  features: ResolvedFeatures,
): readonly string[] {
  const placed =
    layout === undefined
      ? registry.byRegion(region).map((panel) => ({ panelId: panel.id, visible: true }))
      : layout.panels.filter((panel) => panel.region === region);

  const ids: string[] = [];
  for (const entry of placed) {
    if (!entry.visible || !registry.has(entry.panelId)) {
      continue;
    }
    if (!featureAllowsPanel(entry.panelId, features)) {
      continue;
    }
    ids.push(entry.panelId);
  }
  return ids;
}

/** Renders the composed panels of one region, or nothing when it is empty. */
function regionContent(panelIds: readonly string[]): ReactNode {
  if (panelIds.length === 0) {
    return undefined;
  }
  return panelIds.map((panelId) => <PanelHost key={panelId} panelId={panelId} />);
}

/**
 * Default canvas region: the engine's canvas inside the shell's container, with
 * the context menu as its overlay.
 *
 * Every prop comes from the binding or from the builder: the editor session,
 * the registries the provider resolved, the interaction mode and the drag,
 * connections and ports policies of the UI state, the color scheme of the applied
 * theme and the feature flags.
 * A palette drop becomes `builder.graph.addNode`, so the drop path is the SDK's
 * use case and not a second mutation route.
 */
function DefaultCanvasRegion(props: {
  readonly builder: Builder;
  readonly renderEdgeInsert?: (edgeId: string) => ReactNode;
}): ReactNode {
  const builder = props.builder;
  const ui = useUiState();
  const theme = useTheme();
  const renderers = useBuilderRenderers();

  return (
    <NoderaCanvasProvider editor={builder.editor}>
      <CanvasContainer overlays={<ContextMenu />}>
        <GraphCanvas
          editor={builder.editor}
          nodeRenderers={renderers.nodeRenderers}
          edgeRenderers={renderers.edgeRenderers}
          portRenderers={renderers.portRenderers}
          interactionMode={ui.interactionMode}
          dragPolicy={ui.dragPolicy}
          connectionsPolicy={ui.connections}
          portsPolicy={ui.ports}
          colorMode={theme.colorScheme ?? "light"}
          showMinimap={builder.features.minimap}
          showControls={builder.adapter?.capabilities.controls ?? true}
          edgeInsertion={builder.features.edgeInsertion}
          {...(props.renderEdgeInsert === undefined
            ? {}
            : { renderEdgeInsert: props.renderEdgeInsert })}
          onDropNodeDefinition={(definitionId, position) => {
            builder.graph.addNode({ type: definitionId, position });
          }}
        />
      </CanvasContainer>
    </NoderaCanvasProvider>
  );
}

/**
 * The composed editor surface.
 *
 * A separate component because it reads the provider the outer
 * {@link NoderaEditor} has just supplied: a component cannot consume its own
 * context.
 */
function EditorSurface(props: NoderaEditorProps): ReactNode {
  const builder = props.builder;
  const ui = useUiState();
  const layoutActions = useLayoutActions();
  const panelRegistry = usePanelRegistry();
  const requestedLayout = props.layout;

  useEffect(() => {
    if (requestedLayout === undefined) {
      return;
    }
    if (builder.store.getState().layoutId === requestedLayout) {
      return;
    }
    // The layout engine builds the panel state and owns unknown ids, so naming
    // an unregistered layout is a reported no-op, not a crash.
    layoutActions.applyLayout(requestedLayout);
  }, [builder, layoutActions, requestedLayout]);

  const features = builder.features;
  const layout = ui.layout;
  const regionPanels = (region: PanelRegion): readonly string[] =>
    composedPanelIds(panelRegistry, layout, region, features);

  const headerPanels = regionPanels("header");
  const headerContent =
    headerPanels.length === 0 ? <Toolbar /> : regionContent(headerPanels);
  const leftContent = regionContent(regionPanels("left"));
  const rightContent = regionContent(regionPanels("right"));
  const bottomContent = regionContent(regionPanels("bottom"));
  const floatingContent = regionContent(regionPanels("floating"));
  const footerContent = regionContent(regionPanels("footer"));

  const hostSlots = props.slots;
  const hostResize = props.onResizeRegion;

  const slots: EditorShellSlots = {
    canvas:
      hostSlots?.canvas ?? (
        <DefaultCanvasRegion
          builder={builder}
          {...(props.renderEdgeInsert === undefined
            ? {}
            : { renderEdgeInsert: props.renderEdgeInsert })}
        />
      ),
    ...(hostSlots?.header === undefined && headerContent === undefined
      ? {}
      : { header: hostSlots?.header ?? headerContent }),
    ...(hostSlots?.left === undefined && leftContent === undefined
      ? {}
      : { left: hostSlots?.left ?? leftContent }),
    ...(hostSlots?.right === undefined && rightContent === undefined
      ? {}
      : { right: hostSlots?.right ?? rightContent }),
    ...(hostSlots?.bottom === undefined && bottomContent === undefined
      ? {}
      : { bottom: hostSlots?.bottom ?? bottomContent }),
    ...(hostSlots?.floating === undefined && floatingContent === undefined
      ? {}
      : { floating: hostSlots?.floating ?? floatingContent }),
    ...(hostSlots?.footer === undefined && footerContent === undefined
      ? {}
      : { footer: hostSlots?.footer ?? footerContent }),
  };

  return (
    <EditorShell
      slots={slots}
      {...(props.className === undefined ? {} : { className: props.className })}
      onResizeRegion={(region: DockRegion, size: number) => {
        const panelId = panelIdForRegion(builder.store.getState().layout, region);
        if (panelId !== undefined) {
          layoutActions.resizePanel(panelId, size);
        }
        hostResize?.(region, size);
      }}
    />
  );
}

/**
 * The default Nodera editor for a builder.
 *
 * It supplies its own `NoderaBuilderProvider`, so a host mounts one component:
 * `<NoderaEditor builder={builder} />`. The provider is inside this component
 * (not required from the host) because the editor cannot render a single panel
 * without the builder's store and registries.
 */
export function NoderaEditor(props: NoderaEditorProps): ReactNode {
  return (
    <NoderaBuilderProvider
      builder={props.builder}
      {...(props.base === undefined ? {} : { base: props.base })}
    >
      <EditorSurface {...props} />
    </NoderaBuilderProvider>
  );
}
