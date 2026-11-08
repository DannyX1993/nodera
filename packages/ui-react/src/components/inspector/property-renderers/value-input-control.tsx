import { useId, type ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { CONTROL_STYLE, MONOSPACE_CONTROL_STYLE } from "../styles.js";
import { PropertyField, propertyLabel, textValue } from "./field.js";

/** Input types a scalar property renders without extra behaviour. */
export type ValueInputType = "date" | "datetime-local" | "color" | "text";

/** Props of the shared single-value input control. */
export interface ValueInputControlProps extends PropertyRendererProps {
  readonly inputType: ValueInputType;
  /** Whether the stored value is an opaque identifier worth monospace text. */
  readonly monospace?: boolean;
}

/**
 * Single-value native input shared by the scalar property types.
 *
 * The browser input does the formatting and the keyboard interaction; the
 * control only translates the stored value to text and back, so no property
 * rule is reimplemented here.
 */
export function ValueInputControl(props: ValueInputControlProps): ReactNode {
  const controlId = useId();
  return (
    <PropertyField definition={props.definition} issues={props.issues} htmlFor={controlId}>
      <input
        id={controlId}
        type={props.inputType}
        aria-label={propertyLabel(props.definition)}
        value={textValue(props.value)}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        style={props.monospace === true ? MONOSPACE_CONTROL_STYLE : CONTROL_STYLE}
      />
    </PropertyField>
  );
}
