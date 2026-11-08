import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { JsonTextControl } from "./json-text-control.js";

/** `object` property: JSON object edited as text, committed parsed. */
export function ObjectPropertyRenderer(props: PropertyRendererProps): ReactNode {
  return <JsonTextControl {...props} />;
}
