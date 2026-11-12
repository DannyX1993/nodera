import { useState, useEffect, useMemo, useCallback, useRef } from "react";

import type { Edge as RfEdge, Node as RfNode } from "@xyflow/react";
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
  /**
   * React Flow node entries derived from `editor.graph`.
   *
   * Document state only: a node object is rebuilt when (and only when) the
   * graph it was derived from changed. Selection never travels in here — see
   * {@link UseEditorGraphResult.selectedNodeIds}.
   */
  readonly nodes: RfNode[];
  /** React Flow edge entries derived from `editor.graph`. Document state only. */
  readonly edges: RfEdge[];
  /** Set of selected node ids (editor state, read from the engine). */
  readonly selectedNodeIds: ReadonlySet<string>;
  /** Set of selected edge ids (editor state, read from the engine). */
  readonly selectedEdgeIds: ReadonlySet<string>;
  /**
   * Force re-derivation. Needed for engine changes that emit no event —
   * known phase-3 gap: `selectEdge` emits no `edge.selected`.
   */
  readonly refresh: () => void;
}

/**
 * Engine events that change the DOCUMENT, so the React Flow elements have to be
 * derived again (positions, ports, labels, properties, definitions).
 *
 * Selection is deliberately absent: it is editor state (AGENTS.md §5.3), and
 * re-deriving the whole graph for it is exactly the defect this hook fixes.
 */
const GRAPH_EVENTS: readonly EditorEventName[] = [
  "graph.changed",
  "node.created",
  "node.deleted",
  "node.updated",
  "edge.created",
  "edge.deleted",
  "edge.updated",
];

/**
 * Engine events that only change WHICH elements are selected.
 *
 * `node.selected` carries the node that entered the selection; `selection.changed`
 * is emitted by every selection use case (including the ones that only touch
 * edges, and the ones that clear it), so the hook follows both.
 */
const SELECTION_EVENTS: readonly EditorEventName[] = [
  "node.selected",
  "selection.changed",
];

/** Editor selection as two identifier sets. */
interface DerivedSelection {
  readonly nodes: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
}

const EMPTY_SELECTION: DerivedSelection = {
  nodes: new Set<string>(),
  edges: new Set<string>(),
};

/** Content equality for two id sets (Set identity is not enough). */
function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const id of a) {
    if (!b.has(id)) {
      return false;
    }
  }
  return true;
}

/**
 * Derive React Flow nodes/edges/selection from an EditorEngine.
 *
 * Subscribes to the editor's event bus and keeps the two derivations apart:
 *
 * 1. the document derivation (`nodes`, `edges`) is keyed on the graph events
 *    only, so adding, moving or updating an element rebuilds it and nothing
 *    else does;
 * 2. the selection derivation (`selectedNodeIds`, `selectedEdgeIds`) is keyed on
 *    the selection events, and returns the previous value when the selection
 *    content did not change, so a redundant `selection.changed` costs nothing.
 *
 * Because selection is NOT folded into the node/edge objects, selecting a node
 * in a large graph no longer re-creates every React Flow element. The canvas
 * applies the published selection to the elements it renders through
 * {@link applyNodeSelection} / {@link applyEdgeSelection}, which touch only the
 * elements whose selected flag actually changed.
 *
 * @param editor - the editor engine instance owned by the host
 * @returns { nodes, edges, selectedNodeIds, selectedEdgeIds, refresh }
 */
export function useEditorGraph(
  editor: EditorEngine,
): UseEditorGraphResult {
  const [graphTick, setGraphTick] = useState(0);
  const [selectionTick, setSelectionTick] = useState(0);

  const refresh = useCallback(() => {
    setGraphTick((tick) => tick + 1);
    setSelectionTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const unsubscribers = [
      ...GRAPH_EVENTS.map((name) =>
        editor.events.subscribe(name, () => {
          setGraphTick((tick) => tick + 1);
        }),
      ),
      ...SELECTION_EVENTS.map((name) =>
        editor.events.subscribe(name, () => {
          setSelectionTick((tick) => tick + 1);
        }),
      ),
    ];

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [editor]);

  // Document derivation: rebuilt on graph changes, never on selection.
  const nodes = useMemo(
    (): RfNode[] =>
      toReactFlowNodes(editor.graph, (id) => editor.domain.nodes.get(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, graphTick],
  );

  const edges = useMemo(
    (): RfEdge[] =>
      toReactFlowEdges(editor.graph, (id) => editor.domain.edges.get(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, graphTick],
  );

  // Selection derivation: content-stable, so an event that announces the
  // selection it already had returns the previous object and re-renders nothing.
  const lastSelection = useRef<DerivedSelection>(EMPTY_SELECTION);
  const selection = useMemo((): DerivedSelection => {
    const selectedNodes = new Set<string>(editor.getSelectedNodes());
    const selectedEdges = new Set<string>(editor.getSelectedEdges());
    const previous = lastSelection.current;
    if (
      sameIds(previous.nodes, selectedNodes) &&
      sameIds(previous.edges, selectedEdges)
    ) {
      return previous;
    }
    const next: DerivedSelection = { nodes: selectedNodes, edges: selectedEdges };
    lastSelection.current = next;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, selectionTick]);

  return useMemo(
    (): UseEditorGraphResult => ({
      nodes,
      edges,
      selectedNodeIds: selection.nodes,
      selectedEdgeIds: selection.edges,
      refresh,
    }),
    [nodes, edges, selection, refresh],
  );
}

/* ------------------------------------------------------------------ */
/*  Selection application                                              */
/* ------------------------------------------------------------------ */

/**
 * Applies an engine node selection to the React Flow nodes.
 *
 * Returns the SAME array when every node already carries the right flag, and
 * otherwise only re-creates the nodes whose flag changed: an untouched node keeps
 * its object identity, so React Flow's own `setNodes` equality check keeps the
 * internal node it measured, and a memoized renderer bails out.
 *
 * @param nodes - the derived document nodes
 * @param selectedNodeIds - the selection published by {@link useEditorGraph}
 * @returns the nodes with `selected` matching the selection
 */
export function applyNodeSelection(
  nodes: RfNode[],
  selectedNodeIds: ReadonlySet<string>,
): RfNode[] {
  let changed = false;
  const next = nodes.map((node) => {
    const selected = selectedNodeIds.has(node.id);
    if ((node.selected === true) === selected) {
      return node;
    }
    changed = true;
    return { ...node, selected };
  });
  return changed ? next : nodes;
}

/**
 * Applies an engine edge selection to the React Flow edges.
 *
 * Same contract as {@link applyNodeSelection}: identity-preserving unless an edge
 * flag actually changed.
 *
 * @param edges - the derived document edges
 * @param selectedEdgeIds - the selection published by {@link useEditorGraph}
 * @returns the edges with `selected` matching the selection
 */
export function applyEdgeSelection(
  edges: RfEdge[],
  selectedEdgeIds: ReadonlySet<string>,
): RfEdge[] {
  let changed = false;
  const next = edges.map((edge) => {
    const selected = selectedEdgeIds.has(edge.id);
    if ((edge.selected === true) === selected) {
      return edge;
    }
    changed = true;
    return { ...edge, selected };
  });
  return changed ? next : edges;
}
