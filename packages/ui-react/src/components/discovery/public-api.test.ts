import { describe, expect, it } from "vitest";

import * as uiReact from "../../index.js";

describe("@nodera/ui-react discovery public surface", () => {
  it("exports the discovery components from the package entry point", () => {
    expect(typeof uiReact.NodePalette).toBe("function");
    expect(typeof uiReact.Navigator).toBe("function");
    expect(typeof uiReact.SearchPanel).toBe("function");
    expect(typeof uiReact.MinimapPanel).toBe("function");
  });

  it("exports the discovery helpers from the package entry point", () => {
    expect(typeof uiReact.searchGraph).toBe("function");
    expect(typeof uiReact.groupDefinitionsByCategory).toBe("function");
    expect(typeof uiReact.projectNodes).toBe("function");
    expect(typeof uiReact.nodeDisplayLabel).toBe("function");
    expect(uiReact.DEFAULT_SEARCH_LIMIT).toBe(20);
    expect(uiReact.UNCATEGORIZED_CATEGORY).toBe("uncategorized");
  });

  it("exports useEditorEngine from the package entry point", () => {
    expect(typeof uiReact.useEditorEngine).toBe("function");
  });
});
