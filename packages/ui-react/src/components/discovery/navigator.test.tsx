import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { selectEdge, selectNode } from "@nodera/application";

import { Navigator } from "./navigator.js";
import {
  addTestNode,
  connectTestNodes,
  createDiscoveryEditor,
  createDiscoveryStore,
  renderWithEditor,
  SINK_DEFINITION_ID,
  TRANSFORM_DEFINITION_ID,
} from "./test-helpers.js";

afterEach(cleanup);

function seededEditor() {
  const editor = createDiscoveryEditor();
  addTestNode(editor, { nodeId: "node-alpha", name: "Alpha" });
  addTestNode(editor, {
    nodeId: "node-beta",
    definitionId: TRANSFORM_DEFINITION_ID,
    name: "Beta",
  });
  connectTestNodes(editor, {
    edgeId: "edge-1",
    from: "node-alpha",
    to: "node-beta",
    label: "Approved path",
  });
  return editor;
}

function attributeValues(container: HTMLElement, attribute: string): readonly (string | null)[] {
  return [...container.querySelectorAll(`[${attribute}]`)].map((element) =>
    element.getAttribute(attribute),
  );
}

function requiredItem(container: HTMLElement, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}

describe("Navigator", () => {
  it("lists nodes with their label and definition name, and edges", () => {
    const { container } = renderWithEditor(<Navigator />, { editor: seededEditor() });

    expect(attributeValues(container, "data-nodera-navigator-node")).toEqual([
      "node-alpha",
      "node-beta",
    ]);
    expect(attributeValues(container, "data-nodera-navigator-edge")).toEqual(["edge-1"]);

    const alpha = requiredItem(container, '[data-nodera-navigator-node="node-alpha"]');
    expect(alpha.tagName).toBe("BUTTON");
    expect(alpha.textContent).toContain("Alpha");
    expect(alpha.textContent).toContain("Datasource");
    expect(
      requiredItem(container, '[data-nodera-navigator-edge="edge-1"]').textContent,
    ).toContain("Approved path");
  });

  it("hides the edge list when the host turns it off", () => {
    const { container } = renderWithEditor(<Navigator showEdges={false} />, {
      editor: seededEditor(),
    });

    expect(attributeValues(container, "data-nodera-navigator-edge")).toEqual([]);
    expect(attributeValues(container, "data-nodera-navigator-node")).toHaveLength(2);
  });

  it("narrows the list with the ui state search query", () => {
    const { container } = renderWithEditor(<Navigator />, {
      editor: seededEditor(),
      store: createDiscoveryStore("beta"),
    });

    expect(attributeValues(container, "data-nodera-navigator-node")).toEqual(["node-beta"]);
    expect(attributeValues(container, "data-nodera-navigator-edge")).toEqual([]);
  });

  it("renders No nodes for an empty graph without a query", () => {
    const { container } = renderWithEditor(<Navigator />, { editor: createDiscoveryEditor() });

    expect(container.querySelector("[data-nodera-navigator-empty]")?.textContent).toBe(
      "No nodes",
    );
  });

  it("renders No matching elements when the query matches nothing", () => {
    const { container } = renderWithEditor(<Navigator />, {
      editor: seededEditor(),
      store: createDiscoveryStore("nothing-matches"),
    });

    expect(container.querySelector("[data-nodera-navigator-empty]")?.textContent).toBe(
      "No matching elements",
    );
  });

  it("marks the selected node and edge", () => {
    const editor = seededEditor();
    const { container } = renderWithEditor(<Navigator />, { editor });

    act(() => {
      selectNode(editor, { nodeId: "node-beta" });
      selectEdge(editor, { edgeId: "edge-1", additive: true });
    });

    const beta = requiredItem(container, '[data-nodera-navigator-node="node-beta"]');
    expect(beta.getAttribute("aria-current")).toBe("true");
    expect(beta.className).toContain("nodera-navigator-selected");
    expect(
      requiredItem(container, '[data-nodera-navigator-edge="edge-1"]').getAttribute(
        "aria-current",
      ),
    ).toBe("true");
    expect(
      requiredItem(container, '[data-nodera-navigator-node="node-alpha"]').getAttribute(
        "aria-current",
      ),
    ).toBeNull();
  });

  it("selects a node and an edge through the editor commands", () => {
    const editor = seededEditor();
    const { container } = renderWithEditor(<Navigator />, { editor });

    fireEvent.click(requiredItem(container, '[data-nodera-navigator-node="node-alpha"]'));
    expect(editor.getSelectedNodes()).toEqual(["node-alpha"]);

    fireEvent.click(requiredItem(container, '[data-nodera-navigator-edge="edge-1"]'));
    expect(editor.getSelectedEdges()).toEqual(["edge-1"]);
  });

  it("reports activations to host callbacks instead of the commands", () => {
    const editor = seededEditor();
    const onSelectNode = vi.fn();
    const onSelectEdge = vi.fn();
    const { container } = renderWithEditor(
      <Navigator onSelectNode={onSelectNode} onSelectEdge={onSelectEdge} />,
      { editor },
    );

    fireEvent.click(requiredItem(container, '[data-nodera-navigator-node="node-alpha"]'));
    fireEvent.click(requiredItem(container, '[data-nodera-navigator-edge="edge-1"]'));

    expect(onSelectNode).toHaveBeenCalledWith("node-alpha");
    expect(onSelectEdge).toHaveBeenCalledWith("edge-1");
    expect(editor.getSelectedNodes()).toEqual([]);
    expect(editor.getSelectedEdges()).toEqual([]);
  });

  it("lists a node whose definition is no longer registered by its id", () => {
    const editor = seededEditor();
    addTestNode(editor, { nodeId: "node-orphan", definitionId: SINK_DEFINITION_ID });
    editor.domain.nodes.unregister(SINK_DEFINITION_ID);

    const { container } = renderWithEditor(<Navigator />, { editor });

    const orphan = requiredItem(container, '[data-nodera-navigator-node="node-orphan"]');
    expect(orphan.textContent).toContain("node-orphan");
  });
});
