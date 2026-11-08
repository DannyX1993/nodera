import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { addNode, selectNode, type EditorEngine } from "@nodera/application";

import { createTestEditor, TEST_DEFINITION_ID } from "../test/fixtures.js";
import { useEditorSnapshot, useToolAvailability } from "./editor-snapshot.js";

afterEach(cleanup);

function SnapshotProbe({ editor }: { readonly editor: EditorEngine }) {
  const snapshot = useEditorSnapshot(editor);
  const availability = useToolAvailability(editor);
  return (
    <>
      <span data-testid="node-count">{snapshot.graph.getNodes().length}</span>
      <span data-testid="version">{snapshot.version > 0 ? "changed" : "initial"}</span>
      <span data-testid="selected-nodes">{snapshot.selectedNodes.join(",")}</span>
      <span data-testid="selected-edges">{snapshot.selectedEdges.join(",")}</span>
      <span data-testid="can-undo">{String(snapshot.canUndo)}</span>
      <span data-testid="availability-can-undo">{String(availability.canUndo)}</span>
      <span data-testid="availability-selected">{availability.selectedNodeCount}</span>
      <span data-testid="clipboard">{availability.clipboardSize}</span>
    </>
  );
}

describe("useEditorSnapshot", () => {
  it("refreshes subscribers when a use case mutates the engine", () => {
    const editor = createTestEditor();
    render(<SnapshotProbe editor={editor} />);

    expect(screen.getByTestId("node-count").textContent).toBe("0");

    act(() => {
      addNode(editor, { definitionId: TEST_DEFINITION_ID, nodeId: "n1" });
    });

    expect(screen.getByTestId("node-count").textContent).toBe("1");
    expect(screen.getByTestId("version").textContent).toBe("changed");
  });

  it("reports the selection after selectNode", () => {
    const editor = createTestEditor();
    act(() => {
      addNode(editor, { definitionId: TEST_DEFINITION_ID, nodeId: "n1" });
    });
    render(<SnapshotProbe editor={editor} />);

    act(() => {
      selectNode(editor, { nodeId: "n1" });
    });

    expect(screen.getByTestId("selected-nodes").textContent).toBe("n1");
    expect(screen.getByTestId("selected-edges").textContent).toBe("");
  });

  it("exposes the availability context derived from history and selection", () => {
    const editor = createTestEditor();
    render(<SnapshotProbe editor={editor} />);

    expect(screen.getByTestId("availability-can-undo").textContent).toBe("false");
    expect(screen.getByTestId("availability-selected").textContent).toBe("0");

    act(() => {
      addNode(editor, { definitionId: TEST_DEFINITION_ID, nodeId: "n1" });
    });
    act(() => {
      selectNode(editor, { nodeId: "n1" });
    });

    expect(screen.getByTestId("availability-can-undo").textContent).toBe("true");
    expect(screen.getByTestId("availability-selected").textContent).toBe("1");
    expect(screen.getByTestId("can-undo").textContent).toBe("true");
  });
});
