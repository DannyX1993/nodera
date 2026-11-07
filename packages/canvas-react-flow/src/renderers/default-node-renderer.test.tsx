import { ReactFlowProvider, useEdgesState, useNodesState } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { FC } from "react";

import { DefaultNodeRenderer } from "./default-node-renderer";
import type { NoderaNodeData } from "./node-renderer-props";

/* ------------------------------------------------------------------ */
/*  Test harness                                                       */
/* ------------------------------------------------------------------ */

const TestWrapper: FC<{ children: ReactNode }> = ({ children }) => {
  const [nodes] = useNodesState([]);
  const [edges] = useEdgesState([]);

  return (
    <ReactFlowProvider>
      {children}
    </ReactFlowProvider>
  );
};

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
    const data = makeData();
    render(<DefaultNodeRenderer data={data} selected={false} />, { wrapper: TestWrapper });
    expect(screen.getByText("Test Node")).not.toBeNull();
  });

  it("applies selected class when selected", () => {
    const { container } = render(<DefaultNodeRenderer data={makeData()} selected={true} />, { wrapper: TestWrapper });
    const wrapper = container.querySelector("[data-nodera-node]");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain("nodera-node-selected");
  });

  it("does not apply selected class when not selected", () => {
    const { container } = render(<DefaultNodeRenderer data={makeData()} selected={false} />, { wrapper: TestWrapper });
    const wrapper = container.querySelector("[data-nodera-node]");
    expect(wrapper?.className).not.toContain("nodera-node-selected");
  });

  it("renders PortHandle for each port", () => {
    const data = makeData();
    const { container } = render(<DefaultNodeRenderer data={data} selected={false} />, { wrapper: TestWrapper });
    // Each port renders a PortHandle div with data-nodera-port-id
    const handles = container.querySelectorAll("[data-nodera-port-id]");
    expect(handles.length).toBe(2);
  });

  it("renders a PortHandle per port entry (one-to-one)", () => {
    const data = makeData({ ports: [{ id: "a", direction: "input" }, { id: "b", direction: "output" }, { id: "c", direction: "bidirectional" }] });
    const { container } = render(<DefaultNodeRenderer data={data} selected={false} />, { wrapper: TestWrapper });
    expect(container.querySelectorAll("[data-nodera-port-id]")).toHaveLength(3);
  });

  it("renders icon glyph when visual has icon metadata", () => {
    const { container } = render(
      <DefaultNodeRenderer data={makeData({ visual: { icon: "🚀" } })} selected={false} />,
      { wrapper: TestWrapper }
    );
    expect(container.textContent).toContain("🚀");
  });
});