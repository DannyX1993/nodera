import { describe, expect, it } from "vitest";
import type { Result } from "@nodera/contracts";

import {
  assertValid,
  createBuilder,
  SDK_ISSUE_CODES,
  type Builder,
  type EdgeDefinitionInput,
  type LayoutDefinition,
  type NodeDefinitionInput,
  type PanelDefinition,
  type PropertyInput,
  type SdkIssues,
  type ToolDefinition,
} from "./index.js";

/**
 * The written contract of the public surface: the SDK never throws for input
 * data, every failure is a `Result`. This file is the home of that rule, one
 * test per input shape.
 *
 * A host passes plain data — a parsed JSON file, a value from a form, a plugin
 * from a third party. Each entry point therefore validates the shape it owns
 * once, at its own boundary, and reports the position of the offending input.
 * An internal invariant violation still throws; only data problems are results.
 */

/** Runs one public call, turning an unexpected throw into a test failure. */
function call<T>(operation: () => Result<T, SdkIssues>): Result<T, SdkIssues> {
  try {
    return operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`the public SDK threw for input data: ${message}`);
  }
}

/** Asserts the call was rejected and returns its issues. */
function rejection(operation: () => Result<unknown, SdkIssues>): SdkIssues {
  const result = call(operation);
  if (result.ok) {
    throw new Error("expected the public call to reject the input");
  }
  return result.error;
}

function builder(): Builder {
  return assertValid(createBuilder());
}

function nodeInput(overrides: Partial<NodeDefinitionInput> = {}): NodeDefinitionInput {
  return { type: "acme.node", label: "Node", category: "acme", ...overrides };
}

function edgeInput(overrides: Partial<EdgeDefinitionInput> = {}): EdgeDefinitionInput {
  return { type: "acme.edge", label: "Edge", ...overrides };
}

function propertyInput(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return { id: "option", type: "string", ...overrides };
}

function panelInput(overrides: Partial<PanelDefinition> = {}): PanelDefinition {
  return { id: "acme.panel", title: "Panel", region: "left", ...overrides };
}

function toolInput(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return { id: "acme.tool", label: "Tool", command: { kind: "validate" }, ...overrides };
}

function layoutInput(overrides: Partial<LayoutDefinition> = {}): LayoutDefinition {
  return { id: "acme.layout", panels: [{ panelId: "palette", region: "left" }], ...overrides };
}

describe("builder configuration validates its own shapes", () => {
  it("reports a node definition without a label instead of throwing", () => {
    const issues = rejection(() =>
      createBuilder({
        registry: {
          nodes: [{ type: "acme.node", category: "acme" } as never],
        },
      }),
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "sdk.invalid-input",
        severity: "error",
        path: ["label"],
      }),
    );
  });

  it("reports a definition field that is not a string instead of coercing it", () => {
    const issues = rejection(() =>
      createBuilder({ registry: { nodes: [{ type: "acme.node", label: 42 } as never] } }),
    );

    expect(issues).toContainEqual(
      expect.objectContaining({ code: "sdk.invalid-input", path: ["label"] }),
    );
    expect(issues[0]?.message).toContain("string");
  });

  it("reports a null features object at its own path", () => {
    const issues = rejection(() => createBuilder({ features: null as never }));

    expect(issues).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", severity: "error", path: ["features"] }),
    ]);
  });

  it("reports a feature flag that is not a boolean", () => {
    const issues = rejection(() => createBuilder({ features: { minimap: "yes" } as never }));

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "sdk.invalid-input",
        path: ["features", "minimap"],
      }),
    );
  });

  it("reports a null adapter at its own path", () => {
    const issues = rejection(() => createBuilder({ adapter: null as never }));

    expect(issues).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["adapter"] }),
    ]);
  });

  it("reports adapter capabilities that are not an object or not booleans", () => {
    const nullCapabilities = rejection(() =>
      createBuilder({
        adapter: { id: "acme.engine", label: "Engine", capabilities: null } as never,
      }),
    );
    expect(nullCapabilities).toContainEqual(
      expect.objectContaining({
        code: "sdk.invalid-input",
        path: ["adapter", "capabilities"],
      }),
    );

    const unknownCapability = rejection(() =>
      createBuilder({
        adapter: { id: "acme.engine", label: "Engine", capabilities: { teleport: true } } as never,
      }),
    );
    expect(unknownCapability).toContainEqual(
      expect.objectContaining({
        code: "sdk.invalid-input",
        path: ["adapter", "capabilities", "teleport"],
      }),
    );

    const nonBoolean = rejection(() =>
      createBuilder({
        adapter: { id: "acme.engine", label: "Engine", capabilities: { minimap: 1 } } as never,
      }),
    );
    expect(nonBoolean).toContainEqual(
      expect.objectContaining({
        code: "sdk.invalid-input",
        path: ["adapter", "capabilities", "minimap"],
      }),
    );
  });

  it("reports null ui, document, registry and graph objects at their own paths", () => {
    const expectations: readonly (readonly [Record<string, unknown>, string])[] = [
      [{ ui: null }, "ui"],
      [{ document: null }, "document"],
      [{ registry: null }, "registry"],
      [{ graph: null }, "graph"],
    ];

    for (const [configuration, path] of expectations) {
      const issues = rejection(() => createBuilder(configuration as never));
      expect(issues).toEqual([
        expect.objectContaining({ code: "sdk.invalid-input", path: [path] }),
      ]);
    }
  });

  it("reports a registry list that is not an array instead of iterating it", () => {
    const issues = rejection(() => createBuilder({ registry: { nodes: {} } as never }));

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "sdk.invalid-input",
        path: ["registry", "nodes"],
      }),
    );
  });

  it("reports a configuration that is not an object at all", () => {
    const issues = rejection(() => createBuilder(null as never));

    expect(issues).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["configuration"] }),
    ]);
  });
});

describe("registration validates its own shapes", () => {
  it("rejects a null node or edge definition without throwing", () => {
    const current = builder();

    expect(rejection(() => current.registerNode(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["node"] }),
    ]);
    expect(rejection(() => current.registerEdge(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["edge"] }),
    ]);
  });

  it("rejects a node definition without a label or category", () => {
    const issues = rejection(() => builder().registerNode({ type: "acme.node" } as never));

    expect(issues.map((issue) => issue.path)).toEqual([["label"], ["category"]]);
    expect(issues.every((issue) => issue.code === "sdk.invalid-input")).toBe(true);
  });

  it("rejects an edge definition without a label", () => {
    const issues = rejection(() => builder().registerEdge({ type: "acme.edge" } as never));

    expect(issues).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["label"] }),
    ]);
  });

  it("rejects a null property or a property id that is not a string", () => {
    const current = builder();

    expect(rejection(() => current.registerProperty(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["property"] }),
    ]);
    expect(rejection(() => current.registerProperty({ type: "string" } as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-id", path: ["properties"] }),
    ]);
  });

  it("rejects a node property entry that is not an object", () => {
    const issues = rejection(() =>
      builder().registerNode({
        type: "acme.node",
        label: "Node",
        category: "acme",
        properties: [null],
      } as never),
    );

    expect(issues).toContainEqual(
      expect.objectContaining({ code: "sdk.invalid-input", path: ["property"] }),
    );
  });

  it("rejects a port group or port entry that is not shaped like ports", () => {
    const current = builder();

    expect(
      rejection(() =>
        current.registerNode({ ...nodeInput(), ports: "nope" } as never),
      ),
    ).toContainEqual(expect.objectContaining({ code: "sdk.invalid-input", path: ["ports"] }));

    expect(
      rejection(() =>
        current.registerNode({ ...nodeInput(), ports: { inputs: [null] } } as never),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "sdk.invalid-input",
        path: ["ports", "inputs", "0"],
      }),
    );
  });

  it("rejects a null panel and a panel without an id, title or region", () => {
    const current = builder();

    expect(rejection(() => current.registerPanel(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["panels"] }),
    ]);

    const issues = rejection(() => current.registerPanel({} as never));
    expect(issues.map((issue) => issue.path)).toEqual([
      ["panels", "id"],
      ["panels", "title"],
      ["panels", "region"],
    ]);
    expect(issues[0]?.code).toBe("sdk.invalid-id");
    expect(current.registries.panels.has("acme.panel")).toBe(false);
  });

  it("rejects a null tool and a tool without a command", () => {
    const current = builder();

    expect(rejection(() => current.registerTool(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["tools"] }),
    ]);

    const issues = rejection(() =>
      current.registerTool({ id: "acme.tool", label: "Tool" } as never),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "sdk.invalid-input", path: ["tools", "command"] }),
    );
  });

  it("rejects a null theme or layout input", () => {
    const current = builder();

    expect(rejection(() => current.theme.register(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["themes"] }),
    ]);
    expect(rejection(() => current.layout.register(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["layouts"] }),
    ]);
    expect(current.registries.layouts.has("acme.layout")).toBe(false);
  });

  it("rejects a layout panel placement that is not an object", () => {
    const issues = rejection(() =>
      builder().layout.register({
        id: "acme.layout",
        panels: [null],
      } as never),
    );

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "sdk.invalid-input",
        path: ["layouts", "panels", "0"],
      }),
    );
  });

  it("rejects a null plugin with sdk.plugin-invalid", () => {
    const current = builder();

    expect(rejection(() => current.use(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.plugin-invalid", path: ["plugin"] }),
    ]);
  });

  it("rejects a plugin whose install is not a function", () => {
    const issues = rejection(() =>
      builder().use({ id: "acme.plugin", version: "1.0.0" } as never),
    );

    expect(issues).toEqual([
      expect.objectContaining({ code: "sdk.plugin-invalid", path: ["install"] }),
    ]);
  });

  it("rejects a renderer binding without an id or with an unknown kind", () => {
    const current = builder();

    expect(rejection(() => current.bindRenderer("nodes", null as never, 1))).toEqual([
      expect.objectContaining({
        code: "sdk.invalid-id",
        path: ["renderers", "nodes"],
      }),
    ]);

    expect(rejection(() => current.bindRenderer(null as never, "acme.node", 1))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["renderers"] }),
    ]);

    expect(rejection(() => current.bindRenderer("teleport" as never, "acme.node", 1))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["renderers"] }),
    ]);
    expect(current.renderers.nodes.size).toBe(0);
  });

  it("rejects an editor option object that is not an object", () => {
    expect(rejection(() => builder().createEditor(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["options"] }),
    ]);
  });
});

describe("graph facade validates its own arguments", () => {
  it("rejects updateProperties with an undefined property map", () => {
    const issues = rejection(() =>
      builder().graph.updateProperties("n1", undefined as never),
    );

    expect(issues).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["properties"] }),
    ]);
  });

  it("rejects a request that is not an object", () => {
    const current = builder();

    expect(rejection(() => current.graph.addNode(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["request"] }),
    ]);
    expect(rejection(() => current.graph.connect(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["request"] }),
    ]);
    expect(rejection(() => current.graph.select(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["request"] }),
    ]);
  });

  it("rejects a node type that is not a string", () => {
    const issues = rejection(() => builder().graph.addNode({ type: 42 } as never));

    expect(issues).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["type"] }),
    ]);
  });

  it("rejects a missing node id, position or selection list", () => {
    const current = builder();

    expect(rejection(() => current.graph.removeNode(null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["nodeId"] }),
    ]);
    expect(rejection(() => current.graph.moveNode("n1", null as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["position"] }),
    ]);
    expect(rejection(() => current.graph.select({ nodes: "n1" } as never))).toEqual([
      expect.objectContaining({ code: "sdk.invalid-input", path: ["nodes"] }),
    ]);
  });

  it("reports a graph whose node definition was removed, with tolerant options", () => {
    const current = builder();
    expect(current.registerNode(nodeInput()).ok).toBe(true);
    expect(current.graph.addNode({ type: "acme.node", nodeId: "n1" }).ok).toBe(true);

    // Removing the definition the instance points at leaves a graph that is
    // structurally broken but still well-formed as data — the exact case a
    // stubbed report cannot fake.
    expect(current.registries.nodes.unregister("acme.node").ok).toBe(true);

    // `validate` is a read that returns a report, not a `Result`: a caller
    // passing no options at all must still get the full pipeline.
    const report = current.graph.validate(undefined as never);
    expect(report.issues.map((issue) => issue.code)).toEqual([
      "structural.unknown-node-definition",
    ]);
    expect(report.issues[0]).toMatchObject({ severity: "error", elementId: "n1" });
    expect(report.structurallyValid).toBe(false);
    expect(report.configurationValid).toBe(true);
    expect(report.isValid).toBe(false);

    // Tolerant means "fall back to the default options", not "ignore the call".
    expect(current.graph.validate(null as never).issues).toEqual(report.issues);
    expect(current.graph.validate(null as never).isValid).toBe(false);
  });
});

describe("the malformed-shape sweep", () => {
  it("rejects a malformed shape at every public entry point that returns a Result", () => {
    const current = builder();
    current.registerNode(nodeInput());

    const calls: readonly (readonly [string, () => Result<unknown, SdkIssues>])[] = [
      ["createBuilder({registry.nodes:[null]})", () => createBuilder({ registry: { nodes: [null] } as never })],
      ["createBuilder({registry.edges:[null]})", () => createBuilder({ registry: { edges: [null] } as never })],
      ["createBuilder({registry.properties:[null]})", () => createBuilder({ registry: { properties: [null] } as never })],
      ["createBuilder({registry.themes:[null]})", () => createBuilder({ registry: { themes: [null] } as never })],
      ["createBuilder({registry.layouts:[null]})", () => createBuilder({ registry: { layouts: [null] } as never })],
      ["createBuilder({plugins:[null]})", () => createBuilder({ plugins: [null] } as never)],
      ["createBuilder({plugins:{}})", () => createBuilder({ plugins: {} } as never)],
      ["createBuilder({features:[]})", () => createBuilder({ features: [] } as never)],
      ["createBuilder({adapter:42})", () => createBuilder({ adapter: 42 } as never)],
      ["createBuilder({document:42})", () => createBuilder({ document: 42 } as never)],
      ["createBuilder({ui:42})", () => createBuilder({ ui: 42 } as never)],
      ["createBuilder({registry:42})", () => createBuilder({ registry: 42 } as never)],
      ["createBuilder({graph:42})", () => createBuilder({ graph: 42 } as never)],
      ["registerNode({properties:5})", () => current.registerNode({ ...nodeInput(), properties: 5 } as never)],
      ["registerNode({ports:{inputs:\"x\"}})", () => current.registerNode({ ...nodeInput(), ports: { inputs: "x" } } as never)],
      ["registerProperty({options:5})", () => current.registerProperty({ id: "custom", type: "select", options: 5 } as never)],
      ["layout.register({panels:{}})", () => current.layout.register({ id: "acme.l", panels: {} } as never)],
      ["layout.register({panels:[{region:5}]})", () => current.layout.register({ id: "acme.l", panels: [{ panelId: "palette", region: 5 }] } as never)],
      ["registerTool({command:null})", () => current.registerTool({ id: "acme.t", label: "T", command: null } as never)],
      ["registerPanel({region:1})", () => current.registerPanel({ id: "acme.p", title: "P", region: 1 } as never)],
      ["theme.register(42)", () => current.theme.register(42 as never)],
      ["bindRenderer({}, …)", () => current.bindRenderer({} as never, "acme.node", 1)],
      ["bindRenderer(kind, {})", () => current.bindRenderer("nodes", {} as never, 1)],
      ["graph.addNode({position:{x:\"a\"}})", () => current.graph.addNode({ type: "acme.node", position: { x: "a" } } as never)],
      ["graph.addNode({properties:null})", () => current.graph.addNode({ type: "acme.node", properties: null } as never)],
      ["graph.connect({type:5})", () => current.graph.connect({ source: "n1", target: "n1", type: 5 } as never)],
      ["graph.moveNode({x:1})", () => current.graph.moveNode("n1", { x: 1 } as never)],
      ["graph.updateProperties(null)", () => current.graph.updateProperties("n1", null as never)],
      ["graph.setEdgeWaypoints(null)", () => current.graph.setEdgeWaypoints("e1", null as never)],
      ["graph.select({nodes:[null]})", () => current.graph.select({ nodes: [null] } as never)],
      ["use({install:\"no\"})", () => current.use({ id: "acme.plugin", version: "1.0.0", install: "no" } as never)],
      ["createEditor(\"x\")", () => current.createEditor("x" as never)],
      ["document.import(null)", () => current.document.import(null)],
      ["document.deserialize(json, null)", () => current.document.deserialize("json", null as never)],
      ["document.export(null)", () => current.document.export(null as never)],
    ];

    // A silent `ok` would pass a `not.toThrow` sweep, so every entry is asserted
    // to be an actual rejection: a non-empty diagnostic list of published codes.
    for (const [label, operation] of calls) {
      const result = call(operation);
      expect(result.ok, label).toBe(false);
      if (result.ok) continue;
      expect(Array.isArray(result.error), label).toBe(true);
      expect(result.error.length, label).toBeGreaterThan(0);
      for (const issue of result.error) {
        expect(SDK_ISSUE_CODES, `${label} → ${issue.code}`).toContain(issue.code);
        expect(issue.severity, `${label} → ${issue.code}`).toBe("error");
        expect(issue.message.length, `${label} → ${issue.code}`).toBeGreaterThan(0);
      }
    }
  });

  it("reports malformed input to the document reads that return a report or an object", () => {
    const current = builder();

    // `validate` returns a report, not a `Result`: the rejection *is* the report.
    const report = current.document.validate(null);
    expect(report.isValid).toBe(false);
    expect(report.documentValid).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);

    // `serializer` returns the object and checks its format on each call.
    const serializer = current.document.serializer(null as never);
    let serialized: ReturnType<typeof serializer.serialize> | undefined;
    expect(() => {
      serialized = serializer.serialize(current.document.create());
    }).not.toThrow();
    expect(serialized).toBeDefined();
    if (serialized === undefined) return;
    expect(serialized.ok).toBe(false);
    if (serialized.ok) return;
    expect(serialized.error).toEqual([
      expect.objectContaining({ code: "sdk.unsupported-format", severity: "error" }),
    ]);
  });
});

describe("a rejected call leaves no trace", () => {
  it("accepts the very next valid call after a rejection", () => {
    const current = builder();

    const rejected = rejection(() =>
      current.registerNode({ type: "acme.node", category: "acme" } as never),
    );
    expect(rejected).toHaveLength(1);

    const accepted = current.registerNode(nodeInput());
    expect(accepted.ok).toBe(true);
    expect(current.registries.nodes.size).toBe(1);

    const added = current.graph.addNode({ type: "acme.node", nodeId: "n1" });
    expect(added.ok).toBe(true);
    expect(current.graph.nodeCount()).toBe(1);

    expect(current.registerEdge(edgeInput()).ok).toBe(true);
    expect(current.registerProperty(propertyInput()).ok).toBe(true);
    expect(current.registerPanel(panelInput()).ok).toBe(true);
    expect(current.registerTool(toolInput()).ok).toBe(true);
    expect(current.layout.register(layoutInput()).ok).toBe(true);
    expect(current.renderers.nodes.get("acme.node")).toBeUndefined();
  });
});
