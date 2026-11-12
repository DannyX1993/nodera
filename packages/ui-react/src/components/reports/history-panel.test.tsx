import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HistoryPanel } from "./history-panel.js";
import { addActionNode, createActionEditor, renderWithUi } from "../actions/test-helpers.js";

afterEach(cleanup);

function required<T extends Element>(component: HTMLElement, selector: string): T {
  const element = component.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}

function entries(component: HTMLElement): readonly (string | null)[] {
  return [...component.querySelectorAll("[data-nodera-history-entry]")].map((element) =>
    element.getAttribute("data-nodera-history-entry"),
  );
}

function entry(component: HTMLElement, index: number): HTMLButtonElement {
  return required<HTMLButtonElement>(component, `[data-nodera-history-entry="${index}"]`);
}

function action(component: HTMLElement, name: "undo" | "redo"): HTMLButtonElement {
  return required<HTMLButtonElement>(component, `[data-nodera-history-action="${name}"]`);
}

function currentEntry(component: HTMLElement): string | null {
  return component
    .querySelector("[data-nodera-history-current]")
    ?.getAttribute("data-nodera-history-entry") ?? null;
}

function editorWithNodes(count: number) {
  const editor = createActionEditor();
  for (let index = 0; index < count; index += 1) {
    addActionNode(editor, { nodeId: `node-${index}` });
  }
  return editor;
}

describe("HistoryPanel", () => {
  it("renders the empty state and disabled actions", () => {
    const { container } = renderWithUi(<HistoryPanel />, { editor: createActionEditor() });

    expect(required(container, "[data-nodera-history-empty]").textContent).toBe("Empty history");
    expect(entries(container)).toHaveLength(0);
    expect(currentEntry(container)).toBeNull();
    expect(action(container, "undo").disabled).toBe(true);
    expect(action(container, "redo").disabled).toBe(true);
  });

  it("lists the undoable labels and marks the current position", () => {
    const { container } = renderWithUi(<HistoryPanel />, { editor: editorWithNodes(2) });

    expect(entries(container)).toEqual(["0", "1"]);
    expect(entry(container, 1).textContent).toBe("add-node");
    expect(currentEntry(container)).toBe("1");
    expect(action(container, "undo").disabled).toBe(false);
    expect(action(container, "redo").disabled).toBe(true);
  });

  it("moves the current marker and the redo section when undo runs", () => {
    const { container } = renderWithUi(<HistoryPanel />, { editor: editorWithNodes(2) });

    fireEvent.click(action(container, "undo"));

    expect(currentEntry(container)).toBe("0");
    expect(action(container, "redo").disabled).toBe(false);
    expect(entries(container)).toEqual(["0", "1"]);
    expect(required(container, "[data-nodera-history-redo-section]")).not.toBeNull();

    fireEvent.click(action(container, "undo"));

    expect(currentEntry(container)).toBeNull();
    expect(action(container, "undo").disabled).toBe(true);
  });

  it("walks the history back to the activated undoable entry", () => {
    const editor = editorWithNodes(3);
    const { container } = renderWithUi(<HistoryPanel />, { editor });
    expect(editor.graph.nodeCount).toBe(3);

    fireEvent.click(entry(container, 0));

    expect(editor.graph.nodeCount).toBe(1);
    expect(currentEntry(container)).toBe("0");
  });

  it("walks the history forward to the activated redoable entry", () => {
    const editor = editorWithNodes(3);
    const { container } = renderWithUi(<HistoryPanel />, { editor });
    fireEvent.click(action(container, "undo"));
    expect(editor.graph.nodeCount).toBe(2);

    fireEvent.click(entry(container, 2));

    expect(editor.graph.nodeCount).toBe(3);
    expect(currentEntry(container)).toBe("2");
  });

  it("announces undo/redo availability changes politely", () => {
    const { container } = renderWithUi(<HistoryPanel />, { editor: editorWithNodes(1) });

    fireEvent.click(action(container, "undo"));

    // The history region is a live region, so a keyboard user learns that undo
    // and redo availability changed without having to look for it.
    const panel = required(container, "[data-nodera-history-panel]");
    expect(panel.getAttribute("aria-live")).toBe("polite");
    expect(panel.getAttribute("aria-atomic")).toBe("true");
    expect(action(container, "redo").disabled).toBe(false);
  });

  it("bounds the walk at maxEntries steps", () => {
    const editor = editorWithNodes(3);
    const { container } = renderWithUi(<HistoryPanel maxEntries={1} />, { editor });

    fireEvent.click(entry(container, 0));

    expect(editor.graph.nodeCount).toBe(2);
    expect(currentEntry(container)).toBe("1");
  });
});
