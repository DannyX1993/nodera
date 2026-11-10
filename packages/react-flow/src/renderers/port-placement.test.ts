import { describe, expect, it } from "vitest";

import { defaultPortPlacement } from "./port-placement.js";

describe("defaultPortPlacement", () => {
  it("keeps today's mapping on a horizontal layout", () => {
    expect(defaultPortPlacement("input", "horizontal")).toBe("left");
    expect(defaultPortPlacement("output", "horizontal")).toBe("right");
    expect(defaultPortPlacement("bidirectional", "horizontal")).toBe("right");
  });

  it("moves ports to the flow axis on a vertical layout", () => {
    expect(defaultPortPlacement("input", "vertical")).toBe("top");
    expect(defaultPortPlacement("output", "vertical")).toBe("bottom");
    expect(defaultPortPlacement("bidirectional", "vertical")).toBe("bottom");
  });
});
