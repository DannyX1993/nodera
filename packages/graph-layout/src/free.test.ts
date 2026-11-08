import { describe, expect, it } from "vitest";
import { createNodeId } from "@nodera/contracts";

import { createFreeStrategy } from "./index.js";

const free = createFreeStrategy();

describe("createFreeStrategy", () => {
  it("positions nothing, keeping every position in the host's hands", () => {
    const result = free.place({
      nodes: [{ id: createNodeId("a") }, { id: createNodeId("b") }],
      edges: [{ source: createNodeId("a"), target: createNodeId("b") }],
      options: { direction: "horizontal", nodeSpacing: 40, rankSpacing: 100, scope: "all" },
    });

    expect(result).toEqual({ ok: true, value: { positions: [] } });
    expect(free.id).toBe("nodera.graph-layout.free");
  });
});
