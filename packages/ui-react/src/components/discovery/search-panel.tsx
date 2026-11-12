import { memo, type CSSProperties, type ReactNode } from "react";

import type { ElementMatch } from "./search.js";

import { useEditorCommands } from "../../bindings/editor-commands.js";
import { useUiStateActions } from "../../bindings/ui-state-actions.js";
import { useTranslate } from "../../providers/locale-provider.js";
import { useEditorEngine, useUiState } from "../../providers/ui-provider.js";
import {
  BUTTON_STYLE,
  MUTED_TEXT_STYLE,
  SURFACE_STYLE,
  TEXT_STYLE,
} from "../shell/styles.js";
import { DEFAULT_SEARCH_LIMIT, searchGraph } from "./search.js";

/** Props accepted by {@link SearchPanel}. */
export interface SearchPanelProps {
  readonly className?: string;
  /** Placeholder of the search input. Defaults to the catalog's `search.placeholder`. */
  readonly placeholder?: string;
}

const PANEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-sm, 4px)",
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
  padding: "var(--ndr-spacing-sm, 4px)",
  ...SURFACE_STYLE,
  ...TEXT_STYLE,
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-xs, 2px)",
};

const INPUT_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  justifyContent: "flex-start",
  flex: 1,
  minWidth: 0,
  cursor: "text",
  color: "var(--ndr-colors-text, #111827)",
};

const CLEAR_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  flexShrink: 0,
};

const LIST_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const RESULT_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  justifyContent: "flex-start",
  width: "100%",
  gap: "var(--ndr-spacing-sm, 4px)",
  color: "var(--ndr-colors-text, #111827)",
  textAlign: "start",
};

const KIND_STYLE: CSSProperties = {
  ...MUTED_TEXT_STYLE,
  textTransform: "uppercase",
};

const STATUS_STYLE: CSSProperties = {
  margin: 0,
  padding: "0 var(--ndr-spacing-xs, 2px)",
  ...MUTED_TEXT_STYLE,
};

/**
 * Search surface over the whole graph.
 *
 * The query lives in the shared UI store (never in local state and never in the
 * document, S5), so a navigator and a search panel narrow together and the host
 * can drive both from its own command palette. Activating a result runs the
 * documented selection command, so nothing here bypasses the application layer.
 *
 * Memoized (S7/D10) on its own props: the panel re-renders from the shared UI
 * store it subscribes to, never because an unrelated host layout re-rendered.
 */
function SearchPanelImpl(props: SearchPanelProps): ReactNode {
  const editor = useEditorEngine();
  const executeCommand = useEditorCommands(editor);
  const state = useUiState();
  const actions = useUiStateActions();
  const t = useTranslate();

  const query = state.searchQuery;
  const hasQuery = query.trim().length > 0;
  const result = searchGraph(editor, query);
  const entries: readonly ElementMatch[] = hasQuery
    ? [...result.nodes, ...result.edges]
    : [];

  const activate = (match: ElementMatch): void => {
    if (match.kind === "node") {
      executeCommand({ kind: "select-node", nodeId: match.id });
      return;
    }
    executeCommand({ kind: "select-edge", edgeId: match.id });
  };

  return (
    <div
      data-nodera-search-panel=""
      {...(props.className === undefined ? {} : { className: props.className })}
      style={PANEL_STYLE}
    >
      <div style={ROW_STYLE}>
        <input
          type="search"
          aria-label={t("search.placeholder")}
          placeholder={props.placeholder ?? t("search.placeholder")}
          value={query}
          onChange={(event) => {
            actions.setSearchQuery(event.target.value);
          }}
          style={INPUT_STYLE}
        />
        {hasQuery ? (
          <button
            type="button"
            data-nodera-search-clear=""
            aria-label={t("search.clear")}
            onClick={() => {
              actions.setSearchQuery("");
            }}
            style={CLEAR_STYLE}
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
      {hasQuery ? null : (
        <p data-nodera-search-hint="" style={STATUS_STYLE}>
          {t("search.hint")}
        </p>
      )}
      {hasQuery && entries.length === 0 ? (
        <p data-nodera-search-empty="" style={STATUS_STYLE}>
          {t("search.empty")}
        </p>
      ) : null}
      {hasQuery && result.truncated ? (
        <p data-nodera-search-truncated="" style={STATUS_STYLE}>
          {t("search.truncated", { limit: DEFAULT_SEARCH_LIMIT })}
        </p>
      ) : null}
      {entries.length === 0 ? null : (
        <ul data-nodera-search-results="" style={LIST_STYLE}>
          {entries.map((match) => (
            <li key={`${match.kind}:${match.id}`}>
              <button
                type="button"
                data-nodera-search-result={match.id}
                data-nodera-search-result-kind={match.kind}
                onClick={() => {
                  activate(match);
                }}
                style={RESULT_STYLE}
              >
                <span>{match.label}</span>
                <span style={KIND_STYLE}>{match.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The memoized graph search panel. */
export const SearchPanel = memo(SearchPanelImpl);
