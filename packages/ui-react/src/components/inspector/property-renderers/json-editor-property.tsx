import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { JsonTextControl } from "./json-text-control.js";

/**
 * `json-editor` property: the value is the serialized JSON string the core
 * contract defines for this type, so the editor commits the text verbatim.
 *
 * Invalid JSON is reported inline as a local issue: the stored string is
 * syntactically wrong, but it is still the value the user typed and the
 * property type stays a string, never a parsed structure.
 */
export function JsonEditorPropertyRenderer(props: PropertyRendererProps): ReactNode {
  return <JsonTextControl {...props} mode="text" />;
}
