import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Footer } from "./footer.js";

afterEach(cleanup);

describe("Footer", () => {
  it("renders the children and actions of the footer region", () => {
    const { container } = render(
      <Footer actions={<span>footer-actions</span>}>
        <span>footer-status</span>
      </Footer>,
    );

    const footer = container.querySelector<HTMLElement>('[data-nodera-region-content="footer"]');
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain("footer-status");
    expect(screen.getByText("footer-actions")).toBeTruthy();
  });

  it("renders an empty footer region when the host provides no content", () => {
    const { container } = render(<Footer />);

    const footer = container.querySelector<HTMLElement>('[data-nodera-region-content="footer"]');
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toBe("");
  });
});
