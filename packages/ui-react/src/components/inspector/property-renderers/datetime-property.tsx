import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { ValueInputControl } from "./value-input-control.js";

/** `datetime` property: local date and time stored as an ISO-like text. */
export function DatetimePropertyRenderer(props: PropertyRendererProps): ReactNode {
  return <ValueInputControl {...props} inputType="datetime-local" />;
}
