import { memo, type CSSProperties, type ReactNode } from "react";

import { useHistory } from "../../bindings/history.js";
import { useTranslate } from "../../providers/locale-provider.js";
import { useEditorEngine } from "../../providers/ui-provider.js";
import {
  BORDER,
  BUTTON_STYLE,
  MUTED_TEXT_STYLE,
  SURFACE_STYLE,
  TEXT_STYLE,
} from "../shell/styles.js";

/** Props accepted by {@link HistoryPanel}. */
export interface HistoryPanelProps {
  readonly className?: string;
  /**
   * Maximum number of undo/redo steps one entry activation may walk.
   * Defaults to `20`: a click on a distant entry corrects the current position
   * without replaying an unbounded history in one gesture.
   */
  readonly maxEntries?: number;
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

const ACTIONS_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-xs, 2px)",
  flexShrink: 0,
  borderBottom: BORDER,
  paddingBottom: "var(--ndr-spacing-xs, 2px)",
};

const SECTION_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
};

const SECTION_TITLE_STYLE: CSSProperties = {
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

const ENTRY_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  justifyContent: "flex-start",
  width: "100%",
  color: "var(--ndr-colors-text, #111827)",
  textAlign: "start",
};

const CURRENT_ENTRY_STYLE: CSSProperties = {
  ...ENTRY_STYLE,
  boxShadow: "inset 0 0 0 1px var(--ndr-selection-outline-color, #2563eb)",
  background: "var(--ndr-selection-background, #eff6ff)",
};

const EMPTY_STYLE: CSSProperties = {
  margin: 0,
  padding: "var(--ndr-spacing-sm, 4px)",
  ...MUTED_TEXT_STYLE,
};

/**
 * History of the editing session (S2, S8).
 *
 * Labels and the undo/redo cursors come from the history engine through the
 * application binding, so the panel never holds a second copy of the stack. A
 * label is a *target*, not a stored command: activating one asks the documented
 * undo/redo use cases to move the cursor until that unit is the current one.
 *
 * Memoized (S7/D10) on its own props: the panel re-renders from the history
 * subscription it owns, never because an unrelated host layout re-rendered.
 */
function HistoryPanelImpl(props: HistoryPanelProps): ReactNode {
  const editor = useEditorEngine();
  const history = useHistory(editor);
  const t = useTranslate();
  const maxSteps = props.maxEntries ?? 20;

  const labels = history.labels;
  const undoSize = history.undoSize;
  const redoEntries = labels.slice(undoSize);
  const undoEntries = labels.slice(0, undoSize);

  const position = (): number => editor.history.size() - editor.history.redoSize();

  const walkBackTo = (index: number): void => {
    let steps = 0;
    while (editor.history.canUndo() && position() > index + 1 && steps < maxSteps) {
      history.undo();
      steps += 1;
    }
  };

  const walkForwardTo = (index: number): void => {
    let steps = 0;
    while (editor.history.canRedo() && position() < index + 1 && steps < maxSteps) {
      history.redo();
      steps += 1;
    }
  };

  return (
    <div
      data-nodera-history-panel=""
      /*
       * Undo/redo availability changes without a focus change (S8 "ARIA"): the
       * region announces them, so a keyboard user learns that a step became
       * undoable or redoable instead of discovering it by trying. `atomic`
       * reads the updated labels and the new cursor as one statement.
       */
      aria-live="polite"
      aria-atomic="true"
      {...(props.className === undefined ? {} : { className: props.className })}
      style={PANEL_STYLE}
    >
      <div data-nodera-history-actions="" style={ACTIONS_STYLE}>
        <button
          type="button"
          data-nodera-history-action="undo"
          aria-label={t("history.undo")}
          disabled={!history.canUndo}
          onClick={history.undo}
          style={BUTTON_STYLE}
        >
          {t("history.undo")}
        </button>
        <button
          type="button"
          data-nodera-history-action="redo"
          aria-label={t("history.redo")}
          disabled={!history.canRedo}
          onClick={history.redo}
          style={BUTTON_STYLE}
        >
          {t("history.redo")}
        </button>
      </div>
      {labels.length === 0 ? (
        <p data-nodera-history-empty="" style={EMPTY_STYLE}>
          {t("history.empty")}
        </p>
      ) : null}
      {undoEntries.length === 0 ? null : (
        <section
          data-nodera-history-undo-section=""
          style={SECTION_STYLE}
          aria-label={t("history.undoable")}
        >
          <h3 style={SECTION_TITLE_STYLE}>{t("history.undoable")}</h3>
          <ul style={LIST_STYLE}>
            {undoEntries.map((label, index) => {
              const current = index === undoSize - 1;
              return (
                <li key={index}>
                  <button
                    type="button"
                    data-nodera-history-entry={index}
                    data-nodera-history-entry-state="undoable"
                    {...(current ? { "data-nodera-history-current": "true" } : {})}
                    {...(current ? { "aria-current": "true" as const } : {})}
                    onClick={() => {
                      walkBackTo(index);
                    }}
                    style={current ? CURRENT_ENTRY_STYLE : ENTRY_STYLE}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {redoEntries.length === 0 ? null : (
        <section
          data-nodera-history-redo-section=""
          style={SECTION_STYLE}
          aria-label={t("history.redoable")}
        >
          <h3 style={SECTION_TITLE_STYLE}>{t("history.redoable")}</h3>
          <ul style={LIST_STYLE}>
            {redoEntries.map((label, offset) => {
              const index = undoSize + offset;
              return (
                <li key={index}>
                  <button
                    type="button"
                    data-nodera-history-entry={index}
                    data-nodera-history-entry-state="redoable"
                    onClick={() => {
                      walkForwardTo(index);
                    }}
                    style={ENTRY_STYLE}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The memoized editing-history panel. */
export const HistoryPanel = memo(HistoryPanelImpl);
