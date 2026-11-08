import { describe, expect, it } from "vitest";

import * as uiReact from "../../index.js";

describe("@nodera/ui-react report public surface", () => {
  it("exports the report components from the package entry point", () => {
    expect(typeof uiReact.ValidationPanel).toBe("function");
    expect(typeof uiReact.HistoryPanel).toBe("function");
  });
});
