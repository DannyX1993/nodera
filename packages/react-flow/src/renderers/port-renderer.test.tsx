import { ReactFlowProvider, useEdgesState, useNodesState } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { FC } from "react";

import { PortHandle } from "./port-renderer.js";
import { NoderaPortAxisProvider } from "../canvas/editor-context.js";

/* ------------------------------------------------------------------ */
/*  Test harness: minimal provider chain for Handle                    */
/* ------------------------------------------------------------------ */

/**
 * Handle throws when rendered outside a React Flow context.
 * A bare `ReactFlowProvider` + useNodesState/useEdgesState hooks
 * are sufficient to satisfy the internal context requirement.
 */
const TestWrapper: FC<{ children: ReactNode }> = ({ children }) => {
  const [nodes] = useNodesState([]);
  const [edges] = useEdgesState([]);

  return (
    <ReactFlowProvider>
      {children}
    </ReactFlowProvider>
  );
};

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("PortHandle", () => {
  afterEach(cleanup);

  it("renders a Handle element with correct aria-label from portId", () => {
    const { container } = render(<PortHandle portId="my-port" />, { wrapper: TestWrapper });
    const handle = container.querySelector("[aria-label='my-port']");
    expect(handle).not.toBeNull();
  });

  it("input direction → type='target'", () => {
    const { container } = render(<PortHandle portId="in-port" direction="input" />, { wrapper: TestWrapper });
    // Handle renders a div with data-handlepos for input (Left position)
    const handle = container.querySelector("[data-handlepos='left']");
    expect(handle).not.toBeNull();
  });

  it("output direction → type='source'", () => {
    const { container } = render(<PortHandle portId="out-port" direction="output" />, { wrapper: TestWrapper });
    const handle = container.querySelector("[data-handlepos='right']");
    expect(handle).not.toBeNull();
  });

  it("bidirectional → type='source'", () => {
    const { container } = render(<PortHandle portId="bi-port" direction="bidirectional" />, { wrapper: TestWrapper });
    const handle = container.querySelector("[data-handlepos='right']");
    expect(handle).not.toBeNull();
  });

  it("uses port name as aria-label when provided", () => {
    const { container } = render(
      <PortHandle portId="p1" name="MyPort" />,
      { wrapper: TestWrapper }
    );
    const el = container.querySelector("[aria-label='MyPort']");
    expect(el).not.toBeNull();
  });

  it("falls back to port id for aria-label when name missing", () => {
    const { container } = render(
      <PortHandle portId="fallback-id" />,
      { wrapper: TestWrapper }
    );
    const el = container.querySelector("[aria-label='fallback-id']");
    expect(el).not.toBeNull();
  });

  it("renders a wrapper div with data-nodera-port-id attribute", () => {
    const { container } = render(<PortHandle portId="attr-test" />, { wrapper: TestWrapper });
    const div = container.querySelector("[data-nodera-port-id='attr-test']");
    expect(div).not.toBeNull();
  });

  it("renders a declared placement instead of the direction default", () => {
    const { container } = render(
      <PortHandle portId="pinned" direction="input" placement="bottom" />,
      { wrapper: TestWrapper },
    );

    expect(container.querySelector("[data-handlepos='bottom']")).not.toBeNull();
    expect(container.querySelector("[data-handlepos='left']")).toBeNull();
  });

  it("derives the default side from the layout axis and the port direction", () => {
    const vertical = ({ children }: { children: ReactNode }) => (
      <TestWrapper>
        <NoderaPortAxisProvider axis="vertical">{children}</NoderaPortAxisProvider>
      </TestWrapper>
    );

    const input = render(<PortHandle portId="in" direction="input" />, {
      wrapper: vertical,
    });
    expect(input.container.querySelector("[data-handlepos='top']")).not.toBeNull();
    input.unmount();

    const output = render(<PortHandle portId="out" direction="output" />, {
      wrapper: vertical,
    });
    expect(output.container.querySelector("[data-handlepos='bottom']")).not.toBeNull();
  });

  it("keeps direction as the handle type whatever the placement is", () => {
    const { container } = render(
      <PortHandle portId="in-top" direction="input" placement="top" />,
      { wrapper: TestWrapper },
    );

    expect(container.querySelector("[data-handlepos='top']")).not.toBeNull();
    expect(container.querySelector("[data-nodera-port-direction='input']")).not.toBeNull();
  });

  /* ---------------------------------------------------------------- */
  /*  Token-driven handle styles (S3 Handle Styles, D8)                */
  /* ---------------------------------------------------------------- */

  it("styles the handle from the design tokens with fallbacks", () => {
    const { container } = render(<PortHandle portId="styled" />, { wrapper: TestWrapper });
    const handle = container.querySelector(
      "[data-nodera-port-id='styled']",
    ) as HTMLElement;

    expect(handle.style.getPropertyValue("width")).toBe(
      "var(--ndr-handle-size, 8px)",
    );
    expect(handle.style.getPropertyValue("height")).toBe(
      "var(--ndr-handle-size, 8px)",
    );
    expect(handle.style.getPropertyValue("background-color")).toBe(
      "var(--ndr-handle-background, #ffffff)",
    );
    expect(handle.style.getPropertyValue("border-width")).toBe(
      "var(--ndr-handle-border-width, 1.5px)",
    );
    expect(handle.style.getPropertyValue("border-style")).toBe("solid");
    expect(handle.style.getPropertyValue("border-color")).toBe(
      "var(--ndr-handle-border-color, #7c8896)",
    );
    expect(handle.style.getPropertyValue("border-radius")).toBe(
      "var(--ndr-handle-radius, 50%)",
    );
  });
});