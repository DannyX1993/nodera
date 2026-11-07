import { ReactFlowProvider, useEdgesState, useNodesState } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { FC } from "react";

import { PortHandle } from "./port-renderer";

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
});