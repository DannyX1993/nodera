import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DialogDefinition } from "@nodera/ui-core";

import { Dialog, DIALOG_BASE_CLASS, dialogSizeClass } from "./dialog.js";

afterEach(cleanup);

const CREATE_NODE: DialogDefinition = {
  id: "acme.dialog.create-node",
  title: "Create node",
  description: "Pick the node definition to add.",
  size: "lg",
};

/** Same dialog with every optional field it can omit left out. */
const BARE_NODE: DialogDefinition = { id: "acme.dialog.create-node", title: "Create node" };

function noop(): void {
  // Intentional no-op closer.
}

function renderDialog(
  definition: DialogDefinition,
  children: ReactNode = <button type="button">First</button>,
): ReturnType<typeof render> {
  return render(
    <Dialog definition={definition} open onClose={noop}>
      {children}
    </Dialog>,
  );
}

function focusableChildren(): readonly HTMLButtonElement[] {
  return [
    screen.getByRole("button", { name: "First" }),
    screen.getByRole("button", { name: "Second" }),
  ];
}

describe("Dialog accessible contract", () => {
  it("renders a modal dialog named by the definition title", () => {
    renderDialog(CREATE_NODE);

    const dialog = screen.getByRole("dialog", { name: "Create node" });

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("data-nodera-dialog")).toBe("acme.dialog.create-node");
  });

  it("wires the description with aria-describedby when the definition declares one", () => {
    renderDialog(CREATE_NODE);

    const dialog = screen.getByRole("dialog", { name: "Create node" });
    const describedBy = dialog.getAttribute("aria-describedby");

    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      "Pick the node definition to add.",
    );
  });

  it("omits aria-describedby when the definition has no description", () => {
    renderDialog(BARE_NODE);

    expect(screen.getByRole("dialog").hasAttribute("aria-describedby")).toBe(false);
  });

  it("renders nothing while it is not open", () => {
    render(
      <Dialog definition={CREATE_NODE} open={false} onClose={noop}>
        <button type="button">First</button>
      </Dialog>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reflects the definition size in a class and a data attribute", () => {
    const { unmount } = renderDialog(CREATE_NODE);
    const large = screen.getByRole("dialog");

    expect(large.className).toContain(DIALOG_BASE_CLASS);
    expect(large.className).toContain(dialogSizeClass("lg"));
    expect(large.getAttribute("data-nodera-dialog-size")).toBe("lg");
    unmount();

    renderDialog(BARE_NODE);
    const medium = screen.getByRole("dialog");

    expect(medium.classList.contains(dialogSizeClass("md"))).toBe(true);
    expect(medium.getAttribute("data-nodera-dialog-size")).toBe("md");
  });
});

describe("Dialog focus management", () => {
  it("moves focus to the first focusable control when it opens", () => {
    renderDialog(CREATE_NODE, <FocusablePair />);

    expect(document.activeElement).toBe(focusableChildren()[0]);
  });

  it("focuses the dialog itself when it holds no focusable control", () => {
    renderDialog(CREATE_NODE, <p>Read only</p>);

    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("wraps focus forward from the last control to the first", () => {
    renderDialog(CREATE_NODE, <FocusablePair />);
    const [first, second] = focusableChildren();
    second?.focus();

    fireEvent.keyDown(second as HTMLButtonElement, { key: "Tab" });

    expect(document.activeElement).toBe(first);
  });

  it("wraps focus backward from the first control to the last", () => {
    renderDialog(CREATE_NODE, <FocusablePair />);
    const [first, second] = focusableChildren();
    first?.focus();

    fireEvent.keyDown(first as HTMLButtonElement, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(second);
  });

  it("leaves the browser tabbing between inner controls untouched", () => {
    renderDialog(CREATE_NODE, <FocusablePair />);
    const [first] = focusableChildren();
    first?.focus();

    expect(fireEvent.keyDown(first as HTMLButtonElement, { key: "Tab" })).toBe(true);
  });

  it("returns focus to the element that had it before opening", () => {
    function Trigger(): ReactNode {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Add node
          </button>
          <Dialog definition={CREATE_NODE} open={open} onClose={() => setOpen(false)}>
            <button type="button" onClick={() => setOpen(false)}>
              Done
            </button>
          </Dialog>
        </>
      );
    }

    render(<Trigger />);
    const trigger = screen.getByRole("button", { name: "Add node" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Done" }));

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(document.activeElement).toBe(trigger);
  });
});

describe("Dialog dismissal", () => {
  it("closes on Escape when the definition is dismissible", () => {
    const onClose = vi.fn();
    render(
      <Dialog definition={CREATE_NODE} open onClose={onClose}>
        <button type="button">First</button>
      </Dialog>,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "First" }), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when the definition is not dismissible", () => {
    const onClose = vi.fn();
    render(
      <Dialog definition={{ ...CREATE_NODE, dismissible: false }} open onClose={onClose}>
        <button type="button">First</button>
      </Dialog>,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "First" }), { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a backdrop click when the definition is dismissible", () => {
    const onClose = vi.fn();
    render(
      <Dialog definition={CREATE_NODE} open onClose={onClose}>
        <button type="button">First</button>
      </Dialog>,
    );

    const backdrop = document.querySelector("[data-nodera-dialog-backdrop]");
    fireEvent.click(backdrop as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open when the panel content is clicked", () => {
    const onClose = vi.fn();
    render(
      <Dialog definition={CREATE_NODE} open onClose={onClose}>
        <button type="button">First</button>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "First" }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores backdrop clicks when the definition is not dismissible", () => {
    const onClose = vi.fn();
    render(
      <Dialog definition={{ ...CREATE_NODE, dismissible: false }} open onClose={onClose}>
        <button type="button">First</button>
      </Dialog>,
    );

    fireEvent.click(document.querySelector("[data-nodera-dialog-backdrop]") as HTMLElement);

    expect(onClose).not.toHaveBeenCalled();
  });
});

function FocusablePair(): ReactNode {
  return (
    <>
      <button type="button">First</button>
      <button type="button">Second</button>
    </>
  );
}
