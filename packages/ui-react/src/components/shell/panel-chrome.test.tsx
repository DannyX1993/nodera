import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PanelChrome } from "./panel-chrome.js";

afterEach(cleanup);

describe("PanelChrome", () => {
  it("renders the panel id, the title and the body of the panel", () => {
    const { container } = render(
      <PanelChrome panelId="acme.panel.properties" title="Properties">
        <span>panel-body</span>
      </PanelChrome>,
    );

    const panel = container.querySelector<HTMLElement>(
      '[data-nodera-panel-id="acme.panel.properties"]',
    );
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Properties");
    expect(panel?.textContent).toContain("panel-body");
  });

  it("renders the host actions next to the title", () => {
    render(
      <PanelChrome panelId="p" title="Properties" actions={<span>panel-actions</span>}>
        body
      </PanelChrome>,
    );

    expect(screen.getByText("panel-actions")).toBeTruthy();
  });

  it("renders no hide button when the panel is not hideable", () => {
    render(
      <PanelChrome panelId="p" title="Properties" hideable={false} onHide={() => {}}>
        body
      </PanelChrome>,
    );

    expect(screen.queryByRole("button", { name: "Hide Properties" })).toBeNull();
  });

  it("renders no hide button when the host provides no hide handler", () => {
    render(
      <PanelChrome panelId="p" title="Properties" hideable={true}>
        body
      </PanelChrome>,
    );

    expect(screen.queryByRole("button", { name: "Hide Properties" })).toBeNull();
  });

  it("calls the hide handler from the hide button of a hideable panel", () => {
    const onHide = vi.fn();
    render(
      <PanelChrome panelId="p" title="Properties" hideable={true} onHide={onHide}>
        body
      </PanelChrome>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide Properties" }));

    expect(onHide).toHaveBeenCalledTimes(1);
  });
});
