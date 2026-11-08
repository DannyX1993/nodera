import { describe, expect, it } from "vitest";
import { EDITOR_LAYOUT_ID, CANVAS_ONLY_LAYOUT_ID } from "@nodera/layout-engine";
import { DARK_THEME_ID, DEFAULT_THEME_ID } from "@nodera/theme-engine";
import {
  DEFAULT_PANELS,
  type PanelDefinition,
  type ToolDefinition,
} from "@nodera/ui-core";
import type { EdgeDefinitionInput } from "../authoring/edges.js";
import type { NodeDefinitionInput } from "../authoring/nodes.js";
import type { PropertyInput } from "../authoring/properties.js";
import type { SdkIssues } from "../errors.js";
import { createBuilder, type Builder } from "./builder.js";
import type { BuilderConfiguration } from "./configuration.js";

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

    const node = builder.registries.nodes.get("demo.node");
    expect(node).toMatchObject({
      id: "demo.node",
      name: "Demo node",
      category: "demo",
      renderer: "demo.node",
    });
    expect(node?.ports.map((port) => port.id)).toEqual(["in", "out"]);
    expect(builder.registries.edges.get("demo.edge")).toMatchObject({
      id: "demo.edge",
      name: "Demo edge",
    });
    expect(builder.properties.get("demo.option")?.type).toBe("string");

    expect(builder.editor.domain.nodes.get("demo.node")).toBe(node);
    expect(builder.editor.domain.edges.get("demo.edge")).toBe(
      builder.registries.edges.get("demo.edge"),
    );
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
    expect(rebound.error).toMatchObject({ code: "sdk.duplicate-id" });
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

  it("refuses every operation after dispose and tolerates disposing twice", () => {
    const builder = create();

    builder.dispose();
    builder.dispose();

    const editor = builder.createEditor();
    expect(editor.ok).toBe(false);
    if (editor.ok) return;
    expect(editor.error).toMatchObject({ code: "sdk.disposed" });

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
    expect(binding.error).toMatchObject({ code: "sdk.disposed" });
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
