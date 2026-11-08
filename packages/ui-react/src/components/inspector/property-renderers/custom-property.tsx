import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { useComponentRenderers } from "../../../providers/ui-provider.js";
import { MUTED_STYLE } from "../styles.js";
import { PropertyField } from "./field.js";

/**
 * `custom` property: a definition-provided component the host registered.
 *
 * A definition only carries the component id (definitions never hold
 * components). When the host registered nothing for it the renderer states the
 * gap instead of throwing: a missing custom widget is a host configuration
 * issue, not a reason to break the whole panel.
 */
export function CustomPropertyRenderer(props: PropertyRendererProps): ReactNode {
  const renderers = useComponentRenderers();
  const componentId = props.definition.component;
  const Component =
    componentId === undefined ? undefined : renderers.properties.tryGet(componentId);

  if (Component === undefined) {
    return (
      <PropertyField definition={props.definition} issues={props.issues}>
        <p style={MUTED_STYLE}>
          {`No renderer for custom property "${props.definition.id}"`}
        </p>
      </PropertyField>
    );
  }

  return <Component {...props} />;
}
