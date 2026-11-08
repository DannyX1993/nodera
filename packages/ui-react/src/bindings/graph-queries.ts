import { useMemo } from "react";

import type { EditorEngine } from "@nodera/application";
import type { EdgeDefinition } from "@nodera/edge-registry";
import type { Edge, Node } from "@nodera/graph-model";
import type { NodeDefinition } from "@nodera/node-registry";
import type { PropertyDefinition } from "@nodera/property-system";

/**
 * Read-only queries over the live editor.
 *
 * Queries read the engine at call time instead of snapshotting definitions, so
 * a surface always sees the definitions the host registered now, and the object
 * identity stays stable across renders (no re-subscription churn in panels).
 */
export interface GraphQueries {
  nodeDefinition(id: string): NodeDefinition | undefined;
  edgeDefinition(id: string): EdgeDefinition | undefined;
  nodeDefinitions(): readonly NodeDefinition[];
  edgeDefinitions(): readonly EdgeDefinition[];
  node(id: string): Node | undefined;
  edge(id: string): Edge | undefined;
  /** Property definitions the node definition of `nodeId` declares. */
  propertyDefinitions(nodeId: string): readonly PropertyDefinition[];
}

const NO_PROPERTIES: readonly PropertyDefinition[] = Object.freeze([]);

/** Binds the editor registries and graph to a stable query object. */
export function useGraphQueries(editor: EditorEngine): GraphQueries {
  return useMemo<GraphQueries>(
    () => ({
      nodeDefinition: (id) => editor.domain.nodes.get(id),
      edgeDefinition: (id) => editor.domain.edges.get(id),
      nodeDefinitions: () => editor.domain.nodes.all(),
      edgeDefinitions: () => editor.domain.edges.all(),
      node: (id) => editor.getNode(id),
      edge: (id) => editor.getEdge(id),
      propertyDefinitions: (nodeId) => {
        const node = editor.getNode(nodeId);
        if (node === undefined) {
          return NO_PROPERTIES;
        }
        return editor.domain.nodes.get(node.definitionId)?.properties ?? NO_PROPERTIES;
      },
    }),
    [editor],
  );
}
