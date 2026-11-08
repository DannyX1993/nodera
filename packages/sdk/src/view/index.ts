/**
 * The `@nodera/sdk` read vocabulary.
 *
 * Two families, both speaking PRODUCT-DESCRIPTION §9:
 *
 * - {@link ./definitions}: `NodeDefinitionView`, `EdgeDefinitionView` and
 *   `PortView`, the shape of everything a host reads from a definition.
 * - {@link ./instances}: `NodeInstanceView` and `EdgeInstanceView`, the shape of
 *   everything a host reads from a graph.
 *
 * The registry read-adapter *types* are part of the same surface — a host may
 * need to annotate what `builder.registries.nodes` returns — while the factories
 * that build them stay internal to the builder's composition.
 */

export * from "./definitions.js";
export * from "./instances.js";
export type {
  EdgeDefinitionRegistryView,
  NodeDefinitionRegistryView,
} from "./registries.js";
