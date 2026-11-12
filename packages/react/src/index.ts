/**
 * `@nodera/react` — the React binding of the Nodera graph editing framework.
 *
 * This is the single package a React host installs next to React and React
 * Flow. It re-exports three surfaces on one import path:
 *
 * 1. `@nodera/sdk` — the whole framework-free core: the builder factory, the
 *    authoring vocabulary, the registries, the document/event/plugin APIs, the
 *    plugin contracts and manager, and the engine-adapter port.
 * 2. `@nodera/react-flow` — the React Flow canvas adapter (`GraphCanvas`, the
 *    renderer registries, the React Flow mappers) and its SDK binding
 *    (`NoderaEditor`, `NoderaBuilderProvider`, `createReactFlowAdapter`).
 * 3. `@nodera/ui-react` — the React presentation layer: providers, hooks,
 *    panels, inspectors and the replaceable renderers.
 *
 * Everything below is a re-export; no behaviour is defined here. The binding is
 * a package, not a layer of the core, so a different framework later is a
 * different binding package and the SDK stays untouched (AGENTS.md §4.1).
 *
 * Two names are exported by more than one of the three packages because the
 * binding re-exports the core vocabulary for its own callers. Both are the very
 * same declaration — the React Flow integration derives them from the SDK — so
 * the explicit re-exports below only say which package the binding answers to.
 */

export * from "@nodera/sdk";

// The canvas adapter re-exports these two SDK-owned types for the hosts that use
// it without the SDK. Name them from the SDK so the binding keeps one owner.
export type { PortPlacement, ViewportConfiguration } from "@nodera/sdk";

export * from "@nodera/react-flow";
export * from "@nodera/ui-react";
