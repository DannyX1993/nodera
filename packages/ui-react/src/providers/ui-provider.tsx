import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { EditorEngine } from "@nodera/application";
import { LayoutRegistry } from "@nodera/layout-engine";
import { ThemeRegistry, type ThemeDefinition } from "@nodera/theme-engine";
import {
  UiStateStore,
  type PanelRegistry,
  type ToolRegistry,
  type UiState,
} from "@nodera/ui-core";

import { createDefaultPanelRegistry } from "@nodera/ui-core";
import { createDefaultComponentRenderers } from "../defaults/default-renderers.js";
import { createDefaultToolRegistry } from "@nodera/ui-core";
import type { ComponentRenderers } from "../registries/component-registry.js";
import { themeStyle } from "../theme-style.js";

/** Registries the provider exposes to every UI component. */
export interface NoderaUiRegistries {
  readonly themeRegistry: ThemeRegistry;
  readonly layoutRegistry: LayoutRegistry;
  readonly panelRegistry: PanelRegistry;
  readonly toolRegistry: ToolRegistry;
  readonly renderers: ComponentRenderers;
}

/** Props accepted by {@link NoderaUiProvider}. */
export interface NoderaUiProviderProps {
  /** Framework-agnostic UI state store. The host owns its lifetime. */
  readonly store: UiStateStore;
  /**
   * Editor the UI surfaces bind to. Optional because panels that only read UI
   * state (a header, a theme picker) never need a graph, and because the
   * provider must stay usable without an application session.
   */
  readonly editor?: EditorEngine;
  /** Themes the UI can apply. Defaults to the built-in registry. */
  readonly themeRegistry?: ThemeRegistry;
  /** Layouts the shell can apply. Defaults to the built-in registry. */
  readonly layoutRegistry?: LayoutRegistry;
  /** Panels the host offers. Defaults to the Phase 5 panels. */
  readonly panelRegistry?: PanelRegistry;
  /** Tools the surfaces offer. Defaults to the Phase 5 tools. */
  readonly toolRegistry?: ToolRegistry;
  /**
   * Replaceable panel/property/toolbar renderers. Defaults to the built-in
   * registries ({@link createDefaultComponentRenderers}).
   */
  readonly renderers?: ComponentRenderers;
  readonly children: ReactNode;
}

/** Value of the UI context. */
export interface NoderaUiContextValue extends NoderaUiRegistries {
  readonly store: UiStateStore;
  /** Live editor the host supplied, if any. */
  readonly editor: EditorEngine | undefined;
}

const NoderaUiContext = createContext<NoderaUiContextValue | undefined>(undefined);

function createDefaultRegistries(): NoderaUiRegistries {
  return {
    themeRegistry: new ThemeRegistry(),
    layoutRegistry: new LayoutRegistry(),
    panelRegistry: createDefaultPanelRegistry(),
    toolRegistry: createDefaultToolRegistry(),
    renderers: createDefaultComponentRenderers(),
  };
}

/**
 * Root of the React presentation layer.
 *
 * It binds the framework-agnostic contracts (ui-core, theme-engine,
 * layout-engine) to React and renders the theme CSS custom properties on a
 * wrapper element, so every host subtree inherits the tokens without a
 * stylesheet (D2). Registries are stable per instance: the host may pass its
 * own and every consumer sees the same objects until the props change.
 */
export function NoderaUiProvider(props: NoderaUiProviderProps): ReactNode {
  const defaults = useMemo(createDefaultRegistries, []);
  const themeRegistry = props.themeRegistry ?? defaults.themeRegistry;
  const layoutRegistry = props.layoutRegistry ?? defaults.layoutRegistry;
  const panelRegistry = props.panelRegistry ?? defaults.panelRegistry;
  const toolRegistry = props.toolRegistry ?? defaults.toolRegistry;
  const renderers = props.renderers ?? defaults.renderers;
  const store = props.store;
  const editor = props.editor;

  const value = useMemo<NoderaUiContextValue>(
    () => ({ store, editor, themeRegistry, layoutRegistry, panelRegistry, toolRegistry, renderers }),
    [store, editor, themeRegistry, layoutRegistry, panelRegistry, toolRegistry, renderers],
  );

  return (
    <NoderaUiContext.Provider value={value}>
      <UiThemeRoot>{props.children}</UiThemeRoot>
    </NoderaUiContext.Provider>
  );
}

/**
 * Theme wrapper of the provider subtree.
 *
 * It is a separate component because it resolves the theme from the context the
 * provider has just supplied: the provider itself cannot read its own context.
 */
function UiThemeRoot({ children }: { readonly children: ReactNode }): ReactNode {
  const theme = useTheme();
  return (
    <div
      data-nodera-theme={theme.id}
      data-nodera-color-scheme={theme.colorScheme}
      style={themeStyle(theme)}
    >
      {children}
    </div>
  );
}

/** Context value of the nearest provider. Throws outside a provider. */
export function useNoderaUi(): NoderaUiContextValue {
  const value = useContext(NoderaUiContext);
  if (value === undefined) {
    throw new Error("useNoderaUi must be used inside <NoderaUiProvider>");
  }
  return value;
}

/**
 * Editor the UI surfaces bind to.
 *
 * Throws instead of returning `undefined` because a surface that asks for the
 * editor cannot render anything meaningful without one: failing loudly at the
 * composition boundary beats rendering a silently empty graph panel. The same
 * message covers the two ways to be misconfigured: composing the surface
 * outside the provider, or inside a provider the host did not give an editor.
 */
export function useEditorEngine(): EditorEngine {
  const editor = useContext(NoderaUiContext)?.editor;
  if (editor === undefined) {
    throw new Error("useEditorEngine requires an editor on <NoderaUiProvider>");
  }
  return editor;
}

/** Current immutable UI state, re-rendering on every store change. */
export function useUiState(): UiState {
  const { store } = useNoderaUi();
  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(() => onStoreChange()),
    [store],
  );
  const getSnapshot = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Theme the UI applies.
 *
 * Resolved through the registry by the store theme id; an id the registry does
 * not know falls back to its declared default instead of failing the render.
 */
export function useTheme(): ThemeDefinition {
  const { themeRegistry } = useNoderaUi();
  const state = useUiState();
  return useMemo(
    () => themeRegistry.get(state.themeId) ?? themeRegistry.getDefault(),
    [themeRegistry, state.themeId],
  );
}

/** Panel registry of the nearest provider. */
export function usePanelRegistry(): PanelRegistry {
  return useNoderaUi().panelRegistry;
}

/** Tool registry of the nearest provider. */
export function useToolRegistry(): ToolRegistry {
  return useNoderaUi().toolRegistry;
}

/** Layout registry of the nearest provider. */
export function useLayoutRegistry(): LayoutRegistry {
  return useNoderaUi().layoutRegistry;
}

/** Replaceable component renderers of the nearest provider. */
export function useComponentRenderers(): ComponentRenderers {
  return useNoderaUi().renderers;
}
