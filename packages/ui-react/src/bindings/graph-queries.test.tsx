import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { addNode } from "@nodera/application";
import type { PropertyDefinition } from "@nodera/property-system";

import { createTestEditor, TEST_DEFINITION_ID } from "../test/fixtures.js";
import { useGraphQueries } from "./graph-queries.js";

afterEach(cleanup);

const PROPERTIES: readonly PropertyDefinition[] = [
  { id: "url", type: "string", label: "URL" },
  { id: "timeout", type: "number", label: "Timeout" },
];

describe("useGraphQueries", () => {
  it("reads node definitions and their property definitions", () => {
    const editor = createTestEditor(PROPERTIES);
    const { result } = renderHook(() => useGraphQueries(editor));

    expect(result.current.nodeDefinition(TEST_DEFINITION_ID)?.id).toBe(TEST_DEFINITION_ID);
    expect(result.current.nodeDefinition("missing.definition")).toBeUndefined();
    expect(result.current.nodeDefinitions().map((definition) => definition.id)).toEqual([
      TEST_DEFINITION_ID,
    ]);
    expect(result.current.propertyDefinitions("unknown-node")).toEqual([]);
  });

  it("reads live graph elements and their property definitions", () => {
    const editor = createTestEditor(PROPERTIES);
    const { result } = renderHook(() => useGraphQueries(editor));

    act(() => {
      addNode(editor, { definitionId: TEST_DEFINITION_ID, nodeId: "n1" });
    });

    expect(result.current.node("n1")?.id).toBe("n1");
    expect(result.current.node("ghost")).toBeUndefined();
    expect(result.current.propertyDefinitions("n1").map((definition) => definition.id)).toEqual([
      "url",
      "timeout",
    ]);
  });

  it("keeps a stable object identity across renders", () => {
    const editor = createTestEditor();
    const { result, rerender } = renderHook(() => useGraphQueries(editor));
    const first = result.current;

    act(() => {
      addNode(editor, { definitionId: TEST_DEFINITION_ID, nodeId: "n1" });
    });
    rerender();

    expect(result.current).toBe(first);
    expect(result.current.edge("ghost")).toBeUndefined();
    expect(result.current.edgeDefinitions()).toEqual([]);
    expect(result.current.edgeDefinition("missing.edge")).toBeUndefined();
  });
});
