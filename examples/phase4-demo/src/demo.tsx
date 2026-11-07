import { useState } from "react";
import type { FC } from "react";
import { createElement } from "react";
import type { EditorEngine } from "@nodera/application";
import {
  NodeRendererRegistry,
  EdgeRendererRegistry,
  GraphCanvas,
  type NoderaNodeRendererProps,
} from "@nodera/canvas-react-flow";

export interface DemoAppProps {
  readonly editor: EditorEngine;
  readonly onAddHttp: () => void;
  readonly onAddTransform: () => void;
}

/**
 * A custom node renderer for the transform definition. The canvas wrapper
 * still renders the port handles; the custom body just draws a richer card.
 */
function TransformCard({ data, selected }: NoderaNodeRendererProps) {
  return createElement(
    "div",
    {
      className: `nodera-node ${selected ? "nodera-node-selected" : ""}`,
      style: {
        background: data.visual?.color,
        color: "white",
        borderRadius: 6,
        padding: "8px 12px",
        fontWeight: 600,
      },
    },
    `${data.visual?.icon ?? ""} ${data.label} (custom)`,
  );
}

// Register the custom renderer under the definition's renderer id.
const nodeRenderers = new NodeRendererRegistry();
const edgeRenderers = new EdgeRendererRegistry();
nodeRenderers.register("transform-card", TransformCard);

/**
 * The host composes the canvas; the editor engine stays the single source
 * of truth. Nodes added by the toolbar appear on the canvas purely through
 * the engine's event bus.
 */
export const DemoApp: FC<DemoAppProps> = ({ editor, onAddHttp, onAddTransform }) => {
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
