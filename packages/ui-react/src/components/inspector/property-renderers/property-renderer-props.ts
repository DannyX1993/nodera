/**
 * Props contract of a replaceable property renderer.
 *
 * The definition comes from `@nodera/property-system` and the type lives in the
 * component registry, so this module only re-exports it: a host replacing a
 * property renderer (S3 Level 2: "Property Renderer") imports the contract from
 * one stable place instead of reaching into the registry module.
 */

export type { PropertyRendererProps } from "../../../registries/component-registry.js";
