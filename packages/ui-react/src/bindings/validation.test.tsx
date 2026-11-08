import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { addNode, validateGraph } from "@nodera/application";
import type { PropertyDefinition } from "@nodera/property-system";

import { createTestEditor, TEST_DEFINITION_ID } from "../test/fixtures.js";
import { useValidation } from "./validation.js";

afterEach(cleanup);

const REQUIRED_PROPERTIES: readonly PropertyDefinition[] = [
  { id: "url", type: "string", label: "URL", required: true },
];

describe("useValidation", () => {
  it("starts without a report", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useValidation(editor));

    expect(result.current.report).toBeUndefined();
    expect(result.current.issues).toEqual([]);
  });

  it("reports the issues of the report produced by revalidate", () => {
    const editor = createTestEditor(REQUIRED_PROPERTIES);
    act(() => {
      addNode(editor, { definitionId: TEST_DEFINITION_ID, nodeId: "n1" });
    });
    const { result } = renderHook(() => useValidation(editor));

    act(() => {
      result.current.revalidate();
    });

    expect(result.current.report).toBeDefined();
    expect(result.current.issues.length).toBeGreaterThan(0);
    expect(result.current.issues).toEqual(result.current.report?.issues);
    expect(result.current.issues[0]?.elementId).toBe("n1");
    expect(result.current.report?.isValid).toBe(false);
  });

  it("refreshes when another surface completes a validation run", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useValidation(editor));

    act(() => {
      validateGraph(editor);
    });

    expect(result.current.report).toBeDefined();
    expect(result.current.report?.isValid).toBe(true);
    expect(result.current.issues).toEqual([]);
  });
});
