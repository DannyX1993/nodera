import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { ValueInputControl } from "./value-input-control.js";

/** `date` property: calendar date stored as `YYYY-MM-DD`. */
export function DatePropertyRenderer(props: PropertyRendererProps): ReactNode {
  return <ValueInputControl {...props} inputType="date" />;
}
