import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { selectEdge, selectNode } from "@nodera/application";

import { InspectorPanel } from "./inspector-panel.js";
import {
  addInspectorNode,
  attributeValues,
  connectInspectorNodes,
  createInspectorEditor,
  required,
  renderInspector,
} from "./test-helpers.js";

afterEach(cleanup);

function rowValues(container: HTMLElement): Readonly<Record<string, string>> {
  const rows: Record<string, string> = {};
  for (const row of container.querySelectorAll<HTMLElement>("[data-nodera-inspector-row]")) {
    const key = row.getAttribute("data-nodera-inspector-row");
    const value = row.querySelector("dd");
    if (key !== null) {
      rows[key] = value?.textContent ?? "";
    }
  }
  return rows;
}

function seededEditor() {
  const editor = createInspectorEditor();
  addInspectorNode(editor, {
    nodeId: "node-1",
    properties: { endpoint: "https://api.test", mode: "safe" },
    position: { x: 10, y: 20 },
    metadata: { name: "First" },
  });
  addInspectorNode(editor, { nodeId: "node-2", position: { x: 40, y: 50 } });
  connectInspectorNodes(editor, {
    edgeId: "edge-1",
    from: "node-1",
    to: "node-2",
    label: "approved",
  });
  return editor;
}

describe("InspectorPanel", () => {
  it("renders the node structure with ids, position, metadata and ports", () => {
    const { container } = renderInspector(<InspectorPanel nodeId="node-1" />, {
      editor: seededEditor(),
    });

    expect(container.querySelector('[data-nodera-inspector="node"]')).not.toBeNull();
    expect(rowValues(container)).toMatchObject({
      id: "node-1",
      definition: "test.inspectable",
      version: "2.1.0",
      "position-x": "10",
      "position-y": "20",
      "metadata-name": "First",
    });

    expect(attributeValues(container, "data-nodera-inspector-port")).toEqual(["in", "out"]);
    const input = required<HTMLElement>(container, '[data-nodera-inspector-port="in"]');
    expect(input.getAttribute("data-nodera-inspector-port-direction")).toBe("input");
    expect(input.getAttribute("data-nodera-inspector-port-data-type")).toBe("string");
    expect(input.textContent).toContain("input");
    expect(input.textContent).toContain("string");

    const output = required<HTMLElement>(container, '[data-nodera-inspector-port="out"]');
    expect(output.getAttribute("data-nodera-inspector-port-direction")).toBe("output");
    expect(output.getAttribute("data-nodera-inspector-port-data-type")).toBe("number");
  });

  it("shows the raw property values as JSON text", () => {
    const { container } = renderInspector(<InspectorPanel nodeId="node-1" />, {
      editor: seededEditor(),
    });

    const raw = required<HTMLElement>(container, "[data-nodera-inspector-raw-properties]");
    expect(JSON.parse(raw.textContent ?? "")).toEqual({
      endpoint: "https://api.test",
      mode: "safe",
    });
  });

  it("hides the raw properties when the host turns them off", () => {
    const { container } = renderInspector(
      <InspectorPanel nodeId="node-1" showRawProperties={false} />,
      { editor: seededEditor() },
    );

    expect(container.querySelector("[data-nodera-inspector-raw-properties]")).toBeNull();
    expect(container.querySelectorAll("[data-nodera-inspector-port]")).toHaveLength(2);
  });

  it("renders the edge structure with endpoints and label", () => {
    const { container } = renderInspector(<InspectorPanel edgeId="edge-1" />, {
      editor: seededEditor(),
    });

    expect(container.querySelector('[data-nodera-inspector="edge"]')).not.toBeNull();
    expect(rowValues(container)).toMatchObject({
      id: "edge-1",
      definition: "test.flow",
      label: "approved",
      source: "node-1:out",
      target: "node-2:in",
    });
  });

  it("follows the editor selection when no id is given", () => {
    const nodeEditor = seededEditor();
    selectNode(nodeEditor, { nodeId: "node-1" });
    const nodeView = renderInspector(<InspectorPanel />, { editor: nodeEditor });
    expect(nodeView.container.querySelector('[data-nodera-inspector="node"]')).not.toBeNull();
    cleanup();

    const edgeEditor = seededEditor();
    selectEdge(edgeEditor, { edgeId: "edge-1" });
    const edgeView = renderInspector(<InspectorPanel />, { editor: edgeEditor });
    expect(edgeView.container.querySelector('[data-nodera-inspector="edge"]')).not.toBeNull();
  });

  it("renders no inputs and no mutations", () => {
    const editor = seededEditor();
    const entries = editor.history.size();
    const { container } = renderInspector(<InspectorPanel nodeId="node-1" />, { editor });

    expect(container.querySelectorAll("input, select, textarea, button")).toHaveLength(0);
    expect(editor.history.size()).toBe(entries);
  });

  it("shows the empty message when nothing is selected or the id is unknown", () => {
    const empty = renderInspector(<InspectorPanel />, { editor: seededEditor() });
    expect(empty.container.textContent).toContain("Select a node or edge to inspect");
    cleanup();

    const unknown = renderInspector(<InspectorPanel nodeId="node-missing" />, {
      editor: seededEditor(),
    });
    expect(unknown.container.textContent).toContain("Select a node or edge to inspect");
  });
});
