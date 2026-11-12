import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ValidationPanel } from "./validation-panel.js";
import {
  REQUIRED_DEFINITION_ID,
  addActionNode,
  connectActionNodes,
  createActionEditor,
  registerSeverityValidator,
  renderWithUi,
} from "../actions/test-helpers.js";

afterEach(cleanup);

function required<T extends Element>(component: HTMLElement, selector: string): T {
  const element = component.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}

function count(component: HTMLElement, severity: "error" | "warning" | "info"): string | null {
  return component
    .querySelector(`[data-nodera-validation-count="${severity}"]`)
    ?.textContent?.trim() ?? null;
}

function issueRows(component: HTMLElement) {
  return [...component.querySelectorAll("[data-nodera-validation-issue]")];
}

function issueRow(component: HTMLElement, code: string): Element {
  const row = [...component.querySelectorAll("[data-nodera-validation-issue]")].find(
    (element) => element.querySelector("[data-nodera-validation-code]")?.textContent === code,
  );
  if (row === undefined) {
    throw new Error(`missing validation issue: ${code}`);
  }
  return row;
}

function editorWithRequiredError() {
  const editor = createActionEditor();
  addActionNode(editor, { nodeId: "node-1", definitionId: REQUIRED_DEFINITION_ID });
  return editor;
}

describe("ValidationPanel", () => {
  it("reports that nothing has been validated yet", () => {
    const { container } = renderWithUi(<ValidationPanel />, { editor: createActionEditor() });

    expect(required(container, "[data-nodera-validation-status]").textContent).toBe(
      "Not validated yet",
    );
    expect(count(container, "error")).toBe("0");
    expect(count(container, "warning")).toBe("0");
    expect(count(container, "info")).toBe("0");
    expect(issueRows(container)).toHaveLength(0);
    expect(container.querySelector("[data-nodera-validation-group]")).toBeNull();
  });

  it("validates the graph from the validate action and reports counts and issues", () => {
    const { container } = renderWithUi(<ValidationPanel />, { editor: editorWithRequiredError() });

    fireEvent.click(required(container, '[data-nodera-validation-action="validate"]'));

    expect(container.querySelector("[data-nodera-validation-status]")).toBeNull();
    expect(count(container, "error")).toBe("1");
    expect(count(container, "warning")).toBe("0");
    expect(issueRows(container)).toHaveLength(1);

    const row = issueRow(container, "domain.property.required");
    expect(row.getAttribute("data-nodera-validation-severity")).toBe("error");
    expect(row.closest("[data-nodera-validation-group]")?.getAttribute(
      "data-nodera-validation-group",
    )).toBe("error");
    expect(
      row.querySelector("[data-nodera-validation-message]")?.textContent,
    ).toBe('Property "endpoint" is required but has no value');
  });

  it("selects the node an issue points at", () => {
    const editor = editorWithRequiredError();
    const { container } = renderWithUi(<ValidationPanel />, { editor });
    fireEvent.click(required(container, '[data-nodera-validation-action="validate"]'));

    const link = required(container, '[data-nodera-validation-element="node-1"]');
    expect(link.tagName).toBe("BUTTON");

    fireEvent.click(link);

    expect(editor.getSelectedNodes()).toEqual(["node-1"]);
  });

  it("selects the edge an issue points at", () => {
    const editor = createActionEditor();
    addActionNode(editor, { nodeId: "node-1", definitionId: REQUIRED_DEFINITION_ID });
    addActionNode(editor, { nodeId: "node-2", definitionId: REQUIRED_DEFINITION_ID });
    connectActionNodes(editor, { edgeId: "edge-1", from: "node-1", to: "node-2" });
    registerSeverityValidator(editor, [
      { code: "test.edge", severity: "warning", message: "Check the edge", elementId: "edge-1" },
      { code: "test.ghost", severity: "info", message: "Unknown element", elementId: "ghost-1" },
    ]);

    const { container } = renderWithUi(<ValidationPanel />, { editor });
    fireEvent.click(required(container, '[data-nodera-validation-action="validate"]'));

    fireEvent.click(required(container, '[data-nodera-validation-element="edge-1"]'));
    expect(editor.getSelectedEdges()).toEqual(["edge-1"]);

    fireEvent.click(required(container, '[data-nodera-validation-element="ghost-1"]'));
    expect(editor.getSelectedEdges()).toEqual(["edge-1"]);
    expect(editor.getSelectedNodes()).toEqual([]);
  });

  it("defers to the host selection handler when it provides one", () => {
    const editor = editorWithRequiredError();
    const onSelectElement = vi.fn();
    const { container } = renderWithUi(
      <ValidationPanel onSelectElement={onSelectElement} />,
      { editor },
    );
    fireEvent.click(required(container, '[data-nodera-validation-action="validate"]'));

    fireEvent.click(required(container, '[data-nodera-validation-element="node-1"]'));

    expect(onSelectElement).toHaveBeenCalledWith("node-1");
    expect(editor.getSelectedNodes()).toEqual([]);
  });

  it("reports a clean graph with the default and the host empty message", () => {
    const clean = renderWithUi(<ValidationPanel />, { editor: createActionEditor() });
    fireEvent.click(required(clean.container, '[data-nodera-validation-action="validate"]'));

    expect(required(clean.container, "[data-nodera-validation-empty]").textContent).toBe(
      "No validation issues",
    );
    expect(issueRows(clean.container)).toHaveLength(0);
    cleanup();

    const custom = renderWithUi(<ValidationPanel emptyMessage="Nothing to report" />, {
      editor: createActionEditor(),
    });
    fireEvent.click(
      required(custom.container, '[data-nodera-validation-action="validate"]'),
    );

    expect(required(custom.container, "[data-nodera-validation-empty]").textContent).toBe(
      "Nothing to report",
    );
  });

  it("groups issues per severity and counts each one", () => {
    const editor = editorWithRequiredError();
    registerSeverityValidator(editor, [
      { code: "test.warning", severity: "warning", message: "Review this", elementId: "node-1" },
      { code: "test.info", severity: "info", message: "Worth knowing" },
    ]);
    const { container } = renderWithUi(<ValidationPanel />, { editor });

    fireEvent.click(required(container, '[data-nodera-validation-action="validate"]'));

    expect(count(container, "error")).toBe("1");
    expect(count(container, "warning")).toBe("1");
    expect(count(container, "info")).toBe("1");
    expect(
      [...container.querySelectorAll("[data-nodera-validation-group]")].map((element) =>
        element.getAttribute("data-nodera-validation-group"),
      ),
    ).toEqual(["error", "warning", "info"]);
    expect(issueRows(container)).toHaveLength(3);
    expect(issueRow(container, "test.info").querySelector("[data-nodera-validation-element]")).toBeNull();
  });

  it("keeps every issue reachable by keyboard", () => {
    const { container } = renderWithUi(<ValidationPanel />, {
      editor: editorWithRequiredError(),
    });

    fireEvent.click(required(container, '[data-nodera-validation-action="validate"]'));

    const row = issueRows(container)[0];
    expect(row).toBeDefined();
    expect(row?.getAttribute("tabindex")).toBe("0");
    expect(required(container, "[data-nodera-validation-element]").tagName).toBe("BUTTON");
  });

  it("announces the validation results politely", () => {
    const { container } = renderWithUi(<ValidationPanel />, { editor: editorWithRequiredError() });

    fireEvent.click(required(container, '[data-nodera-validation-action="validate"]'));

    // The report region is a live region, so assistive technology reads the
    // counts and the issues a validation produced without a focus change.
    const panel = required<HTMLElement>(container, "[data-nodera-validation-panel]");
    expect(panel.getAttribute("aria-live")).toBe("polite");
    expect(panel.getAttribute("aria-atomic")).toBe("true");
    expect(issueRows(panel)).toHaveLength(1);
  });

  it("validates on mount and on every graph change when autoValidate is on", () => {
    const editor = createActionEditor();
    const { container } = renderWithUi(<ValidationPanel autoValidate />, { editor });

    expect(container.querySelector("[data-nodera-validation-status]")).toBeNull();
    expect(count(container, "error")).toBe("0");

    act(() => {
      addActionNode(editor, { nodeId: "node-late", definitionId: REQUIRED_DEFINITION_ID });
    });

    expect(count(container, "error")).toBe("1");
    expect(issueRows(container)).toHaveLength(1);
  });

  it("does not validate on graph changes without autoValidate", () => {
    const editor = createActionEditor();
    const { container } = renderWithUi(<ValidationPanel />, { editor });

    act(() => {
      addActionNode(editor, { nodeId: "node-late", definitionId: REQUIRED_DEFINITION_ID });
    });

    expect(required(container, "[data-nodera-validation-status]").textContent).toBe(
      "Not validated yet",
    );
    expect(issueRows(container)).toHaveLength(0);
  });
});
