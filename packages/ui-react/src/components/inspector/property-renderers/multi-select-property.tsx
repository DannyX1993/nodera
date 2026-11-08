import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { CHECKBOX_STYLE, OPTION_LIST_STYLE, OPTION_STYLE } from "../styles.js";
import { PropertyField, propertyLabel } from "./field.js";

function selectedValues(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * `multi-select` property: checkbox group over the declared options.
 *
 * The value is always an array of option values, ordered as the user picked
 * them; the effective option set is resolved by the property system before the
 * definition reaches the renderer.
 */
export function MultiSelectPropertyRenderer(props: PropertyRendererProps): ReactNode {
  const options = props.definition.options ?? [];
  const selected = selectedValues(props.value);
  const label = propertyLabel(props.definition);

  return (
    <PropertyField definition={props.definition} issues={props.issues}>
      <div role="group" aria-label={label} style={OPTION_LIST_STYLE}>
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              data-nodera-property-option={option.value}
              style={OPTION_STYLE}
            >
              <input
                type="checkbox"
                value={option.value}
                checked={checked}
                disabled={props.disabled}
                onChange={(event) => {
                  props.onChange(
                    event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((entry) => entry !== option.value),
                  );
                }}
                style={CHECKBOX_STYLE}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </PropertyField>
  );
}
