import { describe, expect, it } from "vitest";

import { NODE_DEFINITION_MIME_TYPE } from "./drag-protocol.js";

describe("drag protocol", () => {
  it("publishes the stable mime type a palette writes and a canvas accepts", () => {
    expect(NODE_DEFINITION_MIME_TYPE).toBe("application/nodera-node-definition");
  });
});
