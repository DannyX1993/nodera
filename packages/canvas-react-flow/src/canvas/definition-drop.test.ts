import { describe, expect, it } from "vitest";

import {
  NODE_DEFINITION_MIME_TYPE,
  isNodeDefinitionDrag,
  nodeDefinitionFromDataTransfer,
} from "./definition-drop.js";

/* ------------------------------------------------------------------ */
/*  Node definition drag & drop contract (D7)                          */
/* ------------------------------------------------------------------ */

describe("NODE_DEFINITION_MIME_TYPE", () => {
  it("is a stable MIME type", () => {
    expect(NODE_DEFINITION_MIME_TYPE).toBe("application/nodera-node-definition");
  });
});

describe("nodeDefinitionFromDataTransfer", () => {
  it("returns the definition id carried by the payload", () => {
    const dataTransfer = {
      getData: (type: string) => (type === NODE_DEFINITION_MIME_TYPE ? "acme.node" : ""),
    };
    expect(nodeDefinitionFromDataTransfer(dataTransfer)).toBe("acme.node");
  });

  it("trims surrounding whitespace", () => {
    const dataTransfer = { getData: () => "  acme.node  " };
    expect(nodeDefinitionFromDataTransfer(dataTransfer)).toBe("acme.node");
  });

  it("returns undefined for a blank payload", () => {
    const dataTransfer = { getData: () => "   " };
    expect(nodeDefinitionFromDataTransfer(dataTransfer)).toBeUndefined();
  });

  it("returns undefined for an empty payload", () => {
    const dataTransfer = { getData: () => "" };
    expect(nodeDefinitionFromDataTransfer(dataTransfer)).toBeUndefined();
  });

  it("returns undefined when the data transfer is absent", () => {
    expect(nodeDefinitionFromDataTransfer(undefined)).toBeUndefined();
    expect(nodeDefinitionFromDataTransfer(null)).toBeUndefined();
  });
});

describe("isNodeDefinitionDrag", () => {
  it("is true when the MIME type is announced", () => {
    expect(isNodeDefinitionDrag({ types: [NODE_DEFINITION_MIME_TYPE] })).toBe(true);
  });

  it("is true when the MIME type is one of several announced types", () => {
    expect(
      isNodeDefinitionDrag({ types: ["text/plain", NODE_DEFINITION_MIME_TYPE] }),
    ).toBe(true);
  });

  it("is false for an unrelated payload", () => {
    expect(isNodeDefinitionDrag({ types: ["text/plain"] })).toBe(false);
  });

  it("is false when no types are announced", () => {
    expect(isNodeDefinitionDrag({ types: [] })).toBe(false);
    expect(isNodeDefinitionDrag({})).toBe(false);
  });

  it("is false when the data transfer is absent", () => {
    expect(isNodeDefinitionDrag(undefined)).toBe(false);
    expect(isNodeDefinitionDrag(null)).toBe(false);
  });
});
