import { describe, expect, it } from "vitest";

import type {
  ComponentRenderers,
  EditorShellSlots,
  GraphCanvasProps,
  MenuRendererProps,
  NoderaNodeData,
  NoderaNodePort,
  NoderaNodeRendererProps,
  NoderaPortRendererProps,
  PanelRendererProps,
  PropertyRendererProps,
  ToolbarRendererProps,
} from "./index.js";

/**
 * Guard for the renderer vocabulary of the React binding.
 *
 * A renderer value stays opaque (`unknown`) inside `@nodera/sdk`; these are the
 * names a host writes once its renderer reaches the React binding. The tuple is
 * the assertion: this file stops compiling when the barrel drops one of them,
 * so a host never has to hand-mirror a props shape.
 */
type RendererVocabulary = readonly [
  NoderaNodeRendererProps,
  NoderaPortRendererProps,
  NoderaNodeData,
  NoderaNodePort,
  GraphCanvasProps,
  PanelRendererProps,
  PropertyRendererProps,
  ToolbarRendererProps,
  MenuRendererProps,
  EditorShellSlots,
  ComponentRenderers,
];

/** Entry count of {@link RendererVocabulary}, typed against the tuple itself. */
const RENDERER_VOCABULARY_COUNT: RendererVocabulary["length"] = 11;

describe("public renderer vocabulary", () => {
  it("publishes every renderer contract a host has to implement", () => {
    expect(RENDERER_VOCABULARY_COUNT).toBe(11);
  });

  it("lets a host implement a panel and a node renderer with the exported names", () => {
    const Panel = (_props: PanelRendererProps): null => null;
    const NodeRenderer = (_props: NoderaNodeRendererProps): null => null;
    const PortRenderer = (_props: NoderaPortRendererProps): null => null;

    expect(typeof Panel).toBe("function");
    expect(typeof NodeRenderer).toBe("function");
    expect(typeof PortRenderer).toBe("function");
  });
});
