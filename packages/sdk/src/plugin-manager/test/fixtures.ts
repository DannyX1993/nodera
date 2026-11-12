/**
 * Fixtures shared by the plugin-manager suites.
 *
 * They compose a real SDK builder (the manager is infrastructure over it, so a
 * fake builder would test nothing) and build the small, declarative definitions
 * a plugin contributes. Nothing here is exported from the package barrel.
 */

import type {
  PluginContext,
  PluginContribution,
  PluginDefinition,
  PluginManifest,
} from "../../plugin-api/index.js";
import { createBuilder, type Builder } from "../../builder/builder.js";
import type { NodeDefinitionInput } from "../../authoring/nodes.js";
import type { BuilderPluginApi } from "../../plugin/plugin.js";

/** Composes a real builder, failing loudly when the composition itself breaks. */
export function createTestBuilder(): Builder {
  const result = createBuilder();
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

/** A manifest with defaults, so a test only states what it is about. */
export function pluginManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return { id: "acme.nodes", name: "Acme nodes", version: "1.0.0", ...overrides };
}

/** One declared contribution. */
export function contribution(
  type: PluginContribution["type"],
  id: string,
): PluginContribution {
  return { type, id };
}

/** A node definition a plugin can contribute. */
export function nodeInput(type: string): NodeDefinitionInput {
  return { type, version: "1.0.0", label: type, category: "acme" };
}

/**
 * A host-provided value that is not a plugin definition.
 *
 * The manager receives the set the host discovered, so it checks the shape of
 * each entry before reading it. The cast is confined to this helper.
 */
export function notADefinition(value: unknown): PluginDefinition<BuilderPluginApi> {
  return value as PluginDefinition<BuilderPluginApi>;
}

/**
 * A definition whose manifest is untrusted data.
 *
 * The manager validates every manifest it receives before running plugin code,
 * so a test of that validation needs a definition that is deliberately not a
 * valid `PluginManifest`. The cast is confined to this helper.
 */
export function untrustedDefinition(
  manifest: unknown,
  activate: (ctx: PluginContext<BuilderPluginApi>) => void,
): PluginDefinition<BuilderPluginApi> {
  return { manifest: manifest as PluginManifest, activate };
}
