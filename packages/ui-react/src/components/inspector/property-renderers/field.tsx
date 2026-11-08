import type { ReactNode } from "react";

import type { ValidationIssue } from "@nodera/contracts";
import type { PropertyDefinition } from "@nodera/property-system";

import { FIELD_STYLE, HINT_STYLE, ISSUE_STYLE, LABEL_STYLE } from "../styles.js";

/**
 * Accessible name of a property control.
 *
 * The definition label is a presentation hint; when a definition declares none
 * the stable property id is the name, so a control is never unlabelled.
 */
export function propertyLabel(definition: PropertyDefinition): string {
  return definition.label ?? definition.id;
}

/** Text a text-like control shows for an arbitrary stored value. */
export function textValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

/** Props shared by every built-in property renderer. */
export interface PropertyFieldProps {
  readonly definition: PropertyDefinition;
  /** Issues resolved by the property system for the current value. */
  readonly issues: readonly ValidationIssue[];
  /** Renderer-local issues, e.g. a JSON text that does not parse. */
  readonly localIssues?: readonly ValidationIssue[] | undefined;
  /** Id of the control the label points at, when the field has one control. */
  readonly htmlFor?: string | undefined;
  readonly children: ReactNode;
}

/**
 * Common frame of a property renderer.
 *
 * It owns the observable contract every type shares: the stable
 * `data-nodera-property` wrapper, the label and the inline diagnostics. The
 * diagnostics themselves always come from the property system (or from the
 * renderer's own parsing), never from the panel (D11).
 */
export function PropertyField(props: PropertyFieldProps): ReactNode {
  const label = propertyLabel(props.definition);
  const issues = [
    ...props.issues,
    ...(props.localIssues ?? []),
  ];
  return (
    <div
      data-nodera-property={props.definition.id}
      data-nodera-property-type={props.definition.type}
      style={FIELD_STYLE}
    >
      <label htmlFor={props.htmlFor} style={LABEL_STYLE}>
        {label}
      </label>
      {props.definition.description === undefined ? null : (
        <p style={HINT_STYLE}>{props.definition.description}</p>
      )}
      {props.children}
      {issues.map((issue, index) => (
        <p
          key={`${issue.code}:${String(index)}`}
          data-nodera-property-issue={issue.code}
          data-nodera-property-issue-severity={issue.severity}
          aria-label={label}
          style={ISSUE_STYLE}
        >
          {issue.message}
        </p>
      ))}
    </div>
  );
}

/** Builds one renderer-local diagnostic for inline display. */
export function localIssue(code: string, message: string): ValidationIssue {
  return { code, severity: "error", message };
}
