import { useId, useState, type ReactNode } from "react";

import type { ValidationIssue } from "@nodera/contracts";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { PropertyField, localIssue, propertyLabel } from "./field.js";
import { formatJsonText, jsonEquals, parseJsonText } from "./json-text.js";
import { MONOSPACE_CONTROL_STYLE } from "../styles.js";

/** How the editor commits the text it holds. */
export type JsonTextCommitMode = "parsed" | "text";

/** Editor state of one JSON text control. */
interface JsonTextState {
  /** Text the user sees. */
  readonly text: string;
  /** Value the text was derived from, to detect external updates. */
  readonly source: unknown;
  /** Current syntax message, when the text does not parse. */
  readonly message: string | undefined;
}

function initialState(value: unknown): JsonTextState {
  return { text: formatJsonText(value), source: value, message: undefined };
}

/**
 * Controlled text control that stores a structured value.
 *
 * The editor keeps its own text so an invalid draft is never lost: a parse
 * failure stays in the textarea and is reported inline, while a successful
 * parse calls `onChange` with the parsed value. When the stored value changes
 * from outside (undo, another surface), the text follows it unless it already
 * represents that value, which keeps typing from being reformatted.
 */
export interface JsonTextControlProps extends PropertyRendererProps {
  /**
   * `parsed` (object/array properties) commits the parsed structure and never
   * commits invalid text; `text` (the `json-editor` type, whose value is the
   * serialized string the core contract defines) always commits the raw text
   * and reports invalid JSON inline.
   */
  readonly mode?: JsonTextCommitMode;
}

export function JsonTextControl({
  mode = "parsed",
  ...props
}: JsonTextControlProps): ReactNode {
  const controlId = useId();
  const [state, setState] = useState<JsonTextState>(() => initialState(props.value));

  if (state.source !== props.value) {
    const parsed = parseJsonText(state.text);
    // `text` mode stores the raw string, so follow external updates by text
    // identity instead of by structure; `parsed` mode compares structures.
    const representsValue =
      mode === "text"
        ? state.text === (typeof props.value === "string" ? props.value : formatJsonText(props.value))
        : parsed.ok && jsonEquals(parsed.value, props.value);
    setState(
      representsValue
        ? { ...state, source: props.value }
        : initialState(props.value),
    );
  }

  const issues: readonly ValidationIssue[] =
    state.message === undefined
      ? []
      : [localIssue("property.invalid-json", state.message)];

  const handleText = (text: string): void => {
    const parsed = parseJsonText(text);
    if (mode === "text") {
      if (!parsed.ok) {
        setState({ text, source: state.source, message: parsed.message });
        return;
      }
      setState({ text, source: state.source, message: undefined });
      props.onChange(text);
      return;
    }
    if (!parsed.ok) {
      setState({ text, source: state.source, message: parsed.message });
      return;
    }
    setState({ text, source: state.source, message: undefined });
    props.onChange(parsed.value);
  };

  return (
    <PropertyField
      definition={props.definition}
      issues={props.issues}
      localIssues={issues}
      htmlFor={controlId}
    >
      <textarea
        id={controlId}
        aria-label={propertyLabel(props.definition)}
        value={state.text}
        disabled={props.disabled}
        spellCheck={false}
        onChange={(event) => {
          handleText(event.target.value);
        }}
        style={MONOSPACE_CONTROL_STYLE}
      />
    </PropertyField>
  );
}
