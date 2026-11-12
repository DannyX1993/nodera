import { useEffect, type CSSProperties, type ReactNode } from "react";

import {
  VALIDATION_SEVERITIES,
  type ValidationIssue,
  type ValidationSeverity,
} from "@nodera/contracts";

import { useEditorCommands } from "../../bindings/editor-commands.js";
import { useValidation } from "../../bindings/validation.js";
import { useTranslate } from "../../providers/locale-provider.js";
import { useEditorEngine } from "../../providers/ui-provider.js";
import {
  BORDER,
  BUTTON_STYLE,
  MUTED_TEXT_STYLE,
  SURFACE_STYLE,
  TEXT_STYLE,
} from "../shell/styles.js";

/** Props accepted by {@link ValidationPanel}. */
export interface ValidationPanelProps {
  readonly className?: string;
  /**
   * Whether the panel validates on mount and on every `graph.changed` event.
   * Defaults to `false`: validation is an application action, and a panel never
   * runs it behind the host's back.
   */
  readonly autoValidate?: boolean;
  /** Host handler for an element activation. Defaults to the selection commands. */
  readonly onSelectElement?: (elementId: string) => void;
  /** Message shown when the report has no issues. Defaults to the catalog's `validation.empty`. */
  readonly emptyMessage?: string;
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

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-sm, 4px)",
  flexShrink: 0,
  borderBottom: BORDER,
  paddingBottom: "var(--ndr-spacing-xs, 2px)",
};

const COUNT_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-xs, 2px)",
  padding: "0 var(--ndr-spacing-sm, 4px)",
  border: BORDER,
  borderRadius: "var(--ndr-borders-radius-sm, 3px)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
};

const COUNT_TONES: Readonly<Record<ValidationSeverity, CSSProperties>> = Object.freeze({
  error: { color: "var(--ndr-colors-danger, #dc2626)" },
  warning: { color: "var(--ndr-colors-warning, #d97706)" },
  info: { color: "var(--ndr-colors-info, #0284c7)" },
});

const SPACER_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const STATUS_STYLE: CSSProperties = {
  margin: 0,
  padding: "var(--ndr-spacing-sm, 4px)",
  ...MUTED_TEXT_STYLE,
};

const GROUP_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
};

const GROUP_TITLE_STYLE: CSSProperties = {
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

const ISSUE_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "var(--ndr-spacing-sm, 4px)",
  padding: "var(--ndr-spacing-xs, 2px)",
  border: BORDER,
  borderRadius: "var(--ndr-borders-radius-sm, 3px)",
};

const CODE_STYLE: CSSProperties = {
  fontFamily: "var(--ndr-typography-font-family-mono, ui-monospace)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  color: "var(--ndr-colors-text-muted, #5b6472)",
  whiteSpace: "nowrap",
};

const MESSAGE_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const ELEMENT_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  fontFamily: "var(--ndr-typography-font-family-mono, ui-monospace)",
};

const SEVERITY_KEYS: Readonly<Record<ValidationSeverity, string>> = Object.freeze({
  error: "validation.severity.error",
  warning: "validation.severity.warning",
  info: "validation.severity.info",
});

/**
 * Validation report of the live graph (S2, S8).
 *
 * The panel renders application data: the report comes from the validated
 * pipeline through the `validation.completed` event, never from rules
 * re-implemented here. Selecting an issue's element goes through the documented
 * selection commands, so the canvas and the panel agree on the selection.
 */
export function ValidationPanel(props: ValidationPanelProps): ReactNode {
  const editor = useEditorEngine();
  const { report, issues, revalidate } = useValidation(editor);
  const executeCommand = useEditorCommands(editor);
  const t = useTranslate();
  const autoValidate = props.autoValidate === true;

  useEffect(() => {
    if (!autoValidate) {
      return;
    }
    revalidate();
    return editor.events.subscribe("graph.changed", () => {
      revalidate();
    });
  }, [autoValidate, editor, revalidate]);

  const grouped = groupIssues(issues);

  const selectElement = (elementId: string): void => {
    if (props.onSelectElement !== undefined) {
      props.onSelectElement(elementId);
      return;
    }
    if (editor.getNode(elementId) !== undefined) {
      executeCommand({ kind: "select-node", nodeId: elementId });
      return;
    }
    if (editor.getEdge(elementId) !== undefined) {
      executeCommand({ kind: "select-edge", edgeId: elementId });
    }
  };

  return (
    <div
      data-nodera-validation-panel=""
      /*
       * The report is announced, not only painted (S8 "ARIA"): validating is an
       * action whose result a keyboard or screen-reader user must learn about
       * without hunting for the panel. `polite` keeps the announcement behind
       * the action that caused it, and `atomic` reads counts plus issues as one
       * statement instead of a stream of fragments.
       */
      aria-live="polite"
      aria-atomic="true"
      {...(props.className === undefined ? {} : { className: props.className })}
      style={PANEL_STYLE}
    >
      <header data-nodera-validation-header="" style={HEADER_STYLE}>
        {VALIDATION_SEVERITIES.map((severity) => (
          <span
            key={severity}
            data-nodera-validation-count={severity}
            aria-label={t("validation.count", { count: grouped[severity].length, severity })}
            style={{ ...COUNT_STYLE, ...COUNT_TONES[severity] }}
          >
            {grouped[severity].length}
          </span>
        ))}
        <span style={SPACER_STYLE} />
        <button
          type="button"
          data-nodera-validation-action="validate"
          aria-label={t("validation.validate")}
          onClick={revalidate}
          style={BUTTON_STYLE}
        >
          {t("validation.action")}
        </button>
      </header>
      {report === undefined ? (
        <p data-nodera-validation-status="" style={STATUS_STYLE}>
          {t("validation.pending")}
        </p>
      ) : issues.length === 0 ? (
        <p data-nodera-validation-empty="" style={STATUS_STYLE}>
          {props.emptyMessage ?? t("validation.empty")}
        </p>
      ) : (
        VALIDATION_SEVERITIES.filter((severity) => grouped[severity].length > 0).map((severity) => (
          <section
            key={severity}
            data-nodera-validation-group={severity}
            style={GROUP_STYLE}
            aria-label={t(SEVERITY_KEYS[severity])}
          >
            <h3 style={GROUP_TITLE_STYLE}>{t(SEVERITY_KEYS[severity])}</h3>
            <ul style={LIST_STYLE}>
              {grouped[severity].map((issue, index) => (
                <IssueRow
                  key={`${issue.code}:${index}`}
                  issue={issue}
                  onSelectElement={selectElement}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

interface IssueRowProps {
  readonly issue: ValidationIssue;
  readonly onSelectElement: (elementId: string) => void;
}

/**
 * One issue: its severity, its code and its message, plus the element it points
 * at. The row is focusable so keyboard users can traverse the report even for
 * issues that reference nothing selectable.
 */
function IssueRow(props: IssueRowProps): ReactNode {
  const t = useTranslate();
  const elementId = props.issue.elementId;
  return (
    <li
      data-nodera-validation-issue=""
      data-nodera-validation-severity={props.issue.severity}
      tabIndex={0}
      style={ISSUE_STYLE}
    >
      <span data-nodera-validation-code="" style={CODE_STYLE}>
        {props.issue.code}
      </span>
      <span data-nodera-validation-message="" style={MESSAGE_STYLE}>
        {props.issue.message}
      </span>
      {elementId === undefined ? null : (
        <button
          type="button"
          data-nodera-validation-element={elementId}
          aria-label={t("validation.selectElement", { elementId })}
          onClick={() => {
            props.onSelectElement(elementId);
          }}
          style={ELEMENT_STYLE}
        >
          {elementId}
        </button>
      )}
    </li>
  );
}

/** Buckets the issues of a report per severity, keeping report order. */
function groupIssues(
  issues: readonly ValidationIssue[],
): Readonly<Record<ValidationSeverity, readonly ValidationIssue[]>> {
  const grouped: Record<ValidationSeverity, ValidationIssue[]> = {
    error: [],
    warning: [],
    info: [],
  };
  for (const issue of issues) {
    grouped[issue.severity].push(issue);
  }
  return grouped;
}
