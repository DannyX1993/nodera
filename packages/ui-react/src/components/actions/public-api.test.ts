import { describe, expect, it } from "vitest";

import * as uiReact from "../../index.js";

describe("@nodera/ui-react action public surface", () => {
  it("exports the action components from the package entry point", () => {
    expect(typeof uiReact.Toolbar).toBe("function");
    expect(typeof uiReact.ContextMenu).toBe("function");
  });

  it("exports the command dispatch hook and the toolbar renderer id", () => {
    expect(typeof uiReact.useCommandDispatcher).toBe("function");
    expect(uiReact.DEFAULT_TOOLBAR_RENDERER_ID).toBe("nodera.toolbar.default");
    expect(uiReact.DEFAULT_FLOATING_RECT).toEqual({ x: 80, y: 80, width: 320, height: 240 });
  });
});
