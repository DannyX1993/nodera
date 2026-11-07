import { ReactFlowProvider } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { DefaultNodeRenderer } from "./default-node-renderer.js";
import type { NoderaNodeData } from "./node-renderer-props.js";

/* ------------------------------------------------------------------ */
/*  Test harness                                                       */
/* ------------------------------------------------------------------ */

function renderNode(data: NoderaNodeData, selected = false) {
  return render(
    <ReactFlowProvider>
      <DefaultNodeRenderer data={data} selected={selected} />
    </ReactFlowProvider>,
  );
}

function makeData(overrides?: Partial<NoderaNodeData>): NoderaNodeData {
  return {
    definitionId: "test-node",
    label: "Test Node",
    ports: [
      { id: "in", name: "In Port", direction: "input" },
      { id: "out", name: "Out Port", direction: "output" },
    ],
    properties: {},
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("DefaultNodeRenderer", () => {
  afterEach(cleanup);

  it("renders the label text", () => {
    renderNode(makeData());
    expect(screen.getByText("Test Node")).toBeDefined();
  });

  it("renders the icon glyph when visual.icon is present", () => {
    renderNode(makeData({ visual: { icon: "🌐" } }));
    expect(screen.getByText("🌐")).toBeDefined();
  });

  it("applies visual.color as the node background", () => {
    const { container } = renderNode(makeData({ visual: { color: "#2563eb" } }));
    const node = container.querySelector("[data-nodera-node]") as HTMLElement;
    expect(node.style.backgroundColor).toBe("rgb(37, 99, 235)");
  });

  it("shows the selected indicator class when selected", () => {
    const { container } = renderNode(makeData(), true);
    const node = container.querySelector("[data-nodera-node]") as HTMLElement;
    expect(node.className).toContain("nodera-node-selected");
    expect(container.querySelector(".nodera-node-selected-indicator")).not.toBeNull();
  });

  it("does not show the selected indicator when not selected", () => {
    const { container } = renderNode(makeData(), false);
    expect(container.querySelector(".nodera-node-selected-indicator")).toBeNull();
  });

  it("renders no port handles itself (the node-type wrapper owns ports)", () => {
    const { container } = renderNode(makeData());
    expect(container.querySelectorAll("[data-nodera-port-id]")).toHaveLength(0);
  });
});
