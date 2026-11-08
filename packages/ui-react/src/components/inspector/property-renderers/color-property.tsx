import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { ValueInputControl } from "./value-input-control.js";

/** `color` property: color picker over a `#rrggbb` value. */
export function ColorPropertyRenderer(props: PropertyRendererProps): ReactNode {
  return <ValueInputControl {...props} inputType="color" />;
}
