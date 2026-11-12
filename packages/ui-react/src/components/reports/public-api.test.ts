import { describe, expect, it } from "vitest";

import * as uiReact from "../../index.js";

/**
 * A function component or a `React.memo` result: both are element types.
 *
 * `ValidationPanel` and `HistoryPanel` are memoized (S7/D10), and `memo()`
 * returns an exotic component object, so their check is this helper instead of
 * `typeof entry === "function"`. Every other assertion in this file is
 * unchanged.
 */
function isValidElementType(value: unknown): boolean {
  return typeof value === "function" || (typeof value === "object" && value !== null);
}

describe("@nodera/ui-react report public surface", () => {
  it("exports the report components from the package entry point", () => {
    expect(isValidElementType(uiReact.ValidationPanel)).toBe(true);
    expect(isValidElementType(uiReact.HistoryPanel)).toBe(true);
  });
});
