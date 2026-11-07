import type { FC } from "react";
import type { EditorEngine } from "@nodera/application";
import type { NodeRendererRegistry, EdgeRendererRegistry } from "@nodera/canvas-react-flow";
import { GraphCanvas } from "@nodera/canvas-react-flow";

export interface DemoAppProps {
  readonly editor: EditorEngine;
  readonly nodeRenderers: NodeRendererRegistry;
  readonly edgeRenderers: EdgeRendererRegistry;
}

/**
 * The host composes the canvas; the editor engine stays the single source
 * of truth. Nodes added by the toolbar appear on the canvas purely through
 * the engine's event bus.
 */
export const DemoApp: FC<DemoAppProps> = ({ editor, nodeRenderers, edgeRenderers }) => (
  <GraphCanvas editor={editor} nodeRenderers={nodeRenderers} edgeRenderers={edgeRenderers} />
);
