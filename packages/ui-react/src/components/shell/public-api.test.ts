import { describe, expect, it } from "vitest";

import * as uiReact from "../../index.js";

describe("@nodera/ui-react shell public surface", () => {
  it("exports every structural shell component from the package entry point", () => {
    expect(typeof uiReact.EditorShell).toBe("function");
    expect(typeof uiReact.CanvasContainer).toBe("function");
    expect(typeof uiReact.PanelChrome).toBe("function");
    expect(typeof uiReact.PanelHost).toBe("function");
    expect(typeof uiReact.Header).toBe("function");
    expect(typeof uiReact.Footer).toBe("function");
    expect(typeof uiReact.Sidebar).toBe("function");
    expect(typeof uiReact.computeShellSizes).toBe("function");
  });
});
