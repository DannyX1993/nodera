/**
 * Framework-agnostic editor events.
 *
 * Events describe facts that happened in the editor (AGENTS.md §12) and let
 * the host application synchronize data or update its interface. Payloads
 * carry only identifiers, primitives and plain data: no React, no DOM, no
 * framework objects, nothing that cannot cross JSON.stringify.
 */

import type { ValidationReport } from "@nodera/validation";

/** All editor event names, as documented in docs/FASE3-DEFINITION.md. */
export const EDITOR_EVENT_NAMES: ReadonlySet<EditorEventName> = new Set([
  "graph.created",
  "graph.loaded",
  "graph.changed",
  "graph.saved",
  "graph.exported",
  "node.created",
  "node.deleted",
  "node.updated",
  "node.selected",
  "edge.created",
  "edge.deleted",
  "edge.updated",
  "property.changed",
  "validation.completed",
  "plugin.registered",
  "plugin.error",
  "selection.changed",
] as EditorEventName[]);

/** Union of every editor event name. */
export type EditorEventName =
  | "graph.created"
  | "graph.loaded"
  | "graph.changed"
  | "graph.saved"
  | "graph.exported"
  | "node.created"
  | "node.deleted"
  | "node.updated"
  | "node.selected"
  | "edge.created"
  | "edge.deleted"
  | "edge.updated"
  | "property.changed"
  | "validation.completed"
  | "plugin.registered"
  | "plugin.error"
  | "selection.changed";

/** Typed payloads for every editor event name. */
export interface EditorEventPayloads {
  "graph.created": { readonly graphId: string };
  "graph.loaded": { readonly graphId: string };
  "graph.changed": { readonly graphId: string; readonly cause: string };
  "graph.saved": { readonly graphId: string };
  "graph.exported": { readonly graphId: string; readonly format: string };
  "node.created": { readonly nodeId: string; readonly definitionId: string };
  "node.deleted": { readonly nodeId: string };
  "node.updated": { readonly nodeId: string };
  "node.selected": { readonly nodeId: string };
  "edge.created": { readonly edgeId: string };
  "edge.deleted": { readonly edgeId: string };
  "edge.updated": { readonly edgeId: string };
  "property.changed": { readonly nodeId: string; readonly property: string };
  "validation.completed": { readonly report: ValidationReport };
  "plugin.registered": { readonly pluginId: string };
  "plugin.error": { readonly pluginId: string; readonly message: string };
  "selection.changed": {
    readonly selectedNodes: readonly string[];
    readonly selectedEdges: readonly string[];
  };
}

/** A typed editor event: name plus its payload. */
export type EditorEvent = {
  [K in EditorEventName]: { readonly name: K; readonly payload: EditorEventPayloads[K] };
}[EditorEventName];

export type EditorEventHandler<N extends EditorEventName = EditorEventName> = (
  event: Extract<EditorEvent, { name: N }>,
) => void;

type AnyHandler = (event: EditorEvent) => void;

/**
 * Minimal event bus: name-keyed subscriptions with isolated unsubscribe
 * handles. A failing handler is isolated: the error never propagates to the
 * emitter nor breaks delivery to other subscribers.
 */
export class EventBus {
  private readonly handlers = new Map<EditorEventName, Set<AnyHandler>>();

  /** Subscribes to one event name; returns an unsubscribe function. */
  subscribe<N extends EditorEventName>(name: N, handler: EditorEventHandler<N>): () => void {
    let set = this.handlers.get(name);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(name, set);
    }
    const anyHandler = handler as AnyHandler;
    set.add(anyHandler);
    return () => {
      set?.delete(anyHandler);
    };
  }

  /** Delivers an event to every subscriber of its name. */
  emit(event: EditorEvent): void {
    const set = this.handlers.get(event.name);
    if (set === undefined) {
      return;
    }
    for (const handler of set) {
      try {
        handler(event);
      } catch {
        // Handler failures are isolated; delivery continues.
      }
    }
  }

  /** Number of active subscribers for one event name. */
  subscriberCount(name: EditorEventName): number {
    return this.handlers.get(name)?.size ?? 0;
  }
}
