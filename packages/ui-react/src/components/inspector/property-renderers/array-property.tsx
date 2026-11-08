import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { JsonTextControl } from "./json-text-control.js";

/** `array` property: JSON array edited as text, committed parsed. */
export function ArrayPropertyRenderer(props: PropertyRendererProps): ReactNode {
  return <JsonTextControl {...props} />;
}
