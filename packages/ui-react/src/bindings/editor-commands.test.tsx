import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addNode, createEdge, selectNode } from "@nodera/application";
import { createEdgeId } from "@nodera/contracts";

import { createTestEditor, TEST_DEFINITION_ID } from "../test/fixtures.js";
import { useEditorCommands } from "./editor-commands.js";

afterEach(cleanup);

describe("useEditorCommands", () => {
  it("adds a node through the add-node command", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));

    let executed = false;
    act(() => {
      executed = result.current({ kind: "add-node", definitionId: TEST_DEFINITION_ID });
    });

    expect(executed).toBe(true);
    expect(editor.graph.getNodes()).toHaveLength(1);
  });

  it("reports false when the add-node command cannot execute", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));

    let executed = true;
    act(() => {
      executed = result.current({ kind: "add-node", definitionId: "missing.definition" });
    });

    expect(executed).toBe(false);
    expect(editor.graph.getNodes()).toHaveLength(0);
  });

  it("undoes and redoes through the history commands", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));
    act(() => {
      result.current({ kind: "add-node", definitionId: TEST_DEFINITION_ID });
    });

    let undone = false;
    act(() => {
      undone = result.current({ kind: "undo" });
    });
    expect(undone).toBe(true);
    expect(editor.graph.getNodes()).toHaveLength(0);

    let redone = false;
    act(() => {
      redone = result.current({ kind: "redo" });
    });
    expect(redone).toBe(true);
    expect(editor.graph.getNodes()).toHaveLength(1);

    act(() => {
      expect(result.current({ kind: "undo" })).toBe(true);
      expect(result.current({ kind: "undo" })).toBe(false);
    });
  });

  it("deletes the selected nodes and clears the selection", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));
    act(() => {
      result.current({ kind: "add-node", definitionId: TEST_DEFINITION_ID });
    });
    const nodeId = editor.graph.getNodes()[0]?.id as string;
    act(() => {
      selectNode(editor, { nodeId });
    });

    let executed = false;
    act(() => {
      executed = result.current({ kind: "delete-selection" });
    });

    expect(executed).toBe(true);
    expect(editor.graph.getNodes()).toHaveLength(0);
    expect(editor.getSelectedNodes()).toEqual([]);
  });

  it("copies and pastes the selection", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));
    act(() => {
      result.current({ kind: "add-node", definitionId: TEST_DEFINITION_ID });
    });
    const nodeId = editor.graph.getNodes()[0]?.id as string;
    act(() => {
      selectNode(editor, { nodeId });
    });

    let copied = false;
    act(() => {
      copied = result.current({ kind: "copy-selection" });
    });
    expect(copied).toBe(true);
    expect(editor.getClipboard()).toHaveLength(1);

    let pasted = false;
    act(() => {
      pasted = result.current({ kind: "paste-selection" });
    });
    expect(pasted).toBe(true);
    expect(editor.graph.getNodes()).toHaveLength(2);
  });

  it("cuts the selection into the clipboard", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));
    act(() => {
      result.current({ kind: "add-node", definitionId: TEST_DEFINITION_ID });
    });
    const nodeId = editor.graph.getNodes()[0]?.id as string;
    act(() => {
      selectNode(editor, { nodeId });
    });

    let cut = false;
    act(() => {
      cut = result.current({ kind: "cut-selection" });
    });

    expect(cut).toBe(true);
    expect(editor.graph.getNodes()).toHaveLength(0);
    expect(editor.getClipboard()).toHaveLength(1);
  });

  it("runs the validate command and emits the validation report", () => {
    const editor = createTestEditor();
    const onCompleted = vi.fn();
    editor.events.subscribe("validation.completed", onCompleted);
    const { result } = renderHook(() => useEditorCommands(editor));

    let executed = false;
    act(() => {
      executed = result.current({ kind: "validate" });
    });

    expect(executed).toBe(true);
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  it("selects nodes, edges and clears the selection", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));
    act(() => {
      result.current({ kind: "add-node", definitionId: TEST_DEFINITION_ID });
    });
    const nodeId = editor.graph.getNodes()[0]?.id as string;

    act(() => {
      expect(result.current({ kind: "select-node", nodeId })).toBe(true);
    });
    expect(editor.getSelectedNodes()).toEqual([nodeId]);

    act(() => {
      expect(result.current({ kind: "select-node", nodeId: "ghost" })).toBe(false);
    });

    act(() => {
      expect(result.current({ kind: "clear-selection" })).toBe(true);
    });
    expect(editor.getSelectedNodes()).toEqual([]);
  });

  it("needs a canvas handler for fit-view", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));
    const fitView = vi.fn();

    act(() => {
      expect(result.current({ kind: "fit-view" })).toBe(false);
    });
    expect(fitView).not.toHaveBeenCalled();

    act(() => {
      expect(result.current({ kind: "fit-view" }, { fitView })).toBe(true);
    });
    expect(fitView).toHaveBeenCalledTimes(1);
  });

  it("defers custom commands to the host handler", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));
    const onCustom = vi.fn();

    act(() => {
      expect(result.current({ kind: "custom", id: "acme.command" })).toBe(false);
    });

    act(() => {
      expect(result.current({ kind: "custom", id: "acme.command" }, { onCustom })).toBe(true);
    });
    expect(onCustom).toHaveBeenCalledWith("acme.command", editor);
  });

  it("inserts a node between two endpoints through the insert-node command", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));
    act(() => {
      result.current({ kind: "add-node", definitionId: TEST_DEFINITION_ID });
      result.current({ kind: "add-node", definitionId: TEST_DEFINITION_ID });
    });
    const [source, target] = editor.graph.getNodes();
    const created = createEdge(editor, {
      edgeId: "edge-1",
      source: { nodeId: String(source?.id), portId: "out" },
      target: { nodeId: String(target?.id), portId: "in" },
    });
    expect(created.ok).toBe(true);

    let executed = false;
    act(() => {
      executed = result.current({
        kind: "insert-node",
        edgeId: "edge-1",
        definitionId: TEST_DEFINITION_ID,
      });
    });

    expect(executed).toBe(true);
    expect(editor.graph.getNodes()).toHaveLength(3);
    expect(editor.graph.getEdges()).toHaveLength(2);
    expect(editor.graph.getEdge(createEdgeId("edge-1"))).toBeUndefined();
    expect(editor.history.labels()).toEqual([
      "add-node",
      "add-node",
      "create-edge",
      "insert-node-on-edge",
    ]);
  });

  it("reports false when the insert-node command is refused", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));
    act(() => {
      result.current({ kind: "add-node", definitionId: TEST_DEFINITION_ID });
    });
    const historyBefore = editor.history.size();

    let executed = true;
    act(() => {
      executed = result.current({
        kind: "insert-node",
        edgeId: "edge-missing",
        definitionId: TEST_DEFINITION_ID,
      });
    });

    expect(executed).toBe(false);
    expect(editor.graph.getNodes()).toHaveLength(1);
    expect(editor.graph.getEdges()).toHaveLength(0);
    expect(editor.history.size()).toBe(historyBefore);
  });

  it("leaves panel commands to the layout actions", () => {
    const editor = createTestEditor();
    const { result } = renderHook(() => useEditorCommands(editor));

    act(() => {
      expect(result.current({ kind: "toggle-panel", panelId: "palette" })).toBe(false);
      expect(result.current({ kind: "dock-panel", panelId: "palette", region: "left" })).toBe(false);
      expect(result.current({ kind: "float-panel", panelId: "palette" })).toBe(false);
    });
  });
});
