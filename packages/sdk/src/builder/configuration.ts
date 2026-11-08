/**
 * The declarative configuration a host hands to `createBuilder`.
 *
 * Every field is optional and grouped by concern, so a host can start from the
 * framework defaults and add exactly what it needs. Nothing here is a
 * behaviour: the configuration is data, validated by the builder composition
 * root before a single registry is mutated.
 */

import type { GraphSettings } from "@nodera/graph-model";
import type { BuilderAdapterInput } from "../adapter/adapter.js";
import type { EdgeDefinitionInput } from "../authoring/edges.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import type { PropertyInput } from "../authoring/properties.js";
import type { BuilderFeaturesInput } from "./features.js";

/** Definitions the builder registers before the host touches it. */
export interface BuilderRegistryConfiguration {
  readonly nodes?: readonly NodeDefinitionInput[];
  readonly edges?: readonly EdgeDefinitionInput[];
  readonly properties?: readonly PropertyInput[];
}

/** Portable document format the builder produces and consumes. */
export interface BuilderDocumentConfiguration {
  /** Only the canonical Generic Graph Document format is supported. */
  readonly format?: "ggd";
  /** Format version, semver-shaped. Defaults to the document package default. */
  readonly version?: string;
}

/** Format and version the builder resolved from the configuration. */
export interface BuilderDocumentFormat {
  readonly format: string;
  readonly version: string;
}

/** Theme and layout the builder applies to the UI state it owns. */
export interface BuilderUiConfiguration {
  /** Theme id registered in the builder theme registry. */
  readonly theme?: string;
  /** Layout id registered in the builder layout registry. */
  readonly layout?: string;
}

/** Initial graph of the builder's own editing session. */
export interface BuilderGraphConfiguration {
  readonly graphId?: string;
  readonly settings?: GraphSettings;
}

/** Everything a host may configure on the builder. */
export interface BuilderConfiguration {
  /** Globally qualified builder id. Defaults to `nodera.builder`. */
  readonly id?: string;
  readonly adapter?: BuilderAdapterInput;
  readonly registry?: BuilderRegistryConfiguration;
  readonly features?: BuilderFeaturesInput;
  readonly document?: BuilderDocumentConfiguration;
  readonly ui?: BuilderUiConfiguration;
  readonly graph?: BuilderGraphConfiguration;
}
