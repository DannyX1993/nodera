import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { TextAreaControl } from "./text-area-control.js";

/**
 * `code-editor` property: raw source text in a monospace editor.
 *
 * Nodera never evaluates the text (AGENTS.md §9: no `eval`, no expression
 * execution); it is edited and stored as data.
 */
export function CodeEditorPropertyRenderer(props: PropertyRendererProps): ReactNode {
  return <TextAreaControl {...props} monospace />;
}
