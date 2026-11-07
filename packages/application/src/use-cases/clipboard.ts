/**
 * Clipboard use cases: CopySelection, CutSelection, PasteSelection.
 *
 * The clipboard buffer holds portable payload fragments (plain data shaped
 * like document node/edge instances), never object references, so what is
 * copied survives serialization and never leaks editor internals (S8).
 *
 * Cut and paste are each one undo unit (transaction). Paste generates fresh
 * ids, requires the node definitions to be registered, and rewires only the
 * internal edges: connections to nodes outside the buffer are not recreated.
 */

import { createEdgeId, createNodeId, err, ok, type Result } from "@nodera/contracts";
import { Connection, Edge, type Node, type NodePosition } from "@nodera/graph-model";
import type { EditorEngine } from "../editor-engine.js";
import type { ClipboardEntry } from "../editor-engine.js";
import { emitChanged, type UseCaseError } from "./errors.js";

/** Copies the current selection into the clipboard as portable payloads. */
export function copySelection(
  editor: EditorEngine,
): Result<readonly ClipboardEntry[], UseCaseError> {
  const nodeIds = editor.getSelectedNodes();
  if (nodeIds.length === 0 && editor.getSelectedEdges().length === 0) {
    return err({ kind: "empty-selection", message: "Nothing is selected" });
  }
  const entries: ClipboardEntry[] = nodeIds.map((id) => {
    const node = editor.getNode(id)!;
    return {
      kind: "node" as const,
      payload: {
        nodeId: node.id,
        type: node.definitionId,
        version: node.definitionVersion,
        position: node.position,
        properties: { ...node.getProperties() },
        metadata: node.metadata ? { ...node.metadata } : undefined,
      },
    };
  });
  const nodeIdSet = new Set(nodeIds);
  for (const edge of editor.graph.getEdges()) {
    const sourceId = edge.connection.source.nodeId;
    const targetId = edge.connection.target.nodeId;
    if (nodeIdSet.has(sourceId) && nodeIdSet.has(targetId)) {
      entries.push({
        kind: "edge",
        payload: {
          sourceNodeId: sourceId,
          sourcePortId: edge.connection.source.portId,
          targetNodeId: targetId,
          targetPortId: edge.connection.target.portId,
          definitionId: edge.definitionId,
          label: edge.label,
          metadata: edge.metadata ? { ...edge.metadata } : undefined,
        },
      });
    }
  }
  editor.setClipboard(entries);
  return ok(entries);
}

/**
 * Copies the selection to the clipboard and removes the selected nodes (with
 * their edges), grouping everything into one undo unit labelled
 * "cut-selection".
 */
export function cutSelection(
  editor: EditorEngine,
): Result<readonly ClipboardEntry[], UseCaseError> {
  const copied = copySelection(editor);
  if (!copied.ok) {
    return copied;
  }
  const nodeIds = editor.getSelectedNodes();
  const captured: { node: Node; edges: readonly Edge[] }[] = nodeIds.map((id) => {
    const node = editor.getNode(id)!;
    return { node, edges: editor.graph.getEdgesOf(node.id) };
  });
  const transaction = editor.history.beginTransaction({ label: "cut-selection" });
  for (const { node, edges } of captured) {
    transaction.push({
      label: "remove-node",
      apply: () => {
        editor.graph.removeNode(node.id);
      },
      reverse: () => {
        editor.graph.addNode(node);
        for (const edge of edges) {
          editor.graph.addEdge(edge);
        }
      },
    });
  }
  transaction.commit(editor.editorState);
  for (const { node } of captured) {
    editor.events.emit({ name: "node.deleted", payload: { nodeId: node.id } });
  }
  emitChanged(editor, "cut-selection");
  editor.editorState.selectedNodes.clear();
  editor.editorState.selectedEdges.clear();
  return copied;
}

export interface PasteSelectionInput {
  /** Offset added to the original positions of pasted nodes. */
  readonly offset?: NodePosition;
}

export interface PasteSelectionResult {
  readonly nodes: readonly Node[];
  readonly edges: readonly Edge[];
}

/** Pastes the clipboard buffer as one undo unit with fresh ids. */
export function pasteSelection(
  editor: EditorEngine,
  input: PasteSelectionInput = {},
): Result<PasteSelectionResult, UseCaseError> {
  const buffer = editor.getClipboard();
  if (buffer.length === 0) {
    return err({ kind: "empty-clipboard", message: "The clipboard is empty" });
  }
  const offset = input.offset ?? { x: 0, y: 0 };
  const idByOldId = new Map<string, ReturnType<typeof createNodeId>>();
  const createdNodes: Node[] = [];
  const createdEdges: Edge[] = [];

  const transaction = editor.history.beginTransaction({ label: "paste-selection" });

  for (const entry of buffer) {
    if (entry.kind !== "node") {
      continue;
    }
    const payload = entry.payload as {
      nodeId?: unknown;
      type?: unknown;
      version?: unknown;
      position?: { x?: unknown; y?: unknown } | null;
      properties?: Record<string, unknown> | null;
      metadata?: Record<string, unknown> | null;
    };
    const newId = uniquePasteId(editor);
    const created = editor.domain.createNode(editor.graph, String(payload.type), {
      nodeId: newId,
      properties: (payload.properties ?? {}) as Readonly<Record<string, unknown>>,
      position: {
        x: Number(payload.position?.x ?? 0) + offset.x,
        y: Number(payload.position?.y ?? 0) + offset.y,
      },
    });
    if (!created.ok) {
      transaction.abort();
      // Atomic failure: remove every node this paste already created.
      for (const createdNode of createdNodes) {
        editor.graph.removeNode(createdNode.id);
      }
      const error: UseCaseError = created.error.elementId === undefined
        ? { kind: created.error.kind as UseCaseError["kind"], message: `Pasting failed: ${created.error.message}` }
        : {
            kind: created.error.kind as UseCaseError["kind"],
            message: `Pasting failed: ${created.error.message}`,
            elementId: created.error.elementId,
          };
      return err(error);
    }
    idByOldId.set(String(payload.nodeId), created.value.id);
    transaction.push({
      label: "add-node",
      apply: () => {
        editor.graph.addNode(created.value);
      },
      reverse: () => {
        editor.graph.removeNode(created.value.id);
      },
    });
    createdNodes.push(created.value);
  }

  for (const entry of buffer) {
    if (entry.kind !== "edge") {
      continue;
    }
    const payload = entry.payload as {
      sourceNodeId?: unknown;
      sourcePortId?: unknown;
      targetNodeId?: unknown;
      targetPortId?: unknown;
      definitionId?: unknown;
      label?: unknown;
      metadata?: unknown;
    };
    const sourceId = idByOldId.get(String(payload.sourceNodeId));
    const targetId = idByOldId.get(String(payload.targetNodeId));
    if (sourceId === undefined || targetId === undefined) {
      continue;
    }
    const edge = new Edge(
      createEdgeId(uniquePasteEdgeId()),
      new Connection(
        { nodeId: sourceId, portId: String(payload.sourcePortId) },
        { nodeId: targetId, portId: String(payload.targetPortId) },
      ),
      payload.definitionId === undefined ? undefined : String(payload.definitionId),
      payload.label === undefined ? undefined : String(payload.label),
      (payload.metadata ?? undefined) as Readonly<Record<string, unknown>> | undefined,
    );
    transaction.push({
      label: "create-edge",
      apply: () => {
        editor.graph.addEdge(edge);
      },
      reverse: () => {
        editor.graph.removeEdge(edge.id);
      },
    });
    createdEdges.push(edge);
  }

  transaction.commit(editor.editorState);

  for (const node of createdNodes) {
    editor.events.emit({
      name: "node.created",
      payload: { nodeId: node.id, definitionId: node.definitionId },
    });
  }
  for (const edge of createdEdges) {
    editor.events.emit({ name: "edge.created", payload: { edgeId: edge.id } });
  }
  emitChanged(editor, "paste-selection");
  return ok({ nodes: createdNodes, edges: createdEdges });
}

function uniquePasteId(editor: EditorEngine): string {
  let candidate = "";
  do {
    candidate = `node-paste-${Math.random().toString(36).slice(2, 10)}`;
  } while (editor.graph.getNode(createNodeId(candidate)) !== undefined);
  return candidate;
}

function uniquePasteEdgeId(): string {
  return `edge-paste-${Math.random().toString(36).slice(2, 10)}`;
}
