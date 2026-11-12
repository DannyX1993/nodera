import { describe, expect, it } from "vitest";

import * as uiReact from "../../index.js";

/**
 * A function component or a `React.memo` result: both are element types.
 *
 * `NodePalette` and `SearchPanel` are memoized (S7/D10), and `memo()` returns an
 * exotic component object, so their check is this helper instead of
 * `typeof entry === "function"`. Every other assertion in this file is
 * unchanged.
 */
function isValidElementType(value: unknown): boolean {
  return typeof value === "function" || (typeof value === "object" && value !== null);
}

describe("@nodera/ui-react discovery public surface", () => {
  it("exports the discovery components from the package entry point", () => {
    expect(isValidElementType(uiReact.NodePalette)).toBe(true);
    expect(typeof uiReact.Navigator).toBe("function");
    expect(isValidElementType(uiReact.SearchPanel)).toBe(true);
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
