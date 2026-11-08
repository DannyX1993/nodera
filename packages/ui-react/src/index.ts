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
export * from "./providers/ui-provider.js";
export * from "./providers/theme-provider.js";
export * from "./bindings/ui-state-actions.js";
export * from "./bindings/layout-actions.js";
export * from "./bindings/editor-snapshot.js";
export * from "./bindings/graph-queries.js";
export * from "./bindings/editor-commands.js";
export * from "./bindings/validation.js";
export * from "./bindings/history.js";
