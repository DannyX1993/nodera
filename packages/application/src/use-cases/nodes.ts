/**
 * Node use cases: AddNode, RemoveNode, DuplicateNode, MoveNode,
 * UpdateNodeProperties, UpdateNodeMetadata.
 *
 * Each use case is one independent action: it validates, executes one
 * reversible command as a single history unit and emits its documented
 * events. Failed operations mutate nothing, push nothing, emit nothing.
 */

import { createNodeId, err, ok, type Result } from "@nodera/contracts";
import { Node, type NodePosition } from "@nodera/graph-model";
import type { EditorEngine } from "../editor-engine.js";
import { emitChanged, toUseCaseError, type UseCaseError } from "./errors.js";

export interface AddNodeInput {
  readonly definitionId: string;
  readonly nodeId?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly position?: NodePosition;
}

/** Adds a node instance from a registered node definition. */
export function addNode(
  editor: EditorEngine,
  input: AddNodeInput,
): Result<Node, UseCaseError> {
  const options: {
    nodeId?: string;
    properties?: Readonly<Record<string, unknown>>;
    position?: NodePosition;
  } = {};
  if (input.nodeId !== undefined) {
    options.nodeId = input.nodeId;
  }
  if (input.properties !== undefined) {
    options.properties = input.properties;
  }
  if (input.position !== undefined) {
    options.position = input.position;
  }
  const created = editor.domain.createNode(editor.graph, input.definitionId, options);
  if (!created.ok) {
    return err(toUseCaseError(created.error));
  }
  const node = created.value;
  editor.history.push(editor.editorState, {
    label: "add-node",
    apply: () => {
      editor.graph.addNode(node);
    },
    reverse: () => {
      editor.graph.removeNode(node.id);
    },
  });
  editor.events.emit({
    name: "node.created",
    payload: { nodeId: node.id, definitionId: node.definitionId },
  });
  emitChanged(editor, "add-node");
  return ok(node);
}

export interface RemoveNodeInput {
  readonly nodeId: string;
}

export interface RemoveNodeResult {
  readonly node: Node;
  readonly edges: readonly import("@nodera/graph-model").Edge[];
}

/**
 * Removes a node together with every edge attached to it, as one undo unit,
 * so undo restores the node and its connections.
 */
export function removeNode(
  editor: EditorEngine,
  input: RemoveNodeInput,
): Result<RemoveNodeResult, UseCaseError> {
  const node = editor.graph.getNode(createNodeId(input.nodeId));
  if (node === undefined) {
    return err({
      kind: "node-not-found",
      message: `Graph has no node with id "${input.nodeId}"`,
      elementId: input.nodeId,
    });
  }
  const edges = editor.graph.getEdgesOf(node.id);
  editor.history.push(editor.editorState, {
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
  editor.events.emit({ name: "node.deleted", payload: { nodeId: node.id } });
  emitChanged(editor, "remove-node");
  return ok({ node, edges });
}

export interface DuplicateNodeInput {
  readonly nodeId: string;
  /** Id for the copy; generated when omitted. */
  readonly newId?: string;
  /** Overrides the duplicated position; defaults to the source position. */
  readonly position?: NodePosition;
}

/** Creates an independent copy of a node (definition, ports, properties). */
export function duplicateNode(
  editor: EditorEngine,
  input: DuplicateNodeInput,
): Result<Node, UseCaseError> {
  const source = editor.graph.getNode(createNodeId(input.nodeId));
  if (source === undefined) {
    return err({
      kind: "node-not-found",
      message: `Graph has no node with id "${input.nodeId}"`,
      elementId: input.nodeId,
    });
  }
  const newId = createNodeId(
    input.newId ?? `node-copy-${Math.random().toString(36).slice(2, 8)}`,
  );
  if (editor.graph.getNode(newId) !== undefined) {
    return err({
      kind: "duplicate-node-id",
      message: `Graph already contains a node with id "${newId}"`,
      elementId: newId,
    });
  }
  const copy = new Node(
    newId,
    source.definitionId,
    source.getPorts(),
    { ...source.getProperties() },
    input.position ?? (source.position ? { ...source.position } : undefined),
    source.metadata ? { ...source.metadata } : undefined,
    source.definitionVersion,
  );
  editor.history.push(editor.editorState, {
    label: "duplicate-node",
    apply: () => {
      editor.graph.addNode(copy);
    },
    reverse: () => {
      editor.graph.removeNode(copy.id);
    },
  });
  editor.events.emit({
    name: "node.created",
    payload: { nodeId: copy.id, definitionId: copy.definitionId },
  });
  emitChanged(editor, "duplicate-node");
  return ok(copy);
}

export interface MoveNodeInput {
  readonly nodeId: string;
  readonly position: NodePosition;
}

/** Moves a node to a new canvas position; reversible to the previous one. */
export function moveNode(
  editor: EditorEngine,
  input: MoveNodeInput,
): Result<Node, UseCaseError> {
  const node = editor.graph.getNode(createNodeId(input.nodeId));
  if (node === undefined) {
    return err({
      kind: "node-not-found",
      message: `Graph has no node with id "${input.nodeId}"`,
      elementId: input.nodeId,
    });
  }
  const previous = node.position;
  const next = input.position;
  editor.history.push(editor.editorState, {
    label: "move-node",
    apply: () => {
      node.setPosition(next);
    },
    reverse: () => {
      node.setPosition(previous);
    },
  });
  editor.events.emit({ name: "node.updated", payload: { nodeId: node.id } });
  emitChanged(editor, "move-node");
  return ok(node);
}

export interface UpdateNodePropertiesInput {
  readonly nodeId: string;
  readonly name: string;
  readonly value: unknown;
}

/** Sets one node property value; reversible to the previous state. */
export function updateNodeProperties(
  editor: EditorEngine,
  input: UpdateNodePropertiesInput,
): Result<Node, UseCaseError> {
  const node = editor.graph.getNode(createNodeId(input.nodeId));
  if (node === undefined) {
    return err({
      kind: "node-not-found",
      message: `Graph has no node with id "${input.nodeId}"`,
      elementId: input.nodeId,
    });
  }
  const existed = input.name in node.getProperties();
  const previous = existed ? node.getProperties()[input.name] : undefined;
  editor.history.push(editor.editorState, {
    label: "update-node-properties",
    apply: () => {
      node.setProperty(input.name, input.value);
    },
    reverse: () => {
      if (existed) {
        node.setProperty(input.name, previous);
      } else {
        node.removeProperty(input.name);
      }
    },
  });
  editor.events.emit({
    name: "property.changed",
    payload: { nodeId: node.id, property: input.name },
  });
  editor.events.emit({ name: "node.updated", payload: { nodeId: node.id } });
  emitChanged(editor, "update-node-properties");
  return ok(node);
}

export interface UpdateNodeMetadataInput {
  readonly nodeId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Replaces the node metadata record; reversible. */
export function updateNodeMetadata(
  editor: EditorEngine,
  input: UpdateNodeMetadataInput,
): Result<Node, UseCaseError> {
  const node = editor.graph.getNode(createNodeId(input.nodeId));
  if (node === undefined) {
    return err({
      kind: "node-not-found",
      message: `Graph has no node with id "${input.nodeId}"`,
      elementId: input.nodeId,
    });
  }
  const previous = node.metadata;
  editor.history.push(editor.editorState, {
    label: "update-node-metadata",
    apply: () => {
      node.setMetadata(input.metadata);
    },
    reverse: () => {
      node.setMetadata(previous);
    },
  });
  editor.events.emit({ name: "node.updated", payload: { nodeId: node.id } });
  emitChanged(editor, "update-node-metadata");
  return ok(node);
}
