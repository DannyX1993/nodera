import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { FC } from "react";
import { createElement } from "react";
import { EditorEngine } from "@nodera/application";

import { NoderaCanvasProvider, useNoderaCanvas } from "./nodera-canvas-provider.js";

describe("NoderaCanvasProvider", () => {
  it("provides the editor engine to consumers", () => {
    const engine = new EditorEngine({ graphId: "g" });
    let seen: EditorEngine | undefined;
    const Probe: FC = () => {
      const ctx = useNoderaCanvas();
      seen = ctx.editor;
      return null;
    };
    render(
      createElement(NoderaCanvasProvider, {
        editor: engine,
        children: createElement(Probe),
      }),
    );
    expect(seen).toBe(engine);
    cleanup();
  });

  it("throws when useNoderaCanvas is used outside the provider", () => {
    const Probe: FC = () => {
      useNoderaCanvas();
      return null;
    };
    // React logs error-boundary noise to console; the render call itself throws.
    expect(() => render(createElement(Probe))).toThrow(/NoderaCanvasProvider/);
    cleanup();
  });
});
