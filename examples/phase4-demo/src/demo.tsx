import { useState } from "react";
import type { FC } from "react";
import type { EditorEngine } from "@nodera/application";
import type { NodeRendererRegistry, EdgeRendererRegistry } from "@nodera/canvas-react-flow";
import { GraphCanvas } from "@nodera/canvas-react-flow";

export interface DemoAppProps {
  readonly editor: EditorEngine;
  readonly nodeRenderers: NodeRendererRegistry;
  readonly edgeRenderers: EdgeRendererRegistry;
  readonly onAddHttp: () => void;
  readonly onAddTransform: () => void;
}

/**
 * The host composes the canvas; the editor engine stays the single source
 * of truth. Nodes added by the toolbar appear on the canvas purely through
 * the engine's event bus.
 */
export const DemoApp: FC<DemoAppProps> = ({
  editor,
  nodeRenderers,
  edgeRenderers,
  onAddHttp,
  onAddTransform,
}) => {
  const [colorMode, setColorMode] = useState<"light" | "dark">("light");

  return (
    <>
      <div id="toolbar">
        <span>
          <strong>Nodera</strong> — Phase 4: first functional editor
        </span>
        <button onClick={onAddHttp}>+ HTTP Request</button>
        <button onClick={onAddTransform}>+ Transform</button>
        <button
          id="toggle-theme"
          onClick={() => setColorMode((mode) => (mode === "light" ? "dark" : "light"))}
        >
          {colorMode === "light" ? "🌙 Dark" : "☀️ Light"}
        </button>
      </div>
      <div id="canvas">
        <GraphCanvas
          editor={editor}
          nodeRenderers={nodeRenderers}
          edgeRenderers={edgeRenderers}
          colorMode={colorMode}
        />
      </div>
    </>
  );
};
