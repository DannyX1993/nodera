import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { selectEdge, selectNode } from "@nodera/application";

import { createComponentRenderers } from "../../registries/component-registry.js";
import { PropertiesPanel } from "./properties-panel.js";
import {
  addInspectorNode,
  attributeValues,
  connectInspectorNodes,
  createInspectorEditor,
  createOptionSetEditor,
  INSPECTOR_NODE_DEFINITION_ID,
  OPTION_SET_DEFINITION_ID,
  renderInspector,
  required,
} from "./test-helpers.js";

afterEach(cleanup);

function propertyIds(container: HTMLElement): readonly (string | null)[] {
  return attributeValues(container, "data-nodera-property");
}

function groupIds(container: HTMLElement): readonly (string | null)[] {
  return attributeValues(container, "data-nodera-property-group");
}

function groupTitles(container: HTMLElement): readonly (string | null)[] {
  return [...container.querySelectorAll("[data-nodera-property-group-title]")].map(
    (element) => element.textContent,
  );
}

function optionValues(select: HTMLSelectElement): readonly string[] {
  return [...select.options]
    .map((option) => option.value)
    .filter((value) => value !== "");
}

function selectedEditor(properties: Readonly<Record<string, unknown>> = {}) {
  const editor = createInspectorEditor();
  addInspectorNode(editor, { nodeId: "node-1", properties });
  selectNode(editor, { nodeId: "node-1" });
  return editor;
}

describe("PropertiesPanel", () => {
  it("orders properties by order then declaration order and groups them", () => {
    const { container } = renderInspector(<PropertiesPanel />, { editor: selectedEditor() });

    expect(propertyIds(container)).toEqual([
      "endpoint",
      "retryDelay",
      "retries",
      "token",
      "payload",
      "widget",
      "mode",
      "fallback",
    ]);
    expect(groupIds(container)).toEqual(["connection", ""]);
    expect(groupTitles(container)).toEqual(["connection", "General"]);
    expect(
      container.querySelector('[data-nodera-property="secret"]'),
    ).toBeNull();
  });

  it("shows the core required message for a property without a value", () => {
    const { container } = renderInspector(<PropertiesPanel />, { editor: selectedEditor() });

    const issue = required<HTMLElement>(
      container,
      '[data-nodera-property="token"] [data-nodera-property-issue]',
    );
    expect(issue.textContent).toBe('Property "token" is required but has no value');
  });

  it("omits a property whose dynamic visibility condition does not hold", () => {
    const hidden = renderInspector(<PropertiesPanel />, {
      editor: selectedEditor({ mode: "fast" }),
    });
    expect(hidden.container.querySelector('[data-nodera-property="fallback"]')).toBeNull();
    cleanup();

    const shown = renderInspector(<PropertiesPanel />, {
      editor: selectedEditor({ mode: "safe" }),
    });
    expect(shown.container.querySelector('[data-nodera-property="fallback"]')).not.toBeNull();
  });

  it("shows the definition default value until the instance overrides it", () => {
    const byDefault = renderInspector(<PropertiesPanel />, { editor: selectedEditor() });
    const defaultSelect = required<HTMLSelectElement>(
      byDefault.container,
      '[data-nodera-property="mode"] select',
    );
    expect(defaultSelect.value).toBe("fast");
    cleanup();

    const overridden = renderInspector(<PropertiesPanel />, {
      editor: selectedEditor({ mode: "safe" }),
    });
    const select = required<HTMLSelectElement>(
      overridden.container,
      '[data-nodera-property="mode"] select',
    );
    expect(select.value).toBe("safe");
  });

  it("commits a change through the updateNodeProperties use case in one history entry", () => {
    const editor = selectedEditor();
    const entries = editor.history.size();
    const { container } = renderInspector(<PropertiesPanel />, { editor });

    const input = required<HTMLInputElement>(
      container,
      '[data-nodera-property="endpoint"] input',
    );
    fireEvent.change(input, { target: { value: "https://api.test" } });

    expect(editor.getNode("node-1")?.getProperties().endpoint).toBe("https://api.test");
    expect(editor.history.size()).toBe(entries + 1);
  });

  it("lets the host commit take precedence over the store", () => {
    const editor = selectedEditor();
    const entries = editor.history.size();
    const onChange = vi.fn();
    const { container } = renderInspector(<PropertiesPanel onChange={onChange} />, {
      editor,
    });

    const input = required<HTMLInputElement>(
      container,
      '[data-nodera-property="endpoint"] input',
    );
    fireEvent.change(input, { target: { value: "https://host.test" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("node-1", "endpoint", "https://host.test");
    expect(editor.getNode("node-1")?.getProperties().endpoint).toBeUndefined();
    expect(editor.history.size()).toBe(entries);
  });

  it("disables every renderer in read-only mode without hiding properties", () => {
    const { container } = renderInspector(<PropertiesPanel readOnly />, {
      editor: selectedEditor(),
    });

    expect(propertyIds(container)).toHaveLength(8);
    const controls = [...container.querySelectorAll<HTMLInputElement>("input, select, textarea")];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.disabled).toBe(true);
    }
  });

  it("reports invalid JSON inline without committing the value", () => {
    const editor = selectedEditor();
    const entries = editor.history.size();
    const { container } = renderInspector(<PropertiesPanel />, { editor });

    const textarea = required<HTMLTextAreaElement>(
      container,
      '[data-nodera-property="payload"] textarea',
    );
    fireEvent.change(textarea, { target: { value: '{"a":' } });

    expect(
      required<HTMLElement>(
        container,
        '[data-nodera-property="payload"] [data-nodera-property-issue]',
      ).textContent,
    ).toContain("Invalid JSON");
    expect(editor.getNode("node-1")?.getProperties().payload).toBeUndefined();
    expect(editor.history.size()).toBe(entries);
  });

  it("explains a custom property whose renderer the host did not register", () => {
    const { container } = renderInspector(<PropertiesPanel />, { editor: selectedEditor() });

    expect(
      required<HTMLElement>(container, '[data-nodera-property="widget"]').textContent,
    ).toContain('No renderer for custom property "widget"');
  });

  it("resolves a host renderer before the built-in fallback", () => {
    const renderers = createComponentRenderers();
    renderers.properties.register("acme.widget", () => (
      <span data-testid="host-widget">host widget</span>
    ));
    renderers.properties.register("string", () => (
      <span data-testid="host-string">host string</span>
    ));

    const { container } = renderInspector(<PropertiesPanel />, {
      editor: selectedEditor(),
      renderers,
    });

    expect(screen.getByTestId("host-widget")).toBeDefined();
    expect(screen.getAllByTestId("host-string").length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="host-widget"]')).not.toBeNull();
  });

  it("renders the edge label editor when the selection is an edge", () => {
    const editor = createInspectorEditor();
    addInspectorNode(editor, { nodeId: "node-1" });
    addInspectorNode(editor, { nodeId: "node-2" });
    connectInspectorNodes(editor, {
      edgeId: "edge-1",
      from: "node-1",
      to: "node-2",
      label: "approved",
    });
    selectEdge(editor, { edgeId: "edge-1" });
    const entries = editor.history.size();

    const { container } = renderInspector(<PropertiesPanel />, { editor });

    expect(container.textContent).toContain("Flow");
    const input = screen.getByLabelText<HTMLInputElement>("Edge label");
    expect(input.value).toBe("approved");

    fireEvent.change(input, { target: { value: "reviewed" } });
    expect(editor.getEdge("edge-1")?.label).toBe("reviewed");
    expect(editor.history.size()).toBe(entries + 1);
  });

  it("shows the empty message when nothing is selected", () => {
    const { container } = renderInspector(<PropertiesPanel />, {
      editor: createInspectorEditor(),
    });

    expect(
      required<HTMLElement>(container, "[data-nodera-properties-empty]").textContent,
    ).toBe("Select a node to edit its properties");
    expect(propertyIds(container)).toEqual([]);
    cleanup();

    const custom = renderInspector(<PropertiesPanel emptyMessage="Nothing here" />, {
      editor: createInspectorEditor(),
    });
    expect(custom.container.textContent).toContain("Nothing here");
  });

  it("takes the select options and the enabled state from the property system", () => {
    const fastEditor = createOptionSetEditor();
    addInspectorNode(fastEditor, {
      nodeId: "node-1",
      definitionId: OPTION_SET_DEFINITION_ID,
      properties: { mode: "fast" },
    });
    const fast = renderInspector(<PropertiesPanel nodeId="node-1" />, {
      editor: fastEditor,
    });

    const fastLevel = required<HTMLSelectElement>(
      fast.container,
      '[data-nodera-property="level"] select',
    );
    expect(optionValues(fastLevel)).toEqual(["low", "high"]);
    expect(fastLevel.disabled).toBe(true);
    cleanup();

    const safeEditor = createOptionSetEditor();
    addInspectorNode(safeEditor, {
      nodeId: "node-1",
      definitionId: OPTION_SET_DEFINITION_ID,
      properties: { mode: "safe" },
    });
    const safe = renderInspector(<PropertiesPanel nodeId="node-1" />, {
      editor: safeEditor,
    });

    const safeLevel = required<HTMLSelectElement>(
      safe.container,
      '[data-nodera-property="level"] select',
    );
    expect(optionValues(safeLevel)).toEqual(["strict", "loose"]);
    expect(safeLevel.disabled).toBe(false);
  });

  it("reports an unknown node definition read-only", () => {
    const editor = selectedEditor({ endpoint: "https://api.test" });
    editor.domain.nodes.unregister(INSPECTOR_NODE_DEFINITION_ID);

    const { container } = renderInspector(<PropertiesPanel />, { editor });

    expect(container.textContent).toContain(
      `Unknown node definition "${INSPECTOR_NODE_DEFINITION_ID}"`,
    );
    expect(container.textContent).toContain("https://api.test");
    expect(container.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });
});
