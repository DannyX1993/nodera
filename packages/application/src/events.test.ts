import { describe, expect, it, vi } from "vitest";
import {
  EDITOR_EVENT_NAMES,
  type EditorEvent,
  type EditorEventName,
  EventBus,
} from "./events.js";

describe("editor event contract", () => {
  it("declares exactly the sixteen documented event names", () => {
    expect([...EDITOR_EVENT_NAMES].sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it("keeps every payload framework-agnostic and serializable", () => {
    const events: EditorEvent[] = [
      { name: "graph.created", payload: { graphId: "graph-1" } },
      { name: "graph.loaded", payload: { graphId: "graph-1" } },
      { name: "graph.changed", payload: { graphId: "graph-1", cause: "add-node" } },
      { name: "graph.saved", payload: { graphId: "graph-1" } },
      { name: "graph.exported", payload: { graphId: "graph-1", format: "json" } },
      { name: "node.created", payload: { nodeId: "node-1", definitionId: "http.request" } },
      { name: "node.deleted", payload: { nodeId: "node-1" } },
      { name: "node.updated", payload: { nodeId: "node-1" } },
      { name: "node.selected", payload: { nodeId: "node-1" } },
      { name: "edge.created", payload: { edgeId: "edge-1" } },
      { name: "edge.deleted", payload: { edgeId: "edge-1" } },
      { name: "edge.updated", payload: { edgeId: "edge-1" } },
      { name: "property.changed", payload: { nodeId: "node-1", property: "url" } },
      { name: "validation.completed", payload: { report: { issues: [], structurallyValid: true, configurationValid: true, isValid: true } } },
      { name: "plugin.registered", payload: { pluginId: "vendor.plugin" } },
      { name: "plugin.error", payload: { pluginId: "vendor.plugin", message: "boom" } },
    ];

    for (const event of events) {
      // Serializable payloads only: ids, strings, booleans, plain data.
      expect(JSON.parse(JSON.stringify(event))).toEqual(event);
    }
  });

  it("exposes event names as a typed union", () => {
    const name: EditorEventName = "node.created";
    expect(EDITOR_EVENT_NAMES.has(name)).toBe(true);
  });
});

describe("EventBus", () => {
  it("delivers an event to subscribers of that name", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("node.created", handler);

    bus.emit({ name: "node.created", payload: { nodeId: "n1", definitionId: "d1" } });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ name: "node.created", payload: { nodeId: "n1", definitionId: "d1" } });
  });

  it("does not deliver an event to subscribers of other names", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe("node.created", handler);

    bus.emit({ name: "edge.created", payload: { edgeId: "e1" } });

    expect(handler).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribing", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe("node.created", handler);
    unsubscribe();

    bus.emit({ name: "node.created", payload: { nodeId: "n1", definitionId: "d1" } });

    expect(handler).not.toHaveBeenCalled();
  });

  it("supports several subscribers for the same event", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe("graph.changed", a);
    bus.subscribe("graph.changed", b);

    bus.emit({ name: "graph.changed", payload: { graphId: "g", cause: "test" } });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("continues delivering when a handler throws", () => {
    const bus = new EventBus();
    const a = vi.fn(() => {
      throw new Error("handler failure");
    });
    const b = vi.fn();
    bus.subscribe("node.deleted", a);
    bus.subscribe("node.deleted", b);

    expect(() => bus.emit({ name: "node.deleted", payload: { nodeId: "n1" } })).not.toThrow();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("keeps subscription isolated per bus instance", () => {
    const busA = new EventBus();
    const busB = new EventBus();
    const handler = vi.fn();
    busA.subscribe("node.created", handler);

    busB.emit({ name: "node.created", payload: { nodeId: "n1", definitionId: "d1" } });

    expect(handler).not.toHaveBeenCalled();
  });
});
