import { useState, useEffect, useMemo, useCallback } from "react";

import type { EditorEngine } from "@nodera/application";
import type { EditorEventName } from "@nodera/application";

import {
  toReactFlowNodes,
  toReactFlowEdges,
} from "../map/react-flow-mapper.js";

/* ------------------------------------------------------------------ */
/*  useEditorGraph hook                                                */
/* ------------------------------------------------------------------ */

export interface UseEditorGraphResult {
  /** React Flow node entries derived from `editor.graph`. */
  readonly nodes: import("@xyflow/react").Node[];
  /** React Flow edge entries derived from `editor.graph`. */
  readonly edges: import("@xyflow/react").Edge[];
  /** Set of selected node ids (read from engine state). */
  readonly selectedNodeIds: ReadonlySet<string>;
  /** Set of selected edge ids (read from engine state). */
  readonly selectedEdgeIds: ReadonlySet<string>;
  /**
   * Force re-derivation. Needed for engine changes that emit no event —
   * known phase-3 gap: `selectEdge` emits no `edge.selected`.
   */
  readonly refresh: () => void;
}

/**
 * Derive React Flow nodes/edges/selection from an EditorEngine.
 *
 * Subscribes to the editor's event bus so that engine-side mutations
 * (add/remove/move nodes, create/remove edges, selection changes) are
 * reflected in the returned values.
 *
 * @param editor - the editor engine instance owned by the host
 * @returns memoized { nodes, edges, selectedNodeIds, selectedEdgeIds }
 */
export function useEditorGraph(
  editor: EditorEngine,
): UseEditorGraphResult {
  // Trigger re-render on every relevant event.
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Subscribe to events that require re-derivation.
  useEffect(() => {
    const events: EditorEventName[] = [
      "graph.changed",
      "node.created",
      "node.deleted",
      "node.updated",
      "edge.created",
      "edge.deleted",
      "edge.updated",
      "node.selected",
    ];

    const unsubscribers = events.map((name) =>
      editor.events.subscribe(name, () => {
        setTick((t) => t + 1);
      }),
    );

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive the current state from the engine.
  const result = useMemo((): UseEditorGraphResult => {
    const selectedNodeIds = new Set(editor.getSelectedNodes());
    const selectedEdgeIds = new Set(editor.getSelectedEdges());

    const nodes = toReactFlowNodes(editor.graph, (id) =>
      (editor.domain.nodes as any).get(id),
    ).map((node) =>
      selectedNodeIds.has(node.id) ? { ...node, selected: true } : node,
    );

    const edges = toReactFlowEdges(editor.graph, (id) =>
      (editor.domain.edges as any).get(id),
    ).map((edge) =>
      selectedEdgeIds.has(edge.id) ? { ...edge, selected: true } : edge,
    );

    return { nodes, edges, selectedNodeIds, selectedEdgeIds, refresh };
  }, [editor, tick, refresh]);

  return result;
}