import { useId, type ReactNode } from "react";

import type { PropertyDefinition } from "@nodera/property-system";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { CONTROL_STYLE } from "../styles.js";
import { PropertyField, propertyLabel } from "./field.js";

/** Declared bound of a numeric property, when the definition declares one. */
function numberBound(
  definition: PropertyDefinition,
  kind: "min" | "max",
): number | undefined {
  for (const validation of definition.validations ?? []) {
    if (validation.kind === kind) {
      return validation.value;
    }
  }
  return undefined;
}

/**
 * `number` property: numeric input.
 *
 * The declared `min`/`max` validations become the native input bounds so the
 * widget and the property system agree on the accepted range; whether a value
 * is valid stays `validatePropertyValue`'s decision.
 */
export function NumberPropertyRenderer(props: PropertyRendererProps): ReactNode {
  const controlId = useId();
  const value = typeof props.value === "number" ? String(props.value) : "";
  const min = numberBound(props.definition, "min");
  const max = numberBound(props.definition, "max");

  return (
    <PropertyField definition={props.definition} issues={props.issues} htmlFor={controlId}>
      <input
        id={controlId}
        type="number"
        aria-label={propertyLabel(props.definition)}
        value={value}
        min={min}
        max={max}
        disabled={props.disabled}
        onChange={(event) => {
          const text = event.target.value;
          if (text.trim() === "") {
            props.onChange(undefined);
            return;
          }
          const parsed = Number(text);
          if (Number.isNaN(parsed)) {
            return;
          }
          props.onChange(parsed);
        }}
        style={CONTROL_STYLE}
      />
    </PropertyField>
  );
}
