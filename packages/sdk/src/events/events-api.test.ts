import { describe, expect, it } from "vitest";
import { EventBus } from "@nodera/application";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import { createBuilder, type Builder } from "../builder/builder.js";
import {
  SDK_EVENT_NAMES,
  createBuilderEvents,
  type PluginErrorEvent,
  type PluginRegisteredEvent,
} from "./events-api.js";

const REQUEST = "demo.node";

function nodeInput(overrides: Partial<NodeDefinitionInput> = {}): NodeDefinitionInput {
  return {
    type: REQUEST,
    version: "1.0.0",
    label: "Demo node",
    category: "demo",
    ports: {
      inputs: [{ id: "in", dataType: "any" }],
      outputs: [{ id: "out", dataType: "any" }],
    },
    ...overrides,
  };
}

function create(): Builder {
  const result = createBuilder({ registry: { nodes: [nodeInput()] } });
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

/** Adds the demo node and returns its instance id. */
function addNode(builder: Builder): string {
  const added = builder.graph.addNode({ type: REQUEST });
  if (!added.ok) {
    throw new Error(
      `unexpected addNode failure: ${added.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return String(added.value.id);
}

describe("application events", () => {
  it("delegates node.created to the editor event bus verbatim", () => {
    const builder = create();
    const created: unknown[] = [];

    const unsubscribe = builder.events.on("node.created", (payload) => {
      created.push(payload);
    });

    expect(builder.editor.events.subscriberCount("node.created")).toBe(1);

    const nodeId = addNode(builder);

    expect(created).toEqual([{ nodeId, definitionId: REQUEST }]);
    unsubscribe();
    expect(builder.editor.events.subscriberCount("node.created")).toBe(0);
  });

  it("delegates selection.changed to the editor event bus verbatim", () => {
    const builder = create();
    const nodeId = addNode(builder);
    const selection: unknown[] = [];

    builder.events.on("selection.changed", (payload) => {
      selection.push(payload);
    });

    expect(builder.graph.select({ nodes: [nodeId] }).ok).toBe(true);

    expect(selection).toEqual([{ selectedNodes: [nodeId], selectedEdges: [] }]);
  });

  it("delegates the history event an undo writes to the editor event bus", () => {
    const builder = create();
    addNode(builder);
    const changes: unknown[] = [];

    builder.events.on("graph.changed", (payload) => {
      changes.push(payload);
    });

    expect(builder.graph.undo()).toBe(true);

    expect(changes).toEqual([{ graphId: String(builder.editor.graph.id), cause: "undo" }]);
  });

  it("keeps the plugin events out of the application bus until an SDK install emits them", () => {
    const builder = create();
    const registered: PluginRegisteredEvent[] = [];
    const errors: PluginErrorEvent[] = [];

    builder.events.on("plugin.registered", (payload) => {
      registered.push(payload);
    });
    builder.events.on("plugin.error", (payload) => {
      errors.push(payload);
    });

    expect(builder.editor.events.subscriberCount("plugin.registered")).toBe(0);
    expect(builder.editor.events.subscriberCount("plugin.error")).toBe(0);

    addNode(builder);
    builder.graph.select({ nodes: [addNode(builder)] });
    builder.graph.undo();

    expect(registered).toEqual([]);
    expect(errors).toEqual([]);

    const installed = builder.use({
      id: "acme.nodes",
      version: "1.2.0",
      install(api) {
        api.nodes.register(nodeInput({ type: "acme.custom" }));
      },
    });

    expect(installed.ok).toBe(true);
    expect(registered).toEqual([
      {
        pluginId: "acme.nodes",
        version: "1.2.0",
        contributionIds: ["acme.custom"],
      },
    ]);
    expect(errors).toEqual([]);
    expect(builder.editor.events.subscriberCount("plugin.registered")).toBe(0);
  });
});

describe("subscription handles", () => {
  it("returns an unsubscribe function that is safe to call twice", () => {
    const bus = new EventBus();
    const events = createBuilderEvents(bus);
    const received: string[] = [];

    const unsubscribe = events.on("graph.created", (payload) => {
      received.push(payload.graphId);
    });

    bus.emit({ name: "graph.created", payload: { graphId: "graph-demo" } });
    expect(received).toEqual(["graph-demo"]);

    unsubscribe();
    unsubscribe();

    bus.emit({ name: "graph.created", payload: { graphId: "graph-other" } });
    expect(received).toEqual(["graph-demo"]);
    expect(bus.subscriberCount("graph.created")).toBe(0);
  });

  it("removes the handler passed to off and leaves the others subscribed", () => {
    const bus = new EventBus();
    const events = createBuilderEvents(bus);
    const first: string[] = [];
    const second: string[] = [];
    const firstHandler = (payload: { readonly graphId: string }): void => {
      first.push(payload.graphId);
    };

    events.on("graph.created", firstHandler);
    events.on("graph.created", (payload) => {
      second.push(payload.graphId);
    });

    events.off("graph.created", firstHandler);
    events.off("graph.created", firstHandler);
    events.off("graph.created", (payload) => {
      second.push(payload.graphId);
    });

    bus.emit({ name: "graph.created", payload: { graphId: "graph-demo" } });

    expect(first).toEqual([]);
    expect(second).toEqual(["graph-demo"]);
    expect(bus.subscriberCount("graph.created")).toBe(1);
  });

  it("fires a once handler exactly once and unsubscribes it before delivery", () => {
    const bus = new EventBus();
    const events = createBuilderEvents(bus);
    const received: string[] = [];

    events.once("graph.created", (payload) => {
      received.push(payload.graphId);
      bus.emit({ name: "graph.created", payload: { graphId: "graph-nested" } });
    });

    bus.emit({ name: "graph.created", payload: { graphId: "graph-demo" } });
    bus.emit({ name: "graph.created", payload: { graphId: "graph-other" } });

    expect(received).toEqual(["graph-demo"]);
    expect(bus.subscriberCount("graph.created")).toBe(0);
  });

  it("disposes every SDK listener without breaking the handles already returned", () => {
    const bus = new EventBus();
    const events = createBuilderEvents(bus);
    const created: string[] = [];
    const loaded: string[] = [];
    const registered: PluginRegisteredEvent[] = [];

    const offCreated = events.on("graph.created", (payload) => {
      created.push(payload.graphId);
    });
    const offLoaded = events.once("graph.loaded", (payload) => {
      loaded.push(payload.graphId);
    });
    events.on("plugin.registered", (payload) => {
      registered.push(payload);
    });

    events.dispose();
    events.dispose();

    bus.emit({ name: "graph.created", payload: { graphId: "graph-demo" } });
    bus.emit({ name: "graph.loaded", payload: { graphId: "graph-demo" } });
    events.emitSdk("plugin.registered", {
      pluginId: "acme.nodes",
      version: "1.0.0",
      contributionIds: ["demo.node"],
    });

    expect(created).toEqual([]);
    expect(loaded).toEqual([]);
    expect(registered).toEqual([]);
    expect(bus.subscriberCount("graph.created")).toBe(0);
    expect(bus.subscriberCount("graph.loaded")).toBe(0);

    expect(() => {
      offCreated();
      offLoaded();
      offCreated();
    }).not.toThrow();
  });
});

describe("SDK events", () => {
  it("declares the two SDK-owned event names", () => {
    expect(SDK_EVENT_NAMES).toEqual(["plugin.registered", "plugin.error"]);
  });

  it("delivers the rich SDK payloads through emitSdk only", () => {
    const bus = new EventBus();
    const events = createBuilderEvents(bus);
    const registered: PluginRegisteredEvent[] = [];
    const errors: PluginErrorEvent[] = [];

    events.on("plugin.registered", (payload) => {
      registered.push(payload);
    });
    events.on("plugin.error", (payload) => {
      errors.push(payload);
    });

    events.emitSdk("plugin.registered", {
      pluginId: "acme.nodes",
      version: "1.0.0",
      contributionIds: ["demo.node", "acme.edge"],
    });
    events.emitSdk("plugin.error", {
      pluginId: "acme.nodes",
      message: "acme.edge is a duplicate",
      code: "sdk.duplicate-id",
    });

    expect(registered).toEqual([
      { pluginId: "acme.nodes", version: "1.0.0", contributionIds: ["demo.node", "acme.edge"] },
    ]);
    expect(errors).toEqual([
      {
        pluginId: "acme.nodes",
        message: "acme.edge is a duplicate",
        code: "sdk.duplicate-id",
      },
    ]);
    expect(bus.subscriberCount("plugin.registered")).toBe(0);
    expect(bus.subscriberCount("plugin.error")).toBe(0);
  });
});
