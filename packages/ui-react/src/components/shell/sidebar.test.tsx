import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "./sidebar.js";

afterEach(cleanup);

function requiredSidebar(container: HTMLElement): HTMLElement {
  const sidebar = container.querySelector<HTMLElement>("[data-nodera-sidebar]");
  if (sidebar === null) {
    throw new Error("sidebar is not rendered");
  }
  return sidebar;
}

describe("Sidebar", () => {
  it("renders the title and the children of the sidebar", () => {
    const { container } = render(
      <Sidebar title="Explorer">
        <span>sidebar-children</span>
      </Sidebar>,
    );

    const sidebar = requiredSidebar(container);
    expect(sidebar.textContent).toContain("Explorer");
    expect(sidebar.textContent).toContain("sidebar-children");
  });

  it("renders no toggle button when the sidebar is not collapsible", () => {
    const { container } = render(
      <Sidebar title="Explorer" collapsible={false} onToggle={() => {}}>
        content
      </Sidebar>,
    );

    expect(requiredSidebar(container).querySelector("button")).toBeNull();
  });

  it("renders no toggle button without a toggle handler", () => {
    const { container } = render(
      <Sidebar title="Explorer" collapsible={true}>
        content
      </Sidebar>,
    );

    expect(requiredSidebar(container).querySelector("button")).toBeNull();
  });

  it("renders a toggle that reflects the collapsed state and reports toggles", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <Sidebar title="Explorer" collapsible={true} collapsed={false} onToggle={onToggle}>
        content
      </Sidebar>,
    );

    const toggle = requiredSidebar(container).querySelector("button");
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle as HTMLButtonElement);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("reports aria-expanded=false when the sidebar is collapsed", () => {
    const { container } = render(
      <Sidebar title="Explorer" collapsible={true} collapsed={true} onToggle={() => {}}>
        content
      </Sidebar>,
    );

    expect(requiredSidebar(container).querySelector("button")?.getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("hides the children and keeps the title bar when collapsed", () => {
    const { container } = render(
      <Sidebar title="Explorer" collapsible={true} collapsed={true} onToggle={() => {}}>
        <span>sidebar-children</span>
      </Sidebar>,
    );

    const sidebar = requiredSidebar(container);
    expect(sidebar.textContent).toContain("Explorer");
    expect(sidebar.textContent).not.toContain("sidebar-children");
  });
});
