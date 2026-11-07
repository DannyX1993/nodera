/**
 * Editor engine: the application-layer owner of an editing session.
 *
 * It composes the domain facade (registries, validation), the portable
 * graph, the history engine and the event bus, and owns the editor state
 * that must never leak into the portable document: selection and clipboard
 * (AGENTS.md §5.3). It knows nothing about React, React Flow or the DOM.
 */

import { Graph } from "@nodera/graph-model";
import { createEdgeId, createGraphId, createNodeId, type GraphId } from "@nodera/contracts";
import { NoderaDomain } from "@nodera/domain";
import type { Edge, Node } from "@nodera/graph-model";
import { HistoryEngine, type ReversibleCommand } from "@nodera/history";
import { EventBus } from "./events.js";

/** Application state for the clipboard: portable payloads, not references. */
export type ClipboardBuffer = readonly ClipboardEntry[];

/** One clipboard entry: a portable snapshot of a graph element. */
export interface ClipboardEntry {
  readonly kind: "node" | "edge";
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface EditorEngineOptions {
  /** Identifier for the initial graph. Defaults to a generated graph id. */
  readonly graphId?: string;
}

/** Command factory type used by use cases to describe reversible changes. */
export type EditorCommand = ReversibleCommand<EditorState>;

/**
 * The mutable state the history engine reverses: the portable graph plus the
 * editor-owned selection. Commands capture and restore what they change.
 */
export interface EditorState {
  readonly graph: Graph;
  readonly selectedNodes: Set<string>;
  readonly selectedEdges: Set<string>;
}

/**
 * The editor engine holds one editing session: graph, domain services,
 * history, events, selection and clipboard.
 */
export class EditorEngine {
  readonly domain: NoderaDomain;
  readonly events: EventBus;
  readonly history: HistoryEngine<EditorState>;

  private readonly state: EditorState;
  private clipboard: ClipboardBuffer = [];

  constructor(options: EditorEngineOptions = {}) {
    this.domain = new NoderaDomain();
    this.events = new EventBus();
    this.history = new HistoryEngine<EditorState>();
    this.state = {
      graph: new Graph(createInitialGraphId(options.graphId)),
      selectedNodes: new Set(),
      selectedEdges: new Set(),
    };
  }

  /** Low-level selection storage primitive; selection use cases build on it. */
  selectNode(nodeId: string): void {
    this.state.selectedNodes.add(nodeId);
  }

  /** Node instance by id, if present. */
  getNode(id: string): Node | undefined {
    return this.state.graph.getNode(createNodeId(id));
  }

  /** Edge instance by id, if present. */
  getEdge(id: string): Edge | undefined {
    return this.state.graph.getEdge(createEdgeId(id));
  }

  /** Replaces the current graph and clears selection (internal; graph use cases). */
  replaceGraph(graph: Graph): void {
    (
      this.state as { graph: Graph }
    ).graph = graph;
    this.state.selectedNodes.clear();
    this.state.selectedEdges.clear();
  }

  /** The portable graph being edited. */
  get graph(): Graph {
    return this.state.graph;
  }

  /** Internal editor state the commands reverse over. */
  get editorState(): EditorState {
    return this.state;
  }

  /** Identifiers of the currently selected nodes. */
  getSelectedNodes(): string[] {
    return [...this.state.selectedNodes];
  }

  /** Identifiers of the currently selected edges. */
  getSelectedEdges(): string[] {
    return [...this.state.selectedEdges];
  }

  /** Current clipboard buffer (portable payloads). */
  getClipboard(): ClipboardBuffer {
    return this.clipboard;
  }

  /** Replaces the clipboard buffer. Internal to clipboard use cases. */
  setClipboard(buffer: ClipboardBuffer): void {
    this.clipboard = buffer;
  }

  /** True when there is at least one undoable unit. */
  canUndo(): boolean {
    return this.history.canUndo();
  }

  /** True when there is at least one redoable unit. */
  canRedo(): boolean {
    return this.history.canRedo();
  }
}

function createInitialGraphId(graphId?: string): GraphId {
  if (graphId !== undefined) {
    return graphId as GraphId;
  }
  const random = Math.random().toString(36).slice(2, 8);
  return createGraphId(`graph-${random}`);
}
