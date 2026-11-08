import { describe, expect, it } from "vitest";
import {
  EMPTY_RENDERER_BINDINGS,
  RENDERER_KINDS,
  withRendererBinding,
} from "./renderer-bindings.js";

describe("renderer bindings", () => {
  it("starts empty for every renderer kind", () => {
    for (const kind of RENDERER_KINDS) {
      expect(EMPTY_RENDERER_BINDINGS[kind].size).toBe(0);
    }
  });

  it("adds one opaque binding without mutating the previous snapshot", () => {
    const Component = (): null => null;

    const next = withRendererBinding(EMPTY_RENDERER_BINDINGS, "nodes", {
      id: "demo.node",
      value: Component,
    });

    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.value.nodes.get("demo.node")).toBe(Component);
    expect(EMPTY_RENDERER_BINDINGS.nodes.size).toBe(0);
    expect(next.value.edges).toBe(EMPTY_RENDERER_BINDINGS.edges);
  });

  it("rejects an empty renderer id", () => {
    const result = withRendererBinding(EMPTY_RENDERER_BINDINGS, "panels", {
      id: " ",
      value: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "sdk.invalid-id",
      path: ["renderers", "panels", " "],
    });
  });

  it("never overwrites a bound renderer silently", () => {
    const first = withRendererBinding(EMPTY_RENDERER_BINDINGS, "edges", {
      id: "demo.edge",
      value: "first",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = withRendererBinding(first.value, "edges", {
      id: "demo.edge",
      value: "second",
    });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toMatchObject({
      code: "sdk.duplicate-id",
      path: ["renderers", "edges", "demo.edge"],
    });
  });
});
