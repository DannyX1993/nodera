import type { CSSProperties, ReactNode } from "react";

import { useEditorCommands } from "../../bindings/editor-commands.js";
import { useEditorSnapshot } from "../../bindings/editor-snapshot.js";
import { useEditorEngine, useUiState } from "../../providers/ui-provider.js";
import {
  BUTTON_STYLE,
  MUTED_TEXT_STYLE,
  SURFACE_STYLE,
  TEXT_STYLE,
} from "../shell/styles.js";
import { searchGraph } from "./search.js";

/** Props accepted by {@link Navigator}. */
export interface NavigatorProps {
  readonly className?: string;
  /** Whether the edge list is shown. Defaults to `true`. */
  readonly showEdges?: boolean;
  /** Host handler for a node activation. Defaults to the `select-node` command. */
  readonly onSelectNode?: (nodeId: string) => void;
  /** Host handler for an edge activation. Defaults to the `select-edge` command. */
  readonly onSelectEdge?: (edgeId: string) => void;
}

/**
 * The navigator lists everything, so it is not a paginated search surface:
 * truncation belongs to `SearchPanel` (S2, D6 keep canvas state out of it).
 */
const NAVIGATOR_SEARCH_LIMIT = Number.POSITIVE_INFINITY;

const SELECTED_CLASS = "nodera-navigator-selected";

const NAVIGATOR_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
  padding: "var(--ndr-spacing-sm, 4px)",
  gap: "var(--ndr-spacing-sm, 4px)",
  ...SURFACE_STYLE,
  ...TEXT_STYLE,
};

const GROUP_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
};

const HEADING_STYLE: CSSProperties = {
  margin: 0,
  padding: "0 var(--ndr-spacing-xs, 2px)",
  ...MUTED_TEXT_STYLE,
  textTransform: "uppercase",
  fontWeight: "var(--ndr-typography-font-weight-bold, 600)",
};

const LIST_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const ITEM_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  justifyContent: "flex-start",
  width: "100%",
  gap: "var(--ndr-spacing-sm, 4px)",
  color: "var(--ndr-colors-text, #111827)",
  textAlign: "start",
};

const ITEM_SELECTED_STYLE: CSSProperties = {
  ...ITEM_STYLE,
  boxShadow: "inset 0 0 0 1px var(--ndr-selection-outline-color, #2563eb)",
  background: "var(--ndr-selection-background, #eff6ff)",
};

const DEFINITION_STYLE: CSSProperties = {
  ...MUTED_TEXT_STYLE,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const EMPTY_STYLE: CSSProperties = {
  margin: 0,
  padding: "var(--ndr-spacing-sm, 4px)",
  ...MUTED_TEXT_STYLE,
};

interface NodeEntry {
  readonly id: string;
  readonly label: string;
  readonly definitionName: string | undefined;
}

interface EdgeEntry {
  readonly id: string;
  readonly label: string;
}

/**
 * Textual overview of the graph: one entry per node and, optionally, per edge.
 *
 * It narrows with the shared UI search query and mirrors the editor selection,
 * so it is a navigation surface, not a second source of truth: activating an
 * entry goes through the same `select-node`/`select-edge` commands the canvas
 * uses, unless the host takes over with its own callback.
 */
export function Navigator(props: NavigatorProps): ReactNode {
  const editor = useEditorEngine();
  const executeCommand = useEditorCommands(editor);
  const state = useUiState();
  const snapshot = useEditorSnapshot(editor);

  const showEdges = props.showEdges !== false;
  const matches = searchGraph(editor, state.searchQuery, {
    limit: NAVIGATOR_SEARCH_LIMIT,
  });

  const nodes: readonly NodeEntry[] = matches.nodes.map((match) => {
    const node = editor.getNode(match.id);
    return {
      id: match.id,
      label: match.label,
      definitionName:
        node === undefined
          ? undefined
          : editor.domain.nodes.get(node.definitionId)?.name,
    };
  });
  const edges: readonly EdgeEntry[] = showEdges ? matches.edges : [];
  const isEmpty = nodes.length === 0 && edges.length === 0;

  const activateNode = (nodeId: string): void => {
    if (props.onSelectNode !== undefined) {
      props.onSelectNode(nodeId);
      return;
    }
    executeCommand({ kind: "select-node", nodeId });
  };

  const activateEdge = (edgeId: string): void => {
    if (props.onSelectEdge !== undefined) {
      props.onSelectEdge(edgeId);
      return;
    }
    executeCommand({ kind: "select-edge", edgeId });
  };

  return (
    <div
      data-nodera-navigator=""
      {...(props.className === undefined ? {} : { className: props.className })}
      style={NAVIGATOR_STYLE}
    >
      {isEmpty ? (
        <p data-nodera-navigator-empty="" style={EMPTY_STYLE}>
          {state.searchQuery.trim().length === 0 ? "No nodes" : "No matching elements"}
        </p>
      ) : null}
      {nodes.length === 0 ? null : (
        <div data-nodera-navigator-nodes="" style={GROUP_STYLE}>
          <h3 data-nodera-navigator-nodes-title="" style={HEADING_STYLE}>
            Nodes
          </h3>
          <ul style={LIST_STYLE}>
            {nodes.map((entry) => {
              const selected = snapshot.selectedNodes.includes(entry.id);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    data-nodera-navigator-node={entry.id}
                    {...(selected ? { "aria-current": "true" as const } : {})}
                    className={selected ? SELECTED_CLASS : undefined}
                    onClick={() => {
                      activateNode(entry.id);
                    }}
                    style={selected ? ITEM_SELECTED_STYLE : ITEM_STYLE}
                  >
                    <span data-nodera-navigator-node-label="">{entry.label}</span>
                    {entry.definitionName === undefined ? null : (
                      <span
                        data-nodera-navigator-node-definition=""
                        style={DEFINITION_STYLE}
                      >
                        {entry.definitionName}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {edges.length === 0 ? null : (
        <div data-nodera-navigator-edges="" style={GROUP_STYLE}>
          <h3 data-nodera-navigator-edges-title="" style={HEADING_STYLE}>
            Edges
          </h3>
          <ul style={LIST_STYLE}>
            {edges.map((entry) => {
              const selected = snapshot.selectedEdges.includes(entry.id);
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    data-nodera-navigator-edge={entry.id}
                    {...(selected ? { "aria-current": "true" as const } : {})}
                    className={selected ? SELECTED_CLASS : undefined}
                    onClick={() => {
                      activateEdge(entry.id);
                    }}
                    style={selected ? ITEM_SELECTED_STYLE : ITEM_STYLE}
                  >
                    <span data-nodera-navigator-edge-label="">{entry.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
