import { useId, type ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { CONTROL_STYLE } from "../styles.js";
import { PropertyField, propertyLabel } from "./field.js";

/**
 * `select` property: one option of the declared set.
 *
 * The options come from the definition the panel hands over, which already
 * carries the effective set resolved by `effectiveOptions` from the property
 * system: the renderer never decides which options apply.
 */
export function SelectPropertyRenderer(props: PropertyRendererProps): ReactNode {
  const controlId = useId();
  const options = props.definition.options ?? [];
  const selected = typeof props.value === "string" ? props.value : "";
  const known = options.some((option) => option.value === selected);

  return (
    <PropertyField definition={props.definition} issues={props.issues} htmlFor={controlId}>
      <select
        id={controlId}
        aria-label={propertyLabel(props.definition)}
        value={selected}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
        style={CONTROL_STYLE}
      >
        {known ? null : <option value="">{"—"}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </PropertyField>
  );
}
