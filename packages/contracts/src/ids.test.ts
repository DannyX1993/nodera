import { describe, expect, it } from "vitest";
import {
  createEdgeId,
  createGraphId,
  createNodeId,
  createPortId,
  isValidIdShape,
} from "./ids.js";

describe("id factories", () => {
  it("creates branded ids from well-formed strings", () => {
    expect(createGraphId("g-1")).toBe("g-1");
    expect(createNodeId("node-123")).toBe("node-123");
    expect(createEdgeId("e-1")).toBe("e-1");
    expect(createPortId("p-1")).toBe("p-1");
  });

  it("rejects empty, blank and whitespace-containing ids", () => {
    const malformed = ["", "   ", "has space", "\tnode"];
    for (const value of malformed) {
      expect(() => createNodeId(value)).toThrowError(RangeError);
      expect(() => createEdgeId(value)).toThrowError(RangeError);
      expect(() => createGraphId(value)).toThrowError(RangeError);
      expect(() => createPortId(value)).toThrowError(RangeError);
    }
  });
});

describe("isValidIdShape", () => {
  it("accepts non-empty strings without whitespace", () => {
    expect(isValidIdShape("http.request")).toBe(true);
    expect(isValidIdShape("vendor.feature-name")).toBe(true);
  });

  it("rejects non-strings and malformed values", () => {
    expect(isValidIdShape(42)).toBe(false);
    expect(isValidIdShape(undefined)).toBe(false);
    expect(isValidIdShape("")).toBe(false);
    expect(isValidIdShape("a b")).toBe(false);
  });
});
