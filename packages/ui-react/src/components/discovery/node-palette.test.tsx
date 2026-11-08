import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NODE_DEFINITION_MIME_TYPE } from "@nodera/ui-core";

import { NodePalette } from "./node-palette.js";
import {
  DATASOURCE_DEFINITION_ID,
  DISCOVERY_DEFINITIONS,
  LOOSE_DEFINITION_ID,
  SINK_DEFINITION_ID,
  TRANSFORM_DEFINITION_ID,
  createDiscoveryEditor,
  renderWithEditor,
} from "./test-helpers.js";

afterEach(cleanup);

function requiredElement<T extends Element>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}

function itemIds(container: HTMLElement): readonly (string | null)[] {
  return [...container.querySelectorAll("[data-nodera-palette-item]")].map((element) =>
    element.getAttribute("data-nodera-palette-item"),
  );
}

describe("NodePalette", () => {
  it("renders one section per category with its definitions", () => {
    const editor = createDiscoveryEditor();
    const { container } = renderWithEditor(<NodePalette />, { editor });

    const categories = [...container.querySelectorAll("[data-nodera-palette-category]")].map(
      (element) => element.getAttribute("data-nodera-palette-category"),
    );
    expect(categories).toEqual(["sinks", "sources", "uncategorized"]);
    expect(itemIds(container)).toEqual([
      SINK_DEFINITION_ID,
      DATASOURCE_DEFINITION_ID,
      TRANSFORM_DEFINITION_ID,
      LOOSE_DEFINITION_ID,
    ]);
    expect(
      requiredElement(container, '[data-nodera-palette-category="sources"]').textContent,
    ).toContain("Datasource");
  });

  it("labels each item with the definition name", () => {
    const editor = createDiscoveryEditor();
    renderWithEditor(<NodePalette />, { editor });

    expect(screen.getByRole("button", { name: "Add Datasource" })).toBeDefined();
  });

  it("filters items by name, id and description, case-insensitively", () => {
    const editor = createDiscoveryEditor();
    const { container } = renderWithEditor(<NodePalette />, { editor });

    const filter = screen.getByPlaceholderText("Search nodes");

    fireEvent.change(filter, { target: { value: "TRANSFORM" } });
    expect(itemIds(container)).toEqual([TRANSFORM_DEFINITION_ID]);

    fireEvent.change(filter, { target: { value: "test.sink" } });
    expect(itemIds(container)).toEqual([SINK_DEFINITION_ID]);

    fireEvent.change(filter, { target: { value: "reads records" } });
    expect(itemIds(container)).toEqual([DATASOURCE_DEFINITION_ID]);
  });

  it("renders the empty message when the filter matches nothing", () => {
    const editor = createDiscoveryEditor();
    const { container } = renderWithEditor(<NodePalette />, { editor });

    fireEvent.change(screen.getByPlaceholderText("Search nodes"), {
      target: { value: "nothing-matches" },
    });

    expect(container.querySelector("[data-nodera-palette-item]")).toBeNull();
    expect(container.querySelector("[data-nodera-palette-empty]")?.textContent).toBe(
      "No node definitions",
    );
  });

  it("renders the host empty message", () => {
    const editor = createDiscoveryEditor();
    const { container } = renderWithEditor(
      <NodePalette emptyMessage="Nothing here" />,
      { editor },
    );

    fireEvent.change(screen.getByPlaceholderText("Search nodes"), {
      target: { value: "nothing-matches" },
    });

    expect(container.querySelector("[data-nodera-palette-empty]")?.textContent).toBe(
      "Nothing here",
    );
  });

  it("renders the empty message for a registry without definitions", () => {
    const editor = createDiscoveryEditor();
    for (const definition of editor.domain.nodes.all()) {
      editor.domain.nodes.unregister(definition.id);
    }

    const { container } = renderWithEditor(<NodePalette />, { editor });

    expect(container.querySelector("[data-nodera-palette-category]")).toBeNull();
    expect(container.querySelector("[data-nodera-palette-empty]")?.textContent).toBe(
      "No node definitions",
    );
  });

  it("writes the definition id under the node definition mime type on drag start", () => {
    const editor = createDiscoveryEditor();
    const { container } = renderWithEditor(<NodePalette />, { editor });

    const item = requiredElement<HTMLButtonElement>(
      container,
      `[data-nodera-palette-item="${DATASOURCE_DEFINITION_ID}"]`,
    );
    expect(item.draggable).toBe(true);

    const setData = vi.fn();
    const dataTransfer = { setData, effectAllowed: "none" };
    fireEvent.dragStart(item, { dataTransfer });

    expect(setData).toHaveBeenCalledWith(NODE_DEFINITION_MIME_TYPE, DATASOURCE_DEFINITION_ID);
    expect(dataTransfer.effectAllowed).toBe("copy");
  });

  it("tolerates a drag start without a data transfer", () => {
    const editor = createDiscoveryEditor();
    const { container } = renderWithEditor(<NodePalette />, { editor });

    const item = requiredElement(container, `[data-nodera-palette-item="${SINK_DEFINITION_ID}"]`);

    expect(() => fireEvent.dragStart(item)).not.toThrow();
  });

  it("reports the activated definition to the host callback instead of the editor", () => {
    const editor = createDiscoveryEditor();
    const onAddNode = vi.fn();
    const { container } = renderWithEditor(<NodePalette onAddNode={onAddNode} />, { editor });

    fireEvent.click(
      requiredElement(container, `[data-nodera-palette-item="${DATASOURCE_DEFINITION_ID}"]`),
    );

    expect(onAddNode).toHaveBeenCalledWith(DATASOURCE_DEFINITION_ID);
    expect(editor.graph.getNodes()).toHaveLength(0);
  });

  it("offers the host definitions instead of the registry ones when supplied", () => {
    const editor = createDiscoveryEditor();
    const { container } = renderWithEditor(
      <NodePalette
        definitions={DISCOVERY_DEFINITIONS.filter(
          (definition) => definition.id === SINK_DEFINITION_ID,
        )}
      />,
      { editor },
    );

    expect(itemIds(container)).toEqual([SINK_DEFINITION_ID]);
    expect(screen.getByPlaceholderText("Search nodes")).toBeDefined();
  });

  it("adds a node to the engine when the host supplies no callback", () => {
    const editor = createDiscoveryEditor();
    const { container } = renderWithEditor(<NodePalette />, { editor });

    fireEvent.click(
      requiredElement(container, `[data-nodera-palette-item="${TRANSFORM_DEFINITION_ID}"]`),
    );

    const nodes = editor.graph.getNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.definitionId).toBe(TRANSFORM_DEFINITION_ID);
  });

  it("leaves the graph untouched for a definition the engine cannot instantiate", () => {
    const editor = createDiscoveryEditor();
    editor.domain.nodes.register({
      id: "broken",
      name: "Broken",
      category: "sources",
      version: "1.0.0",
      ports: [],
      properties: [],
    });

    const { container } = renderWithEditor(<NodePalette />, { editor });
    fireEvent.click(requiredElement(container, '[data-nodera-palette-item="broken"]'));

    expect(editor.graph.getNodes()).toHaveLength(0);
  });
});
