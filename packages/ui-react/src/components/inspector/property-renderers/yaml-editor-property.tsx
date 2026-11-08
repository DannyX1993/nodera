import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { TextAreaControl } from "./text-area-control.js";

/**
 * `yaml-editor` property: raw YAML text in a monospace editor.
 *
 * Serialization is an infrastructure concern; the renderer neither parses nor
 * rewrites the text, so a host can round-trip exactly what the user typed.
 */
export function YamlEditorPropertyRenderer(props: PropertyRendererProps): ReactNode {
  return <TextAreaControl {...props} monospace />;
}
