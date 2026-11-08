import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { updateGraphMetadata } from "@nodera/application";

import { MetadataPanel } from "./metadata-panel.js";
import { createInspectorEditor, renderInspector, required } from "./test-helpers.js";

afterEach(cleanup);

function seededEditor() {
  const editor = createInspectorEditor();
  updateGraphMetadata(editor, {
    metadata: {
      name: "Routing",
      description: "Daily routes",
      tags: ["alpha"],
    },
  });
  return editor;
}

describe("MetadataPanel", () => {
  it("shows the graph id and the current metadata", () => {
    const { container } = renderInspector(<MetadataPanel />, { editor: seededEditor() });

    expect(
      required<HTMLElement>(container, '[data-nodera-metadata="graph-id"]').textContent,
    ).toBe("graph-inspector-test");
    expect(screen.getByLabelText<HTMLInputElement>("Graph name").value).toBe("Routing");
    expect(screen.getByLabelText<HTMLInputElement>("Graph description").value).toBe(
      "Daily routes",
    );
    expect(screen.getByLabelText<HTMLInputElement>("Tags").value).toBe("alpha");
  });

  it("commits a rename through the use case in one history entry", () => {
    const editor = seededEditor();
    const entries = editor.history.size();
    renderInspector(<MetadataPanel />, { editor });

    fireEvent.change(screen.getByLabelText("Graph name"), {
      target: { value: "Routing v2" },
    });

    expect(editor.graph.metadata.name).toBe("Routing v2");
    expect(editor.graph.metadata.description).toBe("Daily routes");
    expect(editor.graph.metadata.tags).toEqual(["alpha"]);
    expect(editor.history.size()).toBe(entries + 1);
  });

  it("round-trips tags through the comma separated field", () => {
    const editor = seededEditor();
    renderInspector(<MetadataPanel />, { editor });

    const tags = screen.getByLabelText<HTMLInputElement>("Tags");
    fireEvent.change(tags, { target: { value: "a, b" } });
    expect(editor.graph.metadata.tags).toEqual(["a", "b"]);

    fireEvent.change(tags, { target: { value: "" } });
    expect(editor.graph.metadata.tags).toEqual([]);
  });

  it("clears the description instead of storing an empty string", () => {
    const editor = seededEditor();
    renderInspector(<MetadataPanel />, { editor });

    fireEvent.change(screen.getByLabelText("Graph description"), {
      target: { value: "" },
    });

    expect("description" in editor.graph.metadata).toBe(false);
    expect(editor.graph.metadata.name).toBe("Routing");
  });

  it("disables every input in read-only mode", () => {
    renderInspector(<MetadataPanel readOnly />, { editor: seededEditor() });

    const inputs = [...document.querySelectorAll<HTMLInputElement>("input, textarea")];
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input.disabled).toBe(true);
    }
  });
});
