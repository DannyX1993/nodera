import { useId, type ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { CHECKBOX_STYLE } from "../styles.js";
import { PropertyField, propertyLabel } from "./field.js";

/** `boolean` property: checkbox. */
export function BooleanPropertyRenderer(props: PropertyRendererProps): ReactNode {
  const controlId = useId();
  return (
    <PropertyField definition={props.definition} issues={props.issues} htmlFor={controlId}>
      <input
        id={controlId}
        type="checkbox"
        aria-label={propertyLabel(props.definition)}
        checked={props.value === true}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.target.checked);
        }}
        style={CHECKBOX_STYLE}
      />
    </PropertyField>
  );
}
