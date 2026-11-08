import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PropertyType } from "@nodera/property-system";
import { PROPERTY_TYPES } from "@nodera/property-system";

import {
  createComponentRenderers,
  type ComponentRegistry,
  type PropertyRendererProps,
} from "../../../registries/component-registry.js";
import { createDefaultPropertyRenderers, defaultPropertyRenderer } from "./defaults.js";
import {
  adHocProperty,
  inspectorProperty,
  renderProperty,
  required,
} from "../test-helpers.js";

afterEach(cleanup);

/** Types that own an interactive control (a `custom` property has none by default). */
const CONTROL_TYPES: readonly PropertyType[] = PROPERTY_TYPES.filter(
  (type) => type !== "custom",
);

describe("default property renderers", () => {
  it("registers a renderer for every property type", () => {
    const renderers: ComponentRegistry<PropertyRendererProps> =
      createDefaultPropertyRenderers();

    expect(renderers.listIds()).toEqual([...PROPERTY_TYPES]);
    expect(renderers.size).toBe(PROPERTY_TYPES.length);
    for (const type of PROPERTY_TYPES) {
      expect(typeof defaultPropertyRenderer(type)).toBe("function");
    }
  });

  it.each(CONTROL_TYPES)(
    "renders one labelled control for the %s type",
    (type) => {
      const { container } = renderProperty({
        definition: adHocProperty("probe", type, {
          label: "Probe",
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        }),
      });

      const wrapper = required<HTMLElement>(container, '[data-nodera-property="probe"]');
      expect(wrapper.getAttribute("data-nodera-property-type")).toBe(type);
      expect(container.querySelectorAll("input, select, textarea").length).toBeGreaterThan(0);
      // Every control is named after the property label, either directly
      // (single control) or through the option group (multi-select).
      expect(wrapper.querySelector('[aria-label="Probe"]')).not.toBeNull();
    },
  );

  it("renders a text input for string properties and reports the typed value", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: inspectorProperty("endpoint"),
      value: "https://a.test",
      onChange,
    });

    const input = required<HTMLInputElement>(
      container,
      '[data-nodera-property="endpoint"] input[type="text"]',
    );
    expect(input.getAttribute("aria-label")).toBe("Endpoint");
    expect(input.value).toBe("https://a.test");

    fireEvent.change(input, { target: { value: "https://b.test" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("https://b.test");
  });

  it("renders a number input honouring the declared min and max validations", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: inspectorProperty("retries"),
      value: 2,
      onChange,
    });

    const input = required<HTMLInputElement>(
      container,
      '[data-nodera-property="retries"] input[type="number"]',
    );
    expect(input.min).toBe("0");
    expect(input.max).toBe("5");
    expect(input.value).toBe("2");

    fireEvent.change(input, { target: { value: "4" } });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("renders a checkbox for boolean properties", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: adHocProperty("enabled", "boolean", { label: "Enabled" }),
      value: false,
      onChange,
    });

    const input = required<HTMLInputElement>(
      container,
      '[data-nodera-property="enabled"] input[type="checkbox"]',
    );
    expect(input.checked).toBe(false);

    fireEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders a select over the declared options", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: inspectorProperty("mode"),
      value: "safe",
      onChange,
    });

    const select = required<HTMLSelectElement>(
      container,
      '[data-nodera-property="mode"] select',
    );
    expect(select.value).toBe("safe");
    expect([...select.options].map((option) => option.value)).toEqual(["fast", "safe"]);

    fireEvent.change(select, { target: { value: "fast" } });
    expect(onChange).toHaveBeenCalledWith("fast");
  });

  it("renders a checkbox group for multi-select properties", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: adHocProperty("targets", "multi-select", {
        label: "Targets",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      }),
      value: ["a"],
      onChange,
    });

    const first = required<HTMLInputElement>(
      container,
      '[data-nodera-property="targets"] [data-nodera-property-option="a"] input',
    );
    const second = required<HTMLInputElement>(
      container,
      '[data-nodera-property="targets"] [data-nodera-property-option="b"] input',
    );
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);

    fireEvent.click(second);
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    fireEvent.click(first);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("renders a textarea for textarea properties", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: adHocProperty("notes", "textarea", { label: "Notes" }),
      value: "hello",
      onChange,
    });

    const textarea = required<HTMLTextAreaElement>(
      container,
      '[data-nodera-property="notes"] textarea',
    );
    expect(textarea.value).toBe("hello");

    fireEvent.change(textarea, { target: { value: "hello world" } });
    expect(onChange).toHaveBeenCalledWith("hello world");
  });

  it("passes code-editor text through unchanged", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: adHocProperty("script", "code-editor", { label: "Script" }),
      value: "const a = 1;",
      onChange,
    });

    const textarea = required<HTMLTextAreaElement>(
      container,
      '[data-nodera-property="script"] textarea',
    );
    fireEvent.change(textarea, { target: { value: "return 2;" } });
    expect(onChange).toHaveBeenCalledWith("return 2;");
  });

  it("stores json-editor text as the serialized string the core contract expects and reports invalid JSON inline", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: adHocProperty("config", "json-editor", { label: "Config" }),
      value: '{"a":1}',
      onChange,
    });

    const textarea = required<HTMLTextAreaElement>(
      container,
      '[data-nodera-property="config"] textarea',
    );
    fireEvent.change(textarea, { target: { value: '{"b":2}' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('{"b":2}');

    fireEvent.change(textarea, { target: { value: '{"b":' } });
    expect(onChange).toHaveBeenCalledTimes(1);

    const issue = required<HTMLElement>(
      container,
      '[data-nodera-property="config"] [data-nodera-property-issue]',
    );
    expect(issue.textContent).toContain("Invalid JSON");
    expect(issue.getAttribute("aria-label")).toBe("Config");
  });

  it("commits object and array properties as parsed structures", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: adHocProperty("config", "object", { label: "Config" }),
      value: { a: 1 },
      onChange,
    });

    const textarea = required<HTMLTextAreaElement>(
      container,
      '[data-nodera-property="config"] textarea',
    );
    fireEvent.change(textarea, { target: { value: '{"b":2}' } });
    expect(onChange).toHaveBeenCalledWith({ b: 2 });
  });

  it("passes yaml-editor text through unchanged", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: adHocProperty("manifest", "yaml-editor", { label: "Manifest" }),
      value: "a: 1",
      onChange,
    });

    const textarea = required<HTMLTextAreaElement>(
      container,
      '[data-nodera-property="manifest"] textarea',
    );
    fireEvent.change(textarea, { target: { value: "a: 2" } });
    expect(onChange).toHaveBeenCalledWith("a: 2");
  });

  it("renders a date input with a YYYY-MM-DD value", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: adHocProperty("due", "date", { label: "Due" }),
      value: "2024-05-06",
      onChange,
    });

    const input = required<HTMLInputElement>(
      container,
      '[data-nodera-property="due"] input[type="date"]',
    );
    expect(input.value).toBe("2024-05-06");

    fireEvent.change(input, { target: { value: "2024-05-07" } });
    expect(onChange).toHaveBeenCalledWith("2024-05-07");
  });

  it("renders a datetime-local input for datetime properties", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: adHocProperty("at", "datetime", { label: "At" }),
      value: "2024-05-06T10:30",
      onChange,
    });

    const input = required<HTMLInputElement>(
      container,
      '[data-nodera-property="at"] input[type="datetime-local"]',
    );
    expect(input.value).toBe("2024-05-06T10:30");

    fireEvent.change(input, { target: { value: "2024-05-06T11:00" } });
    expect(onChange).toHaveBeenCalledWith("2024-05-06T11:00");
  });

  it("renders a color input for color properties", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: adHocProperty("accent", "color", { label: "Accent" }),
      value: "#00ff00",
      onChange,
    });

    const input = required<HTMLInputElement>(
      container,
      '[data-nodera-property="accent"] input[type="color"]',
    );
    expect(input.value).toBe("#00ff00");

    fireEvent.change(input, { target: { value: "#ff0000" } });
    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("renders a text input for file-reference properties and never a file object", () => {
    const onChange = vi.fn();
    const { container } = renderProperty({
      definition: adHocProperty("upload", "file-reference", { label: "Upload" }),
      value: "assets/diagram.png",
      onChange,
    });

    const input = required<HTMLInputElement>(
      container,
      '[data-nodera-property="upload"] input[type="text"]',
    );
    expect(input.value).toBe("assets/diagram.png");

    fireEvent.change(input, { target: { value: "assets/other.png" } });
    expect(onChange).toHaveBeenCalledWith("assets/other.png");
  });

  it("parses object and array properties from JSON text", () => {
    const objectOnChange = vi.fn();
    const objectRender = renderProperty({
      definition: adHocProperty("settings", "object", { label: "Settings" }),
      value: { a: 1 },
      onChange: objectOnChange,
    });
    const objectTextarea = required<HTMLTextAreaElement>(
      objectRender.container,
      '[data-nodera-property="settings"] textarea',
    );
    expect(JSON.parse(objectTextarea.value)).toEqual({ a: 1 });
    fireEvent.change(objectTextarea, { target: { value: '{"a":2}' } });
    expect(objectOnChange).toHaveBeenCalledWith({ a: 2 });
    cleanup();

    const arrayOnChange = vi.fn();
    const arrayRender = renderProperty({
      definition: adHocProperty("items", "array", { label: "Items" }),
      value: [1, 2],
      onChange: arrayOnChange,
    });
    const arrayTextarea = required<HTMLTextAreaElement>(
      arrayRender.container,
      '[data-nodera-property="items"] textarea',
    );
    expect(JSON.parse(arrayTextarea.value)).toEqual([1, 2]);
    fireEvent.change(arrayTextarea, { target: { value: "[1,2,3]" } });
    expect(arrayOnChange).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("explains that a custom property has no renderer", () => {
    const { container } = renderProperty({
      definition: inspectorProperty("widget"),
      value: "anything",
    });

    const wrapper = required<HTMLElement>(container, '[data-nodera-property="widget"]');
    expect(wrapper.textContent).toContain('No renderer for custom property "widget"');
    expect(container.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });

  it("renders the host component registered for a custom property component id", () => {
    const renderers = createComponentRenderers();
    renderers.properties.register("acme.widget", () => (
      <span data-testid="acme-widget">host widget</span>
    ));

    const { container } = renderProperty({
      definition: inspectorProperty("widget"),
      value: "anything",
      renderers,
    });

    expect(container.querySelector('[data-testid="acme-widget"]')).not.toBeNull();
  });

  it.each(CONTROL_TYPES)("disables every %s control when disabled", (type) => {
    const { container } = renderProperty({
      definition: adHocProperty("probe", type, {
        label: "Probe",
        options: [{ value: "a", label: "A" }],
      }),
      disabled: true,
    });

    const controls = [...container.querySelectorAll<HTMLInputElement>("input, select, textarea")];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.disabled).toBe(true);
    }
  });

  it("renders the core validation issues under the property", () => {
    const { container } = renderProperty({
      definition: inspectorProperty("token"),
      issues: [
        {
          code: "property.required",
          severity: "error",
          message: 'Property "token" is required but has no value',
        },
      ],
    });

    const issue = required<HTMLElement>(
      container,
      '[data-nodera-property="token"] [data-nodera-property-issue="property.required"]',
    );
    expect(issue.getAttribute("data-nodera-property-issue-severity")).toBe("error");
    expect(issue.getAttribute("aria-label")).toBe("Token");
    expect(issue.textContent).toBe('Property "token" is required but has no value');
  });
});
