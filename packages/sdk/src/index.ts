/**
 * `@nodera/sdk` — the public entry point of the Nodera graph editing
 * framework.
 *
 * A host application imports from here and nowhere else: the builder factory,
 * the authoring vocabulary for nodes, edges, ports and properties, the engine
 * adapter port, the document/registry/event/plugin/theme/layout APIs and the
 * `Result`-based diagnostic model. Nothing in this barrel imports React, React
 * Flow or any other presentation engine: the SDK composes the framework-free
 * core, and a presentation binding selects the engine.
 *
 * The published vocabulary (`./vocabulary.js`) is the set of names a host must
 * be able to write to use this API: they are type-only re-exports of the module
 * that owns each one, never a re-declaration.
 */

export * from "./errors.js";
export * from "./vocabulary.js";
export * from "./authoring/renderer-binding.js";
export * from "./authoring/ports.js";
export * from "./authoring/properties.js";
export * from "./authoring/nodes.js";
export * from "./authoring/edges.js";
export * from "./adapter/adapter.js";
export * from "./adapter/renderer-bindings.js";
export * from "./builder/features.js";
export * from "./builder/configuration.js";
export * from "./builder/builder.js";
export * from "./graph/graph-api.js";
export * from "./document/document-api.js";
export * from "./events/events-api.js";
export * from "./plugin/plugin.js";
