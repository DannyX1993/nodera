import type { ReactNode } from "react";

import type { PropertyRendererProps } from "../../../registries/component-registry.js";
import { ValueInputControl } from "./value-input-control.js";

/**
 * `file-reference` property: stable reference to a file (path, URL or asset id).
 *
 * The value is always a reference string, never a `File` object: the portable
 * document stores references, and loading or uploading files is a host
 * integration the framework never performs on its own (AGENTS.md §6, §16).
 */
export function FileReferencePropertyRenderer(props: PropertyRendererProps): ReactNode {
  return <ValueInputControl {...props} inputType="text" monospace />;
}
