/**
 * React binding of one Nodera builder.
 *
 * The provider is the whole reason a host does not hand-wire the React layers
 * (L3: the Phase 5 demo hand-wires six registries, a store and seven provider
 * props). It forwards the *builder's own* state and registries into
 * `NoderaUiProvider`, so a contribution made through the SDK —
 * `builder.registerPanel()`, `builder.theme.setDefault()`,
 * `builder.bindRenderer()` — is visible in the UI without a second wiring step
 * (D11). Building the defaults again here would make every SDK contribution
 * silently invisible, which is precisely the bug this package exists to avoid.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Builder } from "@nodera/sdk";
import { NoderaUiProvider, type ComponentRenderers } from "@nodera/ui-react";

import { createRendererSet, type RendererSet } from "../renderers/renderer-set.js";

/** Props accepted by {@link NoderaBuilderProvider}. */
export interface NoderaBuilderProviderProps {
  /** The assembled builder whose state, registries and renderers the UI shows. */
  readonly builder: Builder;
  /**
   * Component renderers to start from. Defaults to the framework presets, so a
   * host only declares what it replaces.
   */
  readonly base?: ComponentRenderers;
  readonly children: ReactNode;
}

/** Value of the builder context. */
export interface NoderaBuilderContextValue {
  readonly builder: Builder;
  /** React registries the opaque builder renderers currently resolve to. */
  readonly renderers: RendererSet;
}

const BuilderContext = createContext<NoderaBuilderContextValue | undefined>(undefined);

/**
 * Provides the builder and its React binding to a UI subtree.
 *
 * Everything the UI reads comes from the builder: its UI state store, its
 * editing session, its theme/layout/panel/tool registries and its opaque
 * renderer snapshot. The renderer set is memoised on the *snapshot identity* —
 * `builder.renderers` is a new object after every registration — plus the base,
 * because rebuilding the registries on an unrelated re-render makes the canvas
 * re-mount every node type it renders.
 */
export function NoderaBuilderProvider(props: NoderaBuilderProviderProps): ReactNode {
  const builder = props.builder;
  const base = props.base;
  const bindings = builder.renderers;

  const renderers = useMemo(
    () => createRendererSet(bindings, base === undefined ? {} : { base }),
    [bindings, base],
  );

  const value = useMemo<NoderaBuilderContextValue>(
    () => ({ builder, renderers }),
    [builder, renderers],
  );

  return (
    <BuilderContext.Provider value={value}>
      <NoderaUiProvider
        store={builder.store}
        editor={builder.editor}
        themeRegistry={builder.registries.themes}
        layoutRegistry={builder.registries.layouts}
        panelRegistry={builder.registries.panels}
        toolRegistry={builder.registries.tools}
        renderers={renderers.components}
      >
        {props.children}
      </NoderaUiProvider>
    </BuilderContext.Provider>
  );
}

/** The builder of the nearest provider. Throws outside a provider. */
export function useBuilder(): Builder {
  const value = useContext(BuilderContext);
  if (value === undefined) {
    throw new Error("useBuilder must be used inside <NoderaBuilderProvider>");
  }
  return value.builder;
}

/**
 * The React renderer set of the nearest provider.
 *
 * Throws for the same reason `useBuilder` does: a surface that asks for the
 * renderers has no meaningful fallback, and a silent empty registry would show
 * an editor whose custom renderers never appear.
 */
export function useBuilderRenderers(): RendererSet {
  const value = useContext(BuilderContext);
  if (value === undefined) {
    throw new Error("useBuilderRenderers must be used inside <NoderaBuilderProvider>");
  }
  return value.renderers;
}
