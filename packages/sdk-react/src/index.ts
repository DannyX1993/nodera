/**
 * `@nodera/sdk-react` — the React binding of the Nodera SDK and the first
 * presentation engine adapter.
 *
 * A host that wants React renders one component (`<NoderaEditor>`) or composes
 * its own surface inside `<NoderaBuilderProvider>`. Everything it needs comes
 * from the builder: state, registries, opaque renderers and feature flags.
 *
 * The engine-agnostic split stays intact: this package is the only one that
 * binds React *and* selects a canvas engine, it reaches React Flow exclusively
 * through `@nodera/canvas-react-flow`, and `@nodera/sdk` never learns that React
 * exists. A future engine or framework binding is another package like this
 * one; nothing here is a prerequisite for the SDK.
 *
 * The renderer vocabulary (`./vocabulary.js`) is the published name of every
 * contract a host renderer receives once its opaque value reaches this binding:
 * type-only re-exports of `@nodera/canvas-react-flow` and `@nodera/ui-react`,
 * never a re-declaration.
 */

export * from "./vocabulary.js";
export * from "./adapter/react-flow-adapter.js";
export * from "./renderers/renderer-set.js";
export * from "./providers/builder-provider.js";
export * from "./editor/nodera-editor.js";
