import { useId, type ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { CONTROL_STYLE } from "../styles.js";
import { PropertyField, propertyLabel, textValue } from "./field.js";

/** `string` property: single line text. */
export function StringPropertyRenderer(props: PropertyRendererProps): ReactNode {
  const controlId = useId();
  return (
    <PropertyField definition={props.definition} issues={props.issues} htmlFor={controlId}>
      <input
        id={controlId}
        type="text"
        aria-label={propertyLabel(props.definition)}
        value={textValue(props.value)}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        style={CONTROL_STYLE}
      />
    </PropertyField>
  );
}
