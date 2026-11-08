import { useId, type ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { CONTROL_STYLE, MONOSPACE_CONTROL_STYLE } from "../styles.js";
import { PropertyField, propertyLabel, textValue } from "./field.js";

/** Props of the shared multi-line text control. */
export interface TextAreaControlProps extends PropertyRendererProps {
  /** Whether the text is source code, YAML or JSON (monospace, no wrapping). */
  readonly monospace: boolean;
}

/**
 * Multi-line text editor shared by `textarea`, `code-editor` and `yaml-editor`.
 *
 * These types store text: the control passes the raw string through and leaves
 * interpretation (YAML parsing, code semantics) to the host or a replacement
 * renderer.
 */
export function TextAreaControl(props: TextAreaControlProps): ReactNode {
  const controlId = useId();
  return (
    <PropertyField definition={props.definition} issues={props.issues} htmlFor={controlId}>
      <textarea
        id={controlId}
        aria-label={propertyLabel(props.definition)}
        value={textValue(props.value)}
        disabled={props.disabled}
        spellCheck={false}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        style={props.monospace ? MONOSPACE_CONTROL_STYLE : CONTROL_STYLE}
      />
    </PropertyField>
  );
}
