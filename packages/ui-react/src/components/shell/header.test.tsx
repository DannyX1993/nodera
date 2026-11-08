import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Header } from "./header.js";

afterEach(cleanup);

describe("Header", () => {
  it("renders the title, subtitle, children and actions of the header region", () => {
    const { container } = render(
      <Header title="Nodera" subtitle="Graph editor" actions={<span>header-actions</span>}>
        <span>header-children</span>
      </Header>,
    );

    const header = container.querySelector<HTMLElement>('[data-nodera-region-content="header"]');
    expect(header).not.toBeNull();
    expect(header?.textContent).toContain("Nodera");
    expect(header?.textContent).toContain("Graph editor");
    expect(header?.textContent).toContain("header-children");
    expect(screen.getByText("header-actions")).toBeTruthy();
  });

  it("renders only the slots the host provides", () => {
    const { container } = render(<Header title="Nodera" />);

    const header = container.querySelector<HTMLElement>('[data-nodera-region-content="header"]');
    expect(header?.textContent).toBe("Nodera");
  });
});
