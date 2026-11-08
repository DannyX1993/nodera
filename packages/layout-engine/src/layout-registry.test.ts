import { describe, expect, it } from "vitest";

import { LayoutRegistry } from "./layout-registry.js";
import {
  CANVAS_ONLY_LAYOUT,
  CANVAS_ONLY_LAYOUT_ID,
  EDITOR_LAYOUT,
  EDITOR_LAYOUT_ID,
  IDE_LAYOUT,
  IDE_LAYOUT_ID,
  PREDEFINED_LAYOUTS,
} from "./predefined-layouts.js";

describe("predefined layouts", () => {
  it("declares stable ids for the layouts a host can start from", () => {
    expect(EDITOR_LAYOUT_ID).toBe("nodera.layout.editor");
    expect(CANVAS_ONLY_LAYOUT_ID).toBe("nodera.layout.canvas-only");
    expect(IDE_LAYOUT_ID).toBe("nodera.layout.ide");
    expect(PREDEFINED_LAYOUTS.map((layout) => layout.id)).toEqual([
      EDITOR_LAYOUT_ID,
      CANVAS_ONLY_LAYOUT_ID,
      IDE_LAYOUT_ID,
    ]);
  });

  it("arranges the same panels differently in the classic editor and the ide layouts", () => {
    const editorRegions = EDITOR_LAYOUT.panels.map((panel) => [panel.panelId, panel.region]);
    const ideRegions = IDE_LAYOUT.panels.map((panel) => [panel.panelId, panel.region]);

    expect(editorRegions).toEqual([
      ["header", "header"],
      ["palette", "left"],
      ["properties", "right"],
      ["validation", "bottom"],
    ]);
    expect(ideRegions).toEqual([
      ["header", "header"],
      ["palette", "left"],
      ["navigator", "left"],
      ["properties", "right"],
      ["validation", "bottom"],
      ["footer", "footer"],
    ]);
  });

  it("keeps the canvas as large as possible in the canvas-only layout", () => {
    expect(CANVAS_ONLY_LAYOUT.panels.map((panel) => panel.panelId)).toEqual(["header"]);
  });
});

describe("LayoutRegistry", () => {
  it("starts with the predefined layouts and defaults to the classic editor layout", () => {
    const registry = new LayoutRegistry();

    expect(registry.size).toBe(3);
    expect(registry.getDefault().id).toBe(EDITOR_LAYOUT_ID);
    expect(registry.get(IDE_LAYOUT_ID)?.name).toBe("IDE");
  });

  it("accepts a host-declared layout and switches the default", () => {
    const registry = new LayoutRegistry({ layouts: [CANVAS_ONLY_LAYOUT] });

    expect(registry.all().map((layout) => layout.id)).toEqual([CANVAS_ONLY_LAYOUT_ID]);
    expect(registry.setDefault(CANVAS_ONLY_LAYOUT_ID).ok).toBe(true);
    expect(registry.getDefault().id).toBe(CANVAS_ONLY_LAYOUT_ID);
  });

  it("rejects a duplicate layout id and an unknown default", () => {
    const registry = new LayoutRegistry();

    const duplicate = registry.register(EDITOR_LAYOUT);
    expect(duplicate.ok).toBe(false);
    expect(!duplicate.ok && duplicate.error.message).toBe(
      'layout-registry already contains a definition with id "nodera.layout.editor"',
    );

    expect(registry.setDefault("nodera.layout.missing").ok).toBe(false);
    expect(() => new LayoutRegistry({ layouts: [CANVAS_ONLY_LAYOUT], defaultLayoutId: "nodera.layout.missing" })).toThrowError(
      'layout-registry has no definition with id "nodera.layout.missing"',
    );
  });
});
