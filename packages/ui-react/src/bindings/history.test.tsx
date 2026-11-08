import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { addNode } from "@nodera/application";

import { createTestEditor, TEST_DEFINITION_ID } from "../test/fixtures.js";
import { useHistory } from "./history.js";

afterEach(cleanup);

describe("useHistory", () => {
  it("reports an empty history for an untouched editor", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useHistory(editor));

    expect(result.current.labels).toEqual([]);
    expect(result.current.undoSize).toBe(0);
    expect(result.current.redoSize).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("tracks labels and cursors after a change and after undo", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useHistory(editor));

    act(() => {
      addNode(editor, { definitionId: TEST_DEFINITION_ID, nodeId: "n1" });
    });

    expect(result.current.labels).toEqual(["add-node"]);
    expect(result.current.undoSize).toBe(1);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.undo();
    });

    expect(result.current.undoSize).toBe(0);
    expect(result.current.redoSize).toBe(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(editor.graph.getNodes()).toHaveLength(0);

    act(() => {
      result.current.redo();
    });

    expect(result.current.undoSize).toBe(1);
    expect(result.current.canRedo).toBe(false);
    expect(editor.graph.getNodes()).toHaveLength(1);
  });
});
