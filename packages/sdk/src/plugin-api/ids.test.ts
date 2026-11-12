import { describe, expect, it } from "vitest";
import { isPluginId } from "./ids.js";

describe("isPluginId", () => {
  it("accepts a globally qualified id", () => {
    expect(isPluginId("vendor.feature-name")).toBe(true);
    expect(isPluginId("com.example.ai-nodes")).toBe(true);
    expect(isPluginId("a.b")).toBe(true);
  });

  it("rejects an id without a dot", () => {
    expect(isPluginId("feature")).toBe(false);
  });

  it("rejects an id with whitespace", () => {
    expect(isPluginId("vendor feature")).toBe(false);
    expect(isPluginId("vendor.feature name")).toBe(false);
  });

  it("rejects empty or dotted-edge segments", () => {
    expect(isPluginId("")).toBe(false);
    expect(isPluginId(".vendor")).toBe(false);
    expect(isPluginId("vendor.")).toBe(false);
    expect(isPluginId("vendor..feature")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isPluginId(42)).toBe(false);
    expect(isPluginId(undefined)).toBe(false);
    expect(isPluginId(null)).toBe(false);
    expect(isPluginId({})).toBe(false);
    expect(isPluginId([])).toBe(false);
  });
});
