import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NodeDefinition } from "@nodera/node-registry";
import { CREATE_NODE_DIALOG, type DialogDefinition } from "@nodera/ui-core";
import { createEdgeId } from "@nodera/contracts";

import {
  DATASOURCE_DEFINITION_ID,
  DISCOVERY_DEFINITIONS,
  SINK_DEFINITION_ID,
  TRANSFORM_DEFINITION_ID,
  addTestNode,
  connectTestNodes,
  createDiscoveryEditor,
  createDiscoveryStore,
  renderWithEditor,
} from "../discovery/test-helpers.js";
import { NodeCreationDialog } from "./node-creation-dialog.js";

afterEach(cleanup);

function renderCreateNodeDialog(
  overrides: {
    readonly open?: boolean;
    readonly onClose?: () => void;
    readonly onAddNode?: (definitionId: string) => void;
    readonly definition?: DialogDefinition;
    readonly definitions?: readonly NodeDefinition[];
  } = {},
): { readonly onClose: ReturnType<typeof vi.fn>; readonly editor: ReturnType<typeof createDiscoveryEditor> } {
  const editor = createDiscoveryEditor();
  const onClose = vi.fn(overrides.onClose);
  renderWithEditor(
    <NodeCreationDialog
      open={overrides.open ?? true}
      onClose={onClose}
      {...(overrides.onAddNode === undefined ? {} : { onAddNode: overrides.onAddNode })}
      {...(overrides.definition === undefined ? {} : { definition: overrides.definition })}
      {...(overrides.definitions === undefined ? {} : { definitions: overrides.definitions })}
    />,
    { editor },
  );
  return { onClose, editor };
}

function itemIds(): readonly (string | null)[] {
  return [...document.querySelectorAll("[data-nodera-palette-item]")].map((element) =>
    element.getAttribute("data-nodera-palette-item"),
  );
}

describe("NodeCreationDialog", () => {
  it("renders the registered node definitions inside the built-in dialog", () => {
    renderCreateNodeDialog();

    const dialog = screen.getByRole("dialog", { name: CREATE_NODE_DIALOG.title });

    expect(dialog.getAttribute("data-nodera-dialog")).toBe("nodera.dialog.create-node");
    expect(itemIds()).toEqual([
      SINK_DEFINITION_ID,
      DATASOURCE_DEFINITION_ID,
      TRANSFORM_DEFINITION_ID,
      "test.loose",
    ]);
  });

  it("renders nothing while it is not open", () => {
    renderCreateNodeDialog({ open: false });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(itemIds()).toEqual([]);
  });

  it("adds one node through the add-node command and closes the dialog", () => {
    const { onClose, editor } = renderCreateNodeDialog();

    fireEvent.click(
      screen.getByRole("button", { name: "Add Datasource" }),
    );

    const nodes = editor.graph.getNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.definitionId).toBe(DATASOURCE_DEFINITION_ID);
    expect(editor.history.labels()).toEqual(["add-node"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("prefers the host add handler over the command and still closes", () => {
    const onAddNode = vi.fn();
    const { onClose, editor } = renderCreateNodeDialog({ onAddNode });

    fireEvent.click(screen.getByRole("button", { name: "Add Transform" }));

    expect(onAddNode).toHaveBeenCalledWith(TRANSFORM_DEFINITION_ID);
    expect(onAddNode).toHaveBeenCalledTimes(1);
    expect(editor.graph.getNodes()).toHaveLength(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when the graph refuses the node", () => {
    const editor = createDiscoveryEditor();
    editor.domain.nodes.register({
      id: "broken",
      name: "Broken",
      category: "sources",
      version: "1.0.0",
      ports: [],
      properties: [],
    });
    const onClose = vi.fn();
    renderWithEditor(<NodeCreationDialog open onClose={onClose} />, { editor });

    fireEvent.click(screen.getByRole("button", { name: "Add Broken" }));

    expect(editor.graph.getNodes()).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("inserts the chosen definition between the endpoints when an edge insertion is pending", () => {
    const editor = createDiscoveryEditor();
    addTestNode(editor, { nodeId: "a", position: { x: 0, y: 0 } });
    addTestNode(editor, { nodeId: "b", position: { x: 200, y: 0 } });
    connectTestNodes(editor, { edgeId: "edge-1", from: "a", to: "b" });
    const store = createDiscoveryStore();
    store.setPendingEdgeInsertId("edge-1");
    const onClose = vi.fn();
    renderWithEditor(<NodeCreationDialog open onClose={onClose} />, { editor, store });

    fireEvent.click(screen.getByRole("button", { name: "Add Transform" }));

    const nodes = editor.graph.getNodes();
    expect(nodes).toHaveLength(3);
    expect(nodes.map((node) => node.definitionId)).toContain(TRANSFORM_DEFINITION_ID);
    expect(editor.graph.getEdges()).toHaveLength(2);
    expect(editor.graph.getEdge(createEdgeId("edge-1"))).toBeUndefined();
    expect(editor.history.labels()).toEqual([
      "add-node",
      "add-node",
      "create-edge",
      "insert-node-on-edge",
    ]);
    expect(store.getState().pendingEdgeInsertId).toBeUndefined();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("adds a node instead of inserting when no edge insertion is pending", () => {
    const editor = createDiscoveryEditor();
    addTestNode(editor, { nodeId: "a", position: { x: 0, y: 0 } });
    addTestNode(editor, { nodeId: "b", position: { x: 200, y: 0 } });
    connectTestNodes(editor, { edgeId: "edge-1", from: "a", to: "b" });
    const store = createDiscoveryStore();
    const onClose = vi.fn();
    renderWithEditor(<NodeCreationDialog open onClose={onClose} />, { editor, store });

    fireEvent.click(screen.getByRole("button", { name: "Add Transform" }));

    expect(editor.graph.getNodes()).toHaveLength(3);
    expect(editor.graph.getEdges()).toHaveLength(1);
    expect(editor.graph.getEdge(createEdgeId("edge-1"))).toBeDefined();
    expect(editor.history.labels()).toEqual([
      "add-node",
      "add-node",
      "create-edge",
      "add-node",
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open and keeps the pending edge when the insertion is refused", () => {
    const editor = createDiscoveryEditor();
    addTestNode(editor, { nodeId: "a", position: { x: 0, y: 0 } });
    const store = createDiscoveryStore();
    store.setPendingEdgeInsertId("edge-missing");
    const onClose = vi.fn();
    renderWithEditor(<NodeCreationDialog open onClose={onClose} />, { editor, store });

    fireEvent.click(screen.getByRole("button", { name: "Add Transform" }));

    expect(editor.graph.getNodes()).toHaveLength(1);
    expect(editor.graph.getEdges()).toHaveLength(0);
    expect(store.getState().pendingEdgeInsertId).toBe("edge-missing");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not treat a phantom append session as an edge insertion", () => {
    const editor = createDiscoveryEditor();
    addTestNode(editor, { nodeId: "a", position: { x: 0, y: 0 } });
    const store = createDiscoveryStore();
    store.setPendingAppendAnchorId("a");
    const onClose = vi.fn();
    renderWithEditor(<NodeCreationDialog open onClose={onClose} />, { editor, store });

    fireEvent.click(screen.getByRole("button", { name: "Add Transform" }));

    // A phantom append is an add, never an insertion: the node is created by the
    // add path and no edge is written over a graph that had none.
    expect(editor.graph.getNodes()).toHaveLength(2);
    expect(editor.graph.getEdges()).toHaveLength(0);
    expect(editor.history.labels()).toEqual(["add-node", "add-node"]);
    expect(store.getState().pendingAppendAnchorId).toBeUndefined();
    expect(store.getState().pendingEdgeInsertId).toBeUndefined();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the phantom append anchor while the graph refuses the node", () => {
    const editor = createDiscoveryEditor();
    editor.domain.nodes.register({
      id: "broken",
      name: "Broken",
      category: "sources",
      version: "1.0.0",
      ports: [],
      properties: [],
    });
    const store = createDiscoveryStore();
    store.setPendingAppendAnchorId("a");
    const onClose = vi.fn();
    renderWithEditor(<NodeCreationDialog open onClose={onClose} />, { editor, store });

    fireEvent.click(screen.getByRole("button", { name: "Add Broken" }));

    expect(editor.graph.getNodes()).toHaveLength(0);
    expect(store.getState().pendingAppendAnchorId).toBe("a");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("filters the offered definitions with the search field inside the dialog", () => {
    renderCreateNodeDialog();

    fireEvent.change(screen.getByPlaceholderText("Search nodes"), {
      target: { value: "TRANSFORM" },
    });

    expect(itemIds()).toEqual([TRANSFORM_DEFINITION_ID]);
  });

  it("moves focus into the palette search field when it opens", () => {
    renderCreateNodeDialog();

    expect(document.activeElement).toBe(screen.getByPlaceholderText("Search nodes"));
  });

  it("closes on Escape because the built-in definition is dismissible", () => {
    const { onClose } = renderCreateNodeDialog();

    fireEvent.keyDown(screen.getByPlaceholderText("Search nodes"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders the host definition when one is supplied", () => {
    renderCreateNodeDialog({
      definition: { ...CREATE_NODE_DIALOG, title: "Pick a node", size: "sm" },
    });

    const dialog = screen.getByRole("dialog", { name: "Pick a node" });

    expect(dialog.getAttribute("data-nodera-dialog-size")).toBe("sm");
  });

  it("offers the host node list instead of the editor registry when supplied", () => {
    const sink = DISCOVERY_DEFINITIONS.filter(
      (definition) => definition.id === SINK_DEFINITION_ID,
    );
    renderCreateNodeDialog({ definitions: sink });

    expect(itemIds()).toEqual([SINK_DEFINITION_ID]);
  });
});
