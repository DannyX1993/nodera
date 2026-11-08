import { describe, expect, it } from "vitest";
import type { Result } from "@nodera/contracts";
import { EDITOR_LAYOUT_ID, CANVAS_ONLY_LAYOUT_ID } from "@nodera/layout-engine";
import {
  DARK_THEME,
  DARK_THEME_ID,
  DEFAULT_THEME_ID,
  type CreateThemeInput,
} from "@nodera/theme-engine";
import {
  DEFAULT_PANELS,
  NODERA_CREATE_NODE_DIALOG_ID,
  type DialogDefinition,
  type LayoutDefinition,
  type PanelDefinition,
  type ToolDefinition,
} from "@nodera/ui-core";
import type { EdgeDefinitionInput } from "../authoring/edges.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import type { PropertyInput } from "../authoring/properties.js";
import type { SdkIssues } from "../errors.js";
import type { PluginRegisteredEvent } from "../events/events-api.js";
import type { BuilderPlugin } from "../plugin/plugin.js";
import { createBuilder, type Builder, type DragPolicy } from "./builder.js";
import type { BuilderConfiguration, GraphLayoutConfiguration } from "./configuration.js";

const NodeRenderer = (): null => null;
const OtherNodeRenderer = (): null => null;
const EdgeRenderer = (): null => null;
const PropertyComponent = (): null => null;

function nodeInput(
  overrides: Partial<NodeDefinitionInput> = {},
): NodeDefinitionInput {
  return {
    type: "demo.node",
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

function edgeInput(
  overrides: Partial<EdgeDefinitionInput> = {},
): EdgeDefinitionInput {
  return { type: "demo.edge", label: "Demo edge", ...overrides };
}

function propertyInput(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return { id: "demo.option", type: "string", label: "Option", ...overrides };
}

function create(configuration?: BuilderConfiguration): Builder {
  const result = createBuilder(configuration);
  if (!result.ok) {
    throw new Error(
      `unexpected builder failure: ${result.error.map((issue) => issue.code).join(", ")}`,
    );
  }
  return result.value;
}

function fail(configuration?: BuilderConfiguration): SdkIssues {
  const result = createBuilder(configuration);
  if (result.ok) {
    throw new Error("expected the builder configuration to be rejected");
  }
  return result.error;
}

describe("createBuilder defaults", () => {
  it("composes an empty, fully wired builder when the host declares nothing", () => {
    const builder = create();

    expect(builder.id).toBe("nodera.builder");
    expect(builder.adapter).toBeUndefined();
    expect(builder.diagnostics).toEqual([]);
    expect(builder.features).toEqual({
      minimap: true,
      history: true,
      validation: true,
      edgeInsertion: false,
    });
    expect(builder.registries.nodes.size).toBe(0);
    expect(builder.registries.edges.size).toBe(0);
    expect(builder.properties.size).toBe(0);
    expect(builder.registries.themes.has(DEFAULT_THEME_ID)).toBe(true);
    expect(builder.registries.themes.has(DARK_THEME_ID)).toBe(true);
    expect(builder.registries.layouts.has(EDITOR_LAYOUT_ID)).toBe(true);
    expect(builder.registries.layouts.has(CANVAS_ONLY_LAYOUT_ID)).toBe(true);
    expect(builder.registries.panels.size).toBe(DEFAULT_PANELS.length);
    expect(builder.registries.tools.size).toBeGreaterThan(0);
    expect(builder.store.getState().themeId).toBe(DEFAULT_THEME_ID);
    expect(builder.store.getState().layoutId).toBe(EDITOR_LAYOUT_ID);
    expect(builder.documentFormat).toEqual({ format: "ggd", version: "1.0.0" });
    expect(builder.editor.graph.nodeCount).toBe(0);
  });
});

describe("registry configuration", () => {
  it("translates, registers and shares every configured definition with the editor domain", () => {
    const builder = create({
      registry: {
        nodes: [nodeInput({ renderer: NodeRenderer })],
        edges: [edgeInput()],
        properties: [propertyInput()],
      },
    });

    // The read surface answers in the §9 vocabulary (`type`/`label`), not in the
    // core one (`id`/`name`); the core definitions stay reachable through the
    // documented escape hatch.
    const node = builder.registries.nodes.get("demo.node");
    expect(node).toMatchObject({
      type: "demo.node",
      label: "Demo node",
      category: "demo",
      renderer: "demo.node",
    });
    expect(Object.keys(node ?? {})).not.toContain("id");
    expect(Object.keys(node ?? {})).not.toContain("name");
    expect(node?.ports.map((port) => port.id)).toEqual(["in", "out"]);
    expect(builder.registries.edges.get("demo.edge")).toMatchObject({
      type: "demo.edge",
      label: "Demo edge",
    });
    expect(builder.properties.get("demo.option")?.type).toBe("string");

    expect(builder.editor.domain.nodes.get("demo.node")?.id).toBe("demo.node");
    expect(builder.editor.domain.edges.get("demo.edge")?.name).toBe("Demo edge");
  });

  it("aggregates every issue of every invalid entry instead of stopping at the first", () => {
    const issues = fail({
      registry: {
        nodes: [
          nodeInput({ type: "unqualified", label: "" }),
          nodeInput({ type: "demo.other", category: "" }),
        ],
      },
    });

    expect(issues).toHaveLength(3);
    expect(issues.map((issue) => issue.path)).toEqual([
      ["type"],
      ["label"],
      ["category"],
    ]);
    expect(issues.map((issue) => issue.code)).toEqual([
      "sdk.invalid-id",
      "sdk.invalid-input",
      "sdk.invalid-input",
    ]);
    expect(issues.every((issue) => issue.severity === "error")).toBe(true);
  });

  it("reports a repeated node id as a duplicate at its registry path", () => {
    const issues = fail({ registry: { nodes: [nodeInput(), nodeInput()] } });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "sdk.duplicate-id",
      severity: "error",
      path: ["registry", "nodes", "demo.node"],
    });
  });
});

describe("adapter configuration", () => {
  it("normalizes the adapter the host selects", () => {
    const builder = create({
      adapter: {
        id: "vendor.headless",
        label: "Headless engine",
        capabilities: { minimap: true },
      },
    });

    expect(builder.adapter?.id).toBe("vendor.headless");
    expect(builder.adapter?.label).toBe("Headless engine");
    expect(builder.adapter?.capabilities.minimap).toBe(true);
    expect(builder.adapter?.capabilities.dragAndDrop).toBe(false);
  });

  it("rejects an invalid adapter with its own issues", () => {
    const issues = fail({ adapter: { id: "headless", label: " " } });

    expect(issues.map((issue) => issue.path)).toEqual([
      ["adapter", "id"],
      ["adapter", "label"],
    ]);
    expect(issues.map((issue) => issue.code)).toEqual([
      "sdk.invalid-id",
      "sdk.invalid-input",
    ]);
  });
});

describe("feature configuration", () => {
  it("rejects an enabled feature the SDK does not implement", () => {
    const issues = fail({ features: { grouping: true } });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "sdk.feature-unsupported",
      path: ["features", "grouping"],
    });
  });

  it("accepts a disabled unsupported feature and keeps supported flags", () => {
    expect(create({ features: { grouping: false } }).features).toEqual({
      minimap: true,
      history: true,
      validation: true,
      edgeInsertion: false,
    });
    expect(create({ features: { history: false } }).features.history).toBe(false);
  });

  it("rejects an unknown feature key that the host enables", () => {
    const issues = fail({ features: { execution: true } });

    expect(issues[0]).toMatchObject({
      code: "sdk.feature-unsupported",
      path: ["features", "execution"],
    });
  });
});

describe("document configuration", () => {
  it("defaults to the canonical GGD document format", () => {
    expect(create().documentFormat).toEqual({ format: "ggd", version: "1.0.0" });
  });

  it("keeps a valid format and version", () => {
    const builder = create({
      document: { format: "ggd", version: "2.1.0-beta.1" },
    });

    expect(builder.documentFormat).toEqual({
      format: "ggd",
      version: "2.1.0-beta.1",
    });
  });

  it("rejects a document format the framework does not define", () => {
    const issues = fail({ document: { format: "json" as "ggd" } });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "sdk.unsupported-format",
      path: ["document", "format"],
    });
  });

  it("rejects a document version that is not semver-shaped", () => {
    const issues = fail({ document: { version: "1.0" } });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "sdk.document-invalid",
      path: ["document", "version"],
    });
  });
});

describe("ui configuration", () => {
  it("applies the theme and layout the host selects", () => {
    const builder = create({
      ui: { theme: DARK_THEME_ID, layout: CANVAS_ONLY_LAYOUT_ID },
    });

    expect(builder.store.getState().themeId).toBe(DARK_THEME_ID);
    expect(builder.store.getState().layoutId).toBe(CANVAS_ONLY_LAYOUT_ID);
  });

  it("rejects a theme the registry does not provide", () => {
    const issues = fail({ ui: { theme: "acme.missing" } });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "sdk.unknown-theme",
      path: ["ui", "theme"],
    });
  });

  it("rejects a layout the registry does not provide", () => {
    const issues = fail({ ui: { layout: "acme.missing" } });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "sdk.unknown-layout",
      path: ["ui", "layout"],
    });
  });

  it("composes the Phase 5 panels into the initial layout state", () => {
    const builder = create();

    const state = builder.store.getState().layout;
    expect(state?.panels.map((panel) => panel.panelId)).toEqual([
      "header",
      "palette",
      "properties",
      "validation",
    ]);
    expect(state?.panels.map((panel) => panel.region)).toEqual([
      "header",
      "left",
      "right",
      "bottom",
    ]);
    expect(builder.registries.panels.get("palette")?.size).toBe(240);
    expect(builder.registries.panels.all().map((panel) => panel.id)).toEqual(
      DEFAULT_PANELS.map((panel) => panel.id),
    );
  });
});

describe("renderer bindings", () => {
  it("binds every authored node, edge and custom-property renderer", () => {
    const builder = create({
      registry: {
        nodes: [
          nodeInput({
            renderer: NodeRenderer,
            properties: [
              { id: "script", type: "custom", component: PropertyComponent },
            ],
          }),
        ],
        edges: [edgeInput({ renderer: EdgeRenderer })],
      },
    });

    expect(builder.renderers.nodes.get("demo.node")).toBe(NodeRenderer);
    expect(builder.renderers.edges.get("demo.edge")).toBe(EdgeRenderer);
    expect(builder.renderers.properties.get("demo.node.script")).toBe(
      PropertyComponent,
    );
  });

  it("reports adapter capability gaps as warnings without failing", () => {
    const builder = create({
      adapter: { id: "vendor.headless", label: "Headless engine" },
      registry: { nodes: [nodeInput({ renderer: NodeRenderer })] },
    });

    expect(builder.diagnostics.length).toBeGreaterThan(0);
    expect(builder.diagnostics.every((issue) => issue.severity === "warning")).toBe(
      true,
    );
    expect(builder.diagnostics[0]).toMatchObject({
      code: "sdk.renderer-unsupported",
      metadata: { adapterId: "vendor.headless", capability: "nodeRenderers" },
    });
    expect(builder.renderers.nodes.get("demo.node")).toBe(NodeRenderer);
  });
});

describe("post-construction registration", () => {
  it("registers and binds a node, an edge and a property, and leaves state untouched on duplicates", () => {
    const builder = create();

    expect(builder.registerNode(nodeInput({ renderer: NodeRenderer })).ok).toBe(
      true,
    );
    expect(builder.registries.nodes.get("demo.node")).toBeDefined();
    expect(builder.renderers.nodes.get("demo.node")).toBe(NodeRenderer);

    const bindings = builder.renderers;
    const duplicateNode = builder.registerNode(
      nodeInput({ renderer: OtherNodeRenderer }),
    );
    expect(duplicateNode.ok).toBe(false);
    if (duplicateNode.ok) return;
    expect(duplicateNode.error[0]).toMatchObject({
      code: "sdk.duplicate-id",
      path: ["nodes", "demo.node"],
    });
    expect(builder.registries.nodes.size).toBe(1);
    expect(builder.renderers).toBe(bindings);
    expect(builder.renderers.nodes.get("demo.node")).toBe(NodeRenderer);

    expect(builder.registerEdge(edgeInput({ renderer: EdgeRenderer })).ok).toBe(
      true,
    );
    expect(builder.registries.edges.get("demo.edge")).toBeDefined();
    expect(builder.renderers.edges.get("demo.edge")).toBe(EdgeRenderer);

    expect(builder.registerProperty(propertyInput()).ok).toBe(true);
    expect(builder.properties.size).toBe(1);
    const duplicateProperty = builder.registerProperty(propertyInput());
    expect(duplicateProperty.ok).toBe(false);
    if (duplicateProperty.ok) return;
    expect(duplicateProperty.error[0]).toMatchObject({
      code: "sdk.duplicate-id",
      path: ["properties", "demo.option"],
    });
    expect(builder.properties.size).toBe(1);
  });

  it("registers panels and tools and binds opaque panel renderers", () => {
    const builder = create();
    const panel: PanelDefinition = {
      id: "demo.panel",
      title: "Demo panel",
      region: "left",
    };
    const tool: ToolDefinition = {
      id: "tool.demo",
      label: "Demo tool",
      command: { kind: "validate" },
    };

    expect(builder.registerPanel(panel).ok).toBe(true);
    expect(builder.registries.panels.get("demo.panel")).toBe(panel);
    const duplicatePanel = builder.registerPanel(panel);
    expect(duplicatePanel.ok).toBe(false);
    if (duplicatePanel.ok) return;
    expect(duplicatePanel.error[0]).toMatchObject({
      code: "sdk.duplicate-id",
      path: ["panels", "demo.panel"],
    });
    expect(builder.registries.panels.size).toBe(DEFAULT_PANELS.length + 1);

    expect(builder.registerTool(tool).ok).toBe(true);
    expect(builder.registries.tools.get("tool.demo")).toBe(tool);
    const duplicateTool = builder.registerTool(tool);
    expect(duplicateTool.ok).toBe(false);
    if (duplicateTool.ok) return;
    expect(duplicateTool.error[0]).toMatchObject({
      code: "sdk.duplicate-id",
      path: ["tools", "tool.demo"],
    });

    const Component = (): null => null;
    const bound = builder.bindRenderer("panels", "demo.panel", Component);
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    expect(bound.value).toBe(builder);
    expect(builder.renderers.panels.get("demo.panel")).toBe(Component);

    const rebound = builder.bindRenderer("panels", "demo.panel", Component);
    expect(rebound.ok).toBe(false);
    if (rebound.ok) return;
    expect(rebound.error[0]).toMatchObject({ code: "sdk.duplicate-id" });
  });
});

describe("editor sessions", () => {
  it("creates editors that share the builder registries", () => {
    const builder = create();
    const created = builder.createEditor({ graphId: "custom-graph" });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const editor = created.value;
    expect(String(editor.graph.id)).toBe("custom-graph");
    expect(editor).not.toBe(builder.editor);
    expect(editor.domain).toBe(builder.editor.domain);

    expect(builder.registerNode(nodeInput()).ok).toBe(true);
    expect(editor.domain.nodes.get("demo.node")).toBeDefined();
  });

  it("refuses every builder extension after dispose and tolerates disposing twice", () => {
    const builder = create();

    builder.dispose();
    builder.dispose();

    const editor = builder.createEditor();
    expect(editor.ok).toBe(false);
    if (editor.ok) return;
    expect(editor.error[0]).toMatchObject({ code: "sdk.disposed" });

    const node = builder.registerNode(nodeInput());
    expect(node.ok).toBe(false);
    if (node.ok) return;
    expect(node.error[0]).toMatchObject({ code: "sdk.disposed" });

    const tool = builder.registerTool({
      id: "tool.demo",
      label: "Demo tool",
      command: { kind: "validate" },
    });
    expect(tool.ok).toBe(false);
    if (tool.ok) return;
    expect(tool.error[0]).toMatchObject({ code: "sdk.disposed" });

    const binding = builder.bindRenderer("panels", "demo.panel", null);
    expect(binding.ok).toBe(false);
    if (binding.ok) return;
    expect(binding.error[0]).toMatchObject({ code: "sdk.disposed" });
  });
});

describe("disposal", () => {
  /** A builder with one registered definition and one node already added. */
  function disposableView(): Builder {
    const builder = create();
    builder.registerNode(nodeInput());
    builder.graph.addNode({ type: "demo.node", nodeId: "n1" });
    builder.graph.select({ nodes: ["n1"] });
    builder.dispose();
    return builder;
  }

  it("refuses every graph mutation and document import after dispose", () => {
    const builder = disposableView();
    const exported = builder.document.create();

    const mutations: readonly (readonly [string, () => Result<unknown, SdkIssues>])[] = [
      ["graph.addNode", () => builder.graph.addNode({ type: "demo.node" })],
      ["graph.removeNode", () => builder.graph.removeNode("n1")],
      ["graph.moveNode", () => builder.graph.moveNode("n1", { x: 1, y: 2 })],
      ["graph.updateProperties", () => builder.graph.updateProperties("n1", { a: 1 })],
      [
        "graph.connect",
        () => builder.graph.connect({ source: "n1", target: "n1", sourcePort: "out", targetPort: "in" }),
      ],
      ["graph.disconnect", () => builder.graph.disconnect("e1")],
      ["graph.select", () => builder.graph.select({ nodes: ["n1"] })],
      ["graph.clearSelection", () => builder.graph.clearSelection()],
      ["document.import", () => builder.document.import(exported)],
    ];

    for (const [operation, call] of mutations) {
      const result = call();
      expect(result.ok).toBe(false);
      if (result.ok) {
        continue;
      }
      expect(result.error).toEqual([
        expect.objectContaining({
          code: "sdk.disposed",
          severity: "error",
          metadata: { operation },
        }),
      ]);
    }

    // undo/redo keep the history engine's boolean signature, so a disposed
    // builder performs no mutation and reports `false` instead of a code.
    expect(builder.graph.undo()).toBe(false);
    expect(builder.graph.redo()).toBe(false);

    expect(builder.graph.nodeCount()).toBe(1);
    expect(builder.graph.selectedNodes()).toEqual(["n1"]);
    expect(builder.document.create().graph.nodes.map((node) => node.id)).toEqual(["n1"]);
  });

  it("keeps every read working after dispose", () => {
    const builder = disposableView();
    const listened: string[] = [];

    expect(builder.graph.validate().isValid).toBe(true);
    expect(builder.graph.nodeCount()).toBe(1);
    expect(builder.graph.edgeCount()).toBe(0);
    expect(builder.graph.selectedNodes()).toEqual(["n1"]);
    expect(builder.graph.selectedEdges()).toEqual([]);
    expect(builder.graph.canUndo()).toBe(true);
    expect(builder.graph.canRedo()).toBe(false);

    const document = builder.document.create();
    expect(builder.document.validate(document).documentValid).toBe(true);
    expect(builder.document.export("json").ok).toBe(true);
    const serialized = builder.document.serialize("yaml");
    expect(serialized.ok).toBe(true);
    if (serialized.ok) {
      expect(builder.document.deserialize("yaml", serialized.value).ok).toBe(true);
    }

    const off = builder.events.on("node.created", () => {
      listened.push("node.created");
    });
    expect(typeof off).toBe("function");
    off();

    expect(builder.theme.active().id).toBe(DEFAULT_THEME_ID);
    expect(builder.theme.all().map((theme) => theme.id)).toContain(DEFAULT_THEME_ID);
    expect(builder.layout.active().id).toBe(EDITOR_LAYOUT_ID);
    expect(builder.layout.all().map((layout) => layout.id)).toContain(EDITOR_LAYOUT_ID);
    expect(builder.registries.nodes.get("demo.node")).toBeDefined();
    expect(listened).toEqual([]);
  });
});

describe("public error shape", () => {  it("reports bindRenderer and createEditor failures as SdkIssues lists", () => {
    const builder = create();
    const Component = (): null => null;
    expect(builder.bindRenderer("panels", "demo.panel", Component).ok).toBe(true);

    const rebound = builder.bindRenderer("panels", "demo.panel", Component);
    expect(rebound.ok).toBe(false);
    if (rebound.ok) return;
    const reboundIssues: SdkIssues = rebound.error;
    expect(Array.isArray(reboundIssues)).toBe(true);
    expect(reboundIssues[0]).toMatchObject({
      code: "sdk.duplicate-id",
      severity: "error",
      path: ["renderers", "panels", "demo.panel"],
    });

    builder.dispose();
    const created = builder.createEditor();
    expect(created.ok).toBe(false);
    if (created.ok) return;
    const createdIssues: SdkIssues = created.error;
    expect(Array.isArray(createdIssues)).toBe(true);
    expect(createdIssues[0]).toMatchObject({ code: "sdk.disposed", severity: "error" });
    expect(createdIssues).toHaveLength(1);
  });
});

describe("builder identity", () => {
  it("accepts a qualified builder id and rejects an unqualified one", () => {
    expect(create({ id: "acme.builder" }).id).toBe("acme.builder");

    const issues = fail({ id: "builder" });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "sdk.invalid-id", path: ["id"] });
  });
});

function themeInput(overrides: Partial<CreateThemeInput> = {}): CreateThemeInput {
  return { id: "acme.brand", name: "Acme brand", tokens: DARK_THEME.tokens, ...overrides };
}

function layoutInput(overrides: Partial<LayoutDefinition> = {}): LayoutDefinition {
  return {
    id: "acme.layout",
    panels: [{ panelId: "palette", region: "left" }],
    ...overrides,
  };
}

describe("builder.use", () => {
  it("installs a plugin through the builder and emits one plugin.registered", () => {
    const builder = create();
    const registered: PluginRegisteredEvent[] = [];
    builder.events.on("plugin.registered", (payload) => {
      registered.push(payload);
    });
    const plugin: BuilderPlugin = {
      id: "acme.nodes",
      version: "1.0.0",
      install(api) {
        api.nodes.register(nodeInput());
      },
    };

    const installed = builder.use(plugin);

    expect(installed.ok).toBe(true);
    if (!installed.ok) return;
    expect(installed.value).toEqual({
      pluginId: "acme.nodes",
      version: "1.0.0",
      contributionIds: ["demo.node"],
    });
    expect(builder.registries.nodes.has("demo.node")).toBe(true);
    expect(registered).toEqual([
      { pluginId: "acme.nodes", version: "1.0.0", contributionIds: ["demo.node"] },
    ]);
  });

  it("refuses to install a plugin after dispose", () => {
    const builder = create();
    builder.dispose();
    let calls = 0;

    const installed = builder.use({
      id: "acme.nodes",
      version: "1.0.0",
      install: () => {
        calls += 1;
      },
    });

    expect(installed.ok).toBe(false);
    if (installed.ok) return;
    expect(installed.error[0]).toMatchObject({ code: "sdk.disposed" });
    expect(calls).toBe(0);
  });
});

describe("plugin configuration", () => {
  it("applies every configured plugin while composing the builder", () => {
    const builder = create({
      plugins: [
        {
          id: "acme.one",
          version: "1.0.0",
          install(api) {
            api.nodes.register(nodeInput());
          },
        },
        {
          id: "acme.two",
          version: "2.0.0",
          install(api) {
            api.edges.register(edgeInput());
          },
        },
      ],
    });

    expect(builder.registries.nodes.has("demo.node")).toBe(true);
    expect(builder.registries.edges.has("demo.edge")).toBe(true);
  });

  it("fails closed with the issues of a plugin that cannot install", () => {
    const issues = fail({
      plugins: [
        {
          id: "acme.bad",
          version: "1.0.0",
          install(api) {
            api.nodes.register(nodeInput({ type: "unqualified" }));
          },
        },
      ],
    });

    expect(issues.map((issue) => issue.code)).toEqual(["sdk.invalid-id"]);
  });

  it("reports a configured plugin that is rejected before install", () => {
    const issues = fail({
      plugins: [{ id: "acme", version: "1.0", install: () => {} }],
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "sdk.plugin-invalid",
      "sdk.plugin-invalid",
    ]);
    expect(issues.map((issue) => issue.path)).toEqual([["id"], ["version"]]);
  });
});

describe("theme API", () => {
  it("registers a theme built by createTheme into the theme registry", () => {
    const builder = create();

    const registered = builder.theme.register(themeInput());

    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    expect(registered.value).toMatchObject({ id: "acme.brand", name: "Acme brand" });
    expect(builder.registries.themes.get("acme.brand")).toBe(registered.value);
  });

  it("reports a duplicate theme id", () => {
    const builder = create();
    expect(builder.theme.register(themeInput()).ok).toBe(true);

    const duplicate = builder.theme.register(themeInput());

    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.error[0]).toMatchObject({
      code: "sdk.duplicate-id",
      severity: "error",
      path: ["themes", "acme.brand"],
    });
    expect(builder.registries.themes.size).toBe(3);
  });

  it("surfaces an invalid theme as sdk.invalid-input without throwing", () => {
    const builder = create();

    expect(() => builder.theme.register(themeInput({ name: "" }))).not.toThrow();
    const registered = builder.theme.register(themeInput({ name: "" }));

    expect(registered.ok).toBe(false);
    if (registered.ok) return;
    expect(registered.error).toHaveLength(1);
    expect(registered.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      severity: "error",
      path: ["themes"],
    });
    expect(registered.error[0]?.message).toContain("theme name must not be empty");
    expect(builder.registries.themes.has("acme.brand")).toBe(false);
  });

  it("refuses an unknown theme id and keeps the active theme", () => {
    const builder = create();
    const before = builder.theme.active();

    const selected = builder.theme.setDefault("acme.missing");

    expect(selected.ok).toBe(false);
    if (selected.ok) return;
    expect(selected.error[0]).toMatchObject({
      code: "sdk.unknown-theme",
      severity: "error",
    });
    expect(builder.theme.active()).toBe(before);
    expect(builder.store.getState().themeId).toBe(DEFAULT_THEME_ID);
  });

  it("changes the active theme through the UI state store", () => {
    const builder = create();
    expect(builder.theme.register(themeInput()).ok).toBe(true);

    const selected = builder.theme.setDefault("acme.brand");

    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(builder.store.getState().themeId).toBe("acme.brand");
    expect(builder.theme.active()).toBe(selected.value);
    expect(builder.registries.themes.getDefault()).toBe(selected.value);
  });

  it("reports the active theme and every registered one", () => {
    const builder = create();
    expect(builder.theme.active().id).toBe(DEFAULT_THEME_ID);
    expect(builder.theme.all().map((theme) => theme.id)).toEqual([
      DEFAULT_THEME_ID,
      DARK_THEME_ID,
    ]);

    expect(builder.theme.register(themeInput()).ok).toBe(true);

    expect(builder.theme.all().map((theme) => theme.id)).toEqual([
      DEFAULT_THEME_ID,
      DARK_THEME_ID,
      "acme.brand",
    ]);
  });
});

describe("layout API", () => {
  it("registers a layout into the layout registry", () => {
    const builder = create();
    const layout = layoutInput();

    const registered = builder.layout.register(layout);

    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    expect(registered.value).toBe(layout);
    expect(builder.registries.layouts.get("acme.layout")).toBe(layout);
  });

  it("reports a duplicate layout id", () => {
    const builder = create();
    expect(builder.layout.register(layoutInput()).ok).toBe(true);

    const duplicate = builder.layout.register(layoutInput());

    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.error[0]).toMatchObject({
      code: "sdk.duplicate-id",
      severity: "error",
      path: ["layouts", "acme.layout"],
    });
  });

  it("surfaces an invalid layout as sdk.invalid-input without throwing", () => {
    const builder = create();
    const invalid = layoutInput({ panels: [{ panelId: "", region: "left" }] });

    expect(() => builder.layout.register(invalid)).not.toThrow();
    const registered = builder.layout.register(invalid);

    expect(registered.ok).toBe(false);
    if (registered.ok) return;
    expect(registered.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      severity: "error",
      path: ["layouts", "panels", "0", "panelId"],
    });
    expect(builder.registries.layouts.has("acme.layout")).toBe(false);
  });

  it("refuses an unknown layout id and keeps the active layout", () => {
    const builder = create();
    const before = builder.layout.active();

    const selected = builder.layout.setDefault("acme.missing");

    expect(selected.ok).toBe(false);
    if (selected.ok) return;
    expect(selected.error[0]).toMatchObject({
      code: "sdk.unknown-layout",
      severity: "error",
    });
    expect(builder.layout.active()).toBe(before);
    expect(builder.store.getState().layoutId).toBe(EDITOR_LAYOUT_ID);
  });

  it("changes the active layout and its panel state through the UI state store", () => {
    const builder = create();
    expect(builder.layout.register(layoutInput()).ok).toBe(true);

    const selected = builder.layout.setDefault("acme.layout");

    expect(selected.ok).toBe(true);
    if (!selected.ok) return;
    expect(builder.store.getState().layoutId).toBe("acme.layout");
    expect(builder.layout.active()).toBe(selected.value);
    expect(
      builder.store.getState().layout?.panels.map((panel) => [panel.panelId, panel.region]),
    ).toEqual([["palette", "left"]]);
  });

  it("reports the active layout and every registered one", () => {
    const builder = create();
    expect(builder.layout.active().id).toBe(EDITOR_LAYOUT_ID);
    expect(builder.layout.all().map((layout) => layout.id)).toEqual([
      EDITOR_LAYOUT_ID,
      CANVAS_ONLY_LAYOUT_ID,
      "nodera.layout.ide",
    ]);
  });
});

describe("dialog registry", () => {
  const HOST_DIALOG: DialogDefinition = {
    id: "acme.dialog.insert",
    title: "Insert node",
    size: "sm",
  };

  it("composes the built-in dialogs, so the composed store opens the node-creation dialog", () => {
    const builder = create();

    const opened = builder.store.openDialog(NODERA_CREATE_NODE_DIALOG_ID);

    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.id).toBe(NODERA_CREATE_NODE_DIALOG_ID);
    expect(builder.store.getState().activeDialogId).toBe(NODERA_CREATE_NODE_DIALOG_ID);
    expect(builder.dialogs.all().map((dialog) => dialog.id)).toEqual([
      NODERA_CREATE_NODE_DIALOG_ID,
    ]);
  });

  it("registers a configured host dialog and replaces the built-in list with it", () => {
    const builder = create({ registry: { dialogs: [HOST_DIALOG] } });

    expect(builder.dialogs.all()).toEqual([HOST_DIALOG]);
    expect(builder.store.openDialog("acme.dialog.insert").ok).toBe(true);
    expect(builder.store.getState().activeDialogId).toBe("acme.dialog.insert");
    // The declared list replaces the built-ins, `DialogRegistry`'s own rule.
    expect(builder.store.openDialog(NODERA_CREATE_NODE_DIALOG_ID).ok).toBe(false);
  });

  it("refuses a malformed dialog declaration at its registry path", () => {
    const issues = fail({
      registry: { dialogs: [{ id: "acme.dialog.bad", title: "" } as DialogDefinition] },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "sdk.invalid-input",
      severity: "error",
      path: ["registry", "dialogs", "title"],
    });
  });

  it("reports a repeated dialog id as a duplicate at its registry path", () => {
    const issues = fail({ registry: { dialogs: [HOST_DIALOG, HOST_DIALOG] } });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "sdk.duplicate-id",
      path: ["registry", "dialogs", "acme.dialog.insert"],
    });
  });

  it("registers a dialog at runtime and refuses a duplicate", () => {
    const builder = create();

    const registered = builder.dialogs.register(HOST_DIALOG);

    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    expect(registered.value).toBe(HOST_DIALOG);
    expect(builder.dialogs.all().map((dialog) => dialog.id)).toEqual([
      NODERA_CREATE_NODE_DIALOG_ID,
      "acme.dialog.insert",
    ]);
    expect(builder.store.openDialog("acme.dialog.insert").ok).toBe(true);

    const duplicate = builder.dialogs.register(HOST_DIALOG);

    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.error[0]).toMatchObject({
      code: "sdk.duplicate-id",
      severity: "error",
      path: ["dialogs", "acme.dialog.insert"],
    });
    expect(builder.dialogs.all()).toHaveLength(2);
  });

  it("refuses a dialog registration on a disposed builder", () => {
    const builder = create();
    builder.dispose();

    const registered = builder.dialogs.register(HOST_DIALOG);

    expect(registered.ok).toBe(false);
    if (registered.ok) return;
    expect(registered.error[0]).toMatchObject({
      code: "sdk.disposed",
      metadata: { operation: "dialogs.register" },
    });
    expect(builder.dialogs.all().map((dialog) => dialog.id)).toEqual([
      NODERA_CREATE_NODE_DIALOG_ID,
    ]);
  });
});

describe("theme and layout registry configuration", () => {
  it("registers configured themes and layouts and applies the selected ones", () => {
    const builder = create({
      registry: { themes: [themeInput()], layouts: [layoutInput()] },
      ui: { theme: "acme.brand", layout: "acme.layout" },
    });

    expect(builder.registries.themes.has("acme.brand")).toBe(true);
    expect(builder.registries.layouts.has("acme.layout")).toBe(true);
    expect(builder.store.getState().themeId).toBe("acme.brand");
    expect(builder.store.getState().layoutId).toBe("acme.layout");
    expect(builder.theme.active().id).toBe("acme.brand");
    expect(builder.layout.active().id).toBe("acme.layout");
  });

  it("aggregates duplicate and invalid registry entries with every other issue", () => {
    const issues = fail({
      registry: {
        themes: [
          themeInput(),
          themeInput(),
          themeInput({ id: "acme.other", name: "" }),
        ],
        layouts: [layoutInput(), layoutInput()],
      },
      ui: { theme: "acme.missing" },
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "sdk.duplicate-id",
      "sdk.invalid-input",
      "sdk.duplicate-id",
      "sdk.unknown-theme",
    ]);
    expect(issues.map((issue) => issue.path)).toEqual([
      ["registry", "themes", "acme.brand"],
      ["registry", "themes"],
      ["registry", "layouts", "acme.layout"],
      ["ui", "theme"],
    ]);
  });
});

describe("graph layout drag policy", () => {
  it("locks a manual drag when the layout owns the positions", () => {
    const builder = create({ graph: { layout: { mode: "auto" } } });

    expect(builder.graphLayout.dragPolicy()).toBe("locked");
    expect(builder.store.getState().dragPolicy).toBe("locked");
  });

  it("declares the snap-back policy from configuration", () => {
    const builder = create({
      graph: { layout: { mode: "auto", drag: "snap-back" } },
    });

    expect(builder.graphLayout.dragPolicy()).toBe("snap-back");
    expect(builder.store.getState().dragPolicy).toBe("snap-back");
  });

  it("keeps today's drag behaviour when the host owns the positions", () => {
    expect(create().graphLayout.dragPolicy()).toBe("free");
    expect(
      create({ graph: { layout: { mode: "free", drag: "locked" } } }).graphLayout.dragPolicy(),
    ).toBe("free");
  });

  const refusedPolicies: readonly unknown[] = ["bounce", "", "free", 42, null];
  it.each(refusedPolicies)(
    "refuses the drag policy %s at graph.layout.drag and creates no builder",
    (drag) => {
      const issues = fail({
        graph: { layout: { mode: "auto", drag } as unknown as GraphLayoutConfiguration },
      });

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        code: "sdk.invalid-input",
        path: ["graph", "layout", "drag"],
      });
    },
  );

  it("changes the policy at runtime and reflects it in the UI state", () => {
    const builder = create({ graph: { layout: { mode: "auto" } } });

    const changed = builder.graphLayout.setDragPolicy("free");

    expect(changed.ok).toBe(true);
    expect(changed.ok && changed.value).toBe("free");
    expect(builder.graphLayout.dragPolicy()).toBe("free");
    expect(builder.store.getState().dragPolicy).toBe("free");
  });

  it("refuses an unknown policy at runtime and keeps the previous one", () => {
    const builder = create({
      graph: { layout: { mode: "auto", drag: "snap-back" } },
    });
    const before = builder.store.getState();
    let notifications = 0;
    builder.store.subscribe(() => notifications++);

    const refused = builder.graphLayout.setDragPolicy("bounce" as DragPolicy);

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      path: ["graph", "layout", "drag"],
    });
    expect(builder.graphLayout.dragPolicy()).toBe("snap-back");
    expect(builder.store.getState()).toBe(before);
    expect(notifications).toBe(0);
  });

  it("refuses a policy change on a disposed builder", () => {
    const builder = create({ graph: { layout: { mode: "auto" } } });
    builder.dispose();

    const refused = builder.graphLayout.setDragPolicy("free");

    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error[0]?.code).toBe("sdk.disposed");
    expect(builder.graphLayout.dragPolicy()).toBe("locked");
  });
});
