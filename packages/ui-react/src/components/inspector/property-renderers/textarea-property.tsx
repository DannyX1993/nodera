import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { TextAreaControl } from "./text-area-control.js";

/** `textarea` property: multi-line plain text. */
export function TextareaPropertyRenderer(props: PropertyRendererProps): ReactNode {
  return <TextAreaControl {...props} monospace={false} />;
}
