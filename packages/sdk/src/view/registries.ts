/**
 * Read adapters for the definition registries the builder owns.
 *
 * `builder.registries.nodes` and `.edges` are how a host reads what a builder
 * knows, and they answer in the same §9 vocabulary the host authored in: every
 * value here is a {@link NodeDefinitionView} / {@link EdgeDefinitionView}, never
 * a core definition. The concrete `NodeRegistry`/`EdgeRegistry` stay reachable
 * through the documented escape hatch (`builder.editor`), which is where core
 * shapes belong.
 *
 * Three deliberate properties:
 *
 * - Registration goes through `builder.registerNode`/`registerEdge`, so the
 *   adapters expose no `register`: a host must not be able to bypass authoring
 *   validation or the renderer bindings a registration produces.
 * - The one mutation the adapters do expose is `unregister`, because a host
 *   that can add a definition must be able to remove it, and the useful answer
 *   is the definition that left the registry — as a view.
 * - Nothing throws. `get` returns `undefined`, `require` and `unregister`
 *   return `Result`s with `sdk.unknown-definition`, and a disposed builder
 *   refuses the mutation with `sdk.disposed` while every read keeps working.
 *
 * The edge adapter groups by `byConnectionType` rather than `byCategory`,
 * because the domain's `EdgeDefinition` declares connection types and no
 * category: a `byCategory` that always returned nothing would be a lie.
 */

import { err, ok, type Result } from "@nodera/contracts";
import type { EdgeRegistry } from "@nodera/edge-registry";
import type { NodeRegistry } from "@nodera/node-registry";
import {
  disposedIssue,
  sdkError,
  type SdkIssue,
  type SdkIssues,
} from "../errors.js";
import {
  toEdgeDefinitionView,
  toNodeDefinitionView,
  type EdgeDefinitionView,
  type NodeDefinitionView,
} from "./definitions.js";

/** Read surface of the node definitions a builder knows. */
export interface NodeDefinitionRegistryView {
  /** Every registered definition, in registration order. */
  all(): readonly NodeDefinitionView[];
  /** One definition by type, or `undefined` when it is not registered. */
  get(type: string): NodeDefinitionView | undefined;
  has(type: string): boolean;
  /** One definition by type, or `sdk.unknown-definition`. Never throws. */
  require(type: string): Result<NodeDefinitionView, SdkIssues>;
  /** Every definition of a category, in registration order. */
  byCategory(category: string): readonly NodeDefinitionView[];
  /** Categories in use, sorted alphabetically. */
  categories(): readonly string[];
  readonly size: number;
  /** Removes one definition and returns the view that left the registry. */
  unregister(type: string): Result<NodeDefinitionView, SdkIssues>;
}

/** Read surface of the edge definitions a builder knows. */
export interface EdgeDefinitionRegistryView {
  /** Every registered definition, in registration order. */
  all(): readonly EdgeDefinitionView[];
  /** One definition by type, or `undefined` when it is not registered. */
  get(type: string): EdgeDefinitionView | undefined;
  has(type: string): boolean;
  /** One definition by type, or `sdk.unknown-definition`. Never throws. */
  require(type: string): Result<EdgeDefinitionView, SdkIssues>;
  /** Every definition modeling a connection type, in registration order. */
  byConnectionType(connectionType: string): readonly EdgeDefinitionView[];
  readonly size: number;
  /** Removes one definition and returns the view that left the registry. */
  unregister(type: string): Result<EdgeDefinitionView, SdkIssues>;
}

/** The diagnostic an unknown definition type reports, whatever asked for it. */
function unknownDefinitionIssue(
  kind: string,
  type: string,
  known: readonly string[],
): SdkIssue {
  return {
    ...sdkError("sdk.unknown-definition", `No ${kind} registered with type "${type}"`, {
      path: ["type"],
      metadata: { value: type, known },
    }),
    severity: "error",
  };
}

/** The diagnostic an unknown node definition type reports. */
function missingNodeDefinition(type: string, registry: NodeRegistry): SdkIssue {
  return unknownDefinitionIssue(
    "node definition",
    type,
    registry.all().map((entry) => entry.id),
  );
}

/** The diagnostic an unknown edge definition type reports. */
function missingEdgeDefinition(type: string, registry: EdgeRegistry): SdkIssue {
  return unknownDefinitionIssue(
    "edge definition",
    type,
    registry.all().map((entry) => entry.id),
  );
}

/**
 * Wraps the node registry in its read adapter.
 *
 * `isDisposed` is the builder's lifecycle flag: it closes `unregister` only,
 * because a host must still be able to render the definitions it already read.
 */
export function createNodeDefinitionRegistryView(
  registry: NodeRegistry,
  isDisposed: () => boolean,
): NodeDefinitionRegistryView {
  return {
    all: () => registry.all().map(toNodeDefinitionView),
    get(type) {
      const found = registry.get(type);
      return found === undefined ? undefined : toNodeDefinitionView(found);
    },
    has: (type) => registry.has(type),
    require(type) {
      const found = registry.get(type);
      return found === undefined
        ? err([missingNodeDefinition(type, registry)])
        : ok(toNodeDefinitionView(found));
    },
    byCategory: (category) => registry.byCategory(category).map(toNodeDefinitionView),
    categories: () => registry.categories(),
    get size() {
      return registry.size;
    },
    unregister(type) {
      if (isDisposed()) {
        return err([disposedIssue("registries.nodes.unregister")]);
      }
      const removed = registry.unregister(type);
      return removed.ok
        ? ok(toNodeDefinitionView(removed.value))
        : err([missingNodeDefinition(type, registry)]);
    },
  };
}

/**
 * Wraps the edge registry in its read adapter.
 *
 * Exactly like {@link createNodeDefinitionRegistryView}, grouped by the one
 * classification the domain's `EdgeDefinition` declares: connection types.
 */
export function createEdgeDefinitionRegistryView(
  registry: EdgeRegistry,
  isDisposed: () => boolean,
): EdgeDefinitionRegistryView {
  return {
    all: () => registry.all().map(toEdgeDefinitionView),
    get(type) {
      const found = registry.get(type);
      return found === undefined ? undefined : toEdgeDefinitionView(found);
    },
    has: (type) => registry.has(type),
    require(type) {
      const found = registry.get(type);
      return found === undefined
        ? err([missingEdgeDefinition(type, registry)])
        : ok(toEdgeDefinitionView(found));
    },
    byConnectionType: (connectionType) =>
      registry.byConnectionType(connectionType).map(toEdgeDefinitionView),
    get size() {
      return registry.size;
    },
    unregister(type) {
      if (isDisposed()) {
        return err([disposedIssue("registries.edges.unregister")]);
      }
      const removed = registry.unregister(type);
      return removed.ok
        ? ok(toEdgeDefinitionView(removed.value))
        : err([missingEdgeDefinition(type, registry)]);
    },
  };
}
