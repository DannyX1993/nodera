/**
 * Public entry point of `@nodera/ui-react`.
 *
 * The React presentation layer binds the framework-agnostic contracts
 * (`@nodera/ui-core`, `@nodera/theme-engine`, `@nodera/layout-engine`) and the
 * application layer (`@nodera/application`) to React. It never imports the
 * React Flow adapter: `packages/canvas-react-flow` stays the only consumer of
 * that dependency (AGENTS.md §4.1).
 */

export * from "./theme-style.js";
export * from "./registries/component-registry.js";
export * from "./defaults/default-panels.js";
export * from "./defaults/default-tools.js";
export * from "./components/shell/shell-sizes.js";
export * from "./components/shell/editor-shell.js";
export * from "./components/shell/canvas-container.js";
export * from "./components/shell/panel-chrome.js";
export * from "./components/shell/panel-host.js";
export * from "./components/shell/header.js";
export * from "./components/shell/footer.js";
export * from "./components/shell/sidebar.js";
export * from "./components/discovery/search.js";
export * from "./components/discovery/node-palette.js";
export * from "./components/discovery/navigator.js";
export * from "./components/discovery/search-panel.js";
export * from "./components/discovery/minimap-panel.js";
export * from "./components/inspector/property-renderers/property-renderer-props.js";
export * from "./components/inspector/property-renderers/defaults.js";
export * from "./components/inspector/property-layout.js";
export * from "./components/inspector/properties-panel.js";
export * from "./components/inspector/inspector-panel.js";
export * from "./components/inspector/metadata-panel.js";
export * from "./components/actions/command-dispatch.js";
export * from "./components/actions/toolbar.js";
export * from "./components/actions/context-menu.js";
export * from "./components/reports/validation-panel.js";
export * from "./components/reports/history-panel.js";
export * from "./providers/ui-provider.js";
export * from "./providers/theme-provider.js";
export * from "./bindings/ui-state-actions.js";
export * from "./bindings/layout-actions.js";
export * from "./bindings/editor-snapshot.js";
export * from "./bindings/graph-queries.js";
export * from "./bindings/editor-commands.js";
export * from "./bindings/validation.js";
export * from "./bindings/history.js";
