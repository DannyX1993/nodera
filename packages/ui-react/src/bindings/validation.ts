import { useCallback, useEffect, useMemo, useState } from "react";

import { validateGraph, type EditorEngine } from "@nodera/application";
import type { ValidationIssue } from "@nodera/contracts";
import type { ValidationReport } from "@nodera/validation";

/**
 * Validation surface state.
 *
 * The report is application data (it comes from the validation pipeline, not
 * from the components), so it is read from the `validation.completed` event
 * instead of being recomputed during render.
 */
export interface ValidationState {
  readonly report: ValidationReport | undefined;
  readonly issues: readonly ValidationIssue[];
  /** Runs the validate-graph use case; the resulting report arrives by event. */
  readonly revalidate: () => void;
}

const NO_ISSUES: readonly ValidationIssue[] = Object.freeze([]);

/** Binds the validation pipeline to a React state snapshot. */
export function useValidation(editor: EditorEngine): ValidationState {
  const [report, setReport] = useState<ValidationReport | undefined>(undefined);

  useEffect(
    () =>
      editor.events.subscribe("validation.completed", (event) => {
        setReport(event.payload.report);
      }),
    [editor],
  );

  const revalidate = useCallback(() => {
    validateGraph(editor);
  }, [editor]);

  return useMemo<ValidationState>(
    () => ({ report, issues: report?.issues ?? NO_ISSUES, revalidate }),
    [report, revalidate],
  );
}
