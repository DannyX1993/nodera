import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SmokeProbe } from "./smoke-probe.tsx";

describe("canvas-react-flow test rig", () => {
  it("renders React components inside jsdom", () => {
    render(<SmokeProbe label="canvas ready" />);
    expect(screen.getByText("canvas ready")).toBeDefined();
  });
});
