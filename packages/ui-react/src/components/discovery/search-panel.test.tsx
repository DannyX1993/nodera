import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SearchPanel } from "./search-panel.js";
import {
  addTestNode,
  connectTestNodes,
  createDiscoveryEditor,
  createDiscoveryStore,
  renderWithEditor,
} from "./test-helpers.js";

afterEach(cleanup);

function seededEditor() {
  const editor = createDiscoveryEditor();
  addTestNode(editor, { nodeId: "node-alpha", name: "Alpha" });
  addTestNode(editor, { nodeId: "node-beta", name: "Beta" });
  addTestNode(editor, { nodeId: "node-gamma", name: "Gamma" });
  connectTestNodes(editor, {
    edgeId: "edge-1",
    from: "node-alpha",
    to: "node-beta",
    label: "Approved path",
  });
  return editor;
}

function required<T extends Element>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}

function results(container: HTMLElement): readonly (string | null)[] {
  return [...container.querySelectorAll("[data-nodera-search-result]")].map((element) =>
    element.getAttribute("data-nodera-search-result"),
  );
}

function searchInput(): HTMLInputElement {
  return screen.getByLabelText("Search graph") as HTMLInputElement;
}

describe("SearchPanel", () => {
  it("binds the input to the ui state search query", () => {
    const store = createDiscoveryStore();
    renderWithEditor(<SearchPanel />, { editor: seededEditor(), store });

    expect(searchInput().value).toBe("");

    fireEvent.change(searchInput(), { target: { value: "alpha" } });

    expect(store.getState().searchQuery).toBe("alpha");
    expect(searchInput().value).toBe("alpha");
  });

  it("uses the host placeholder", () => {
    renderWithEditor(<SearchPanel placeholder="Find things" />, {
      editor: seededEditor(),
    });

    expect(screen.getByPlaceholderText("Find things")).toBeDefined();
  });

  it("lists the node results of the current query", () => {
    const { container } = renderWithEditor(<SearchPanel />, {
      editor: seededEditor(),
      store: createDiscoveryStore("alpha"),
    });

    expect(results(container)).toEqual(["node-alpha"]);
    expect(
      required(container, '[data-nodera-search-result="node-alpha"]').getAttribute(
        "data-nodera-search-result-kind",
      ),
    ).toBe("node");
  });

  it("shows the helper text while the query is empty", () => {
    const { container } = renderWithEditor(<SearchPanel />, {
      editor: seededEditor(),
      store: createDiscoveryStore(),
    });

    expect(required(container, "[data-nodera-search-hint]").textContent).toBe(
      "Type to search nodes and edges",
    );
    expect(results(container)).toEqual([]);
    expect(container.querySelector("[data-nodera-search-clear]")).toBeNull();
  });

  it("offers a clear button that empties the query", () => {
    const store = createDiscoveryStore("alpha");
    const { container } = renderWithEditor(<SearchPanel />, {
      editor: seededEditor(),
      store,
    });

    fireEvent.click(required(container, "[data-nodera-search-clear]"));

    expect(store.getState().searchQuery).toBe("");
    expect(searchInput().value).toBe("");
    expect(container.querySelector("[data-nodera-search-clear]")).toBeNull();
  });

  it("renders the empty state when nothing matches", () => {
    const { container } = renderWithEditor(<SearchPanel />, {
      editor: seededEditor(),
      store: createDiscoveryStore("nothing-matches"),
    });

    expect(required(container, "[data-nodera-search-empty]").textContent).toBe(
      "No matching elements",
    );
  });

  it("reports truncation when the limit cuts the results", () => {
    const editor = createDiscoveryEditor();
    for (let index = 0; index < 25; index += 1) {
      addTestNode(editor, { nodeId: `node-${index}`, name: `Node ${index}` });
    }
    const { container } = renderWithEditor(<SearchPanel />, {
      editor,
      store: createDiscoveryStore("node"),
    });

    expect(results(container)).toHaveLength(20);
    expect(required(container, "[data-nodera-search-truncated]").textContent).toBe(
      "Showing the first 20 matches",
    );
  });

  it("omits the truncation line when every match fits", () => {
    const { container } = renderWithEditor(<SearchPanel />, {
      editor: seededEditor(),
      store: createDiscoveryStore("alpha"),
    });

    expect(container.querySelector("[data-nodera-search-truncated]")).toBeNull();
  });

  it("selects a node result through the editor commands", () => {
    const editor = seededEditor();
    const { container } = renderWithEditor(<SearchPanel />, {
      editor,
      store: createDiscoveryStore("beta"),
    });

    fireEvent.click(required(container, '[data-nodera-search-result="node-beta"]'));

    expect(editor.getSelectedNodes()).toEqual(["node-beta"]);
  });

  it("selects an edge result through the editor commands", () => {
    const editor = seededEditor();
    const { container } = renderWithEditor(<SearchPanel />, {
      editor,
      store: createDiscoveryStore("approved"),
    });

    const edge = required(container, '[data-nodera-search-result="edge-1"]');
    expect(edge.getAttribute("data-nodera-search-result-kind")).toBe("edge");

    fireEvent.click(edge);

    expect(editor.getSelectedEdges()).toEqual(["edge-1"]);
  });

  it("re-narrows the results when the query changes", () => {
    const { container } = renderWithEditor(<SearchPanel />, {
      editor: seededEditor(),
      store: createDiscoveryStore(),
    });

    fireEvent.change(searchInput(), { target: { value: "gamma" } });
    expect(results(container)).toEqual(["node-gamma"]);

    fireEvent.change(searchInput(), { target: { value: "" } });
    expect(results(container)).toEqual([]);
    expect(required(container, "[data-nodera-search-hint]").textContent).toBe(
      "Type to search nodes and edges",
    );
  });
});
