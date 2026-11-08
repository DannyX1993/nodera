import { describe, expect, it } from "vitest";

import type {
  Connection,
  CreateThemeInput,
  DesignTokens,
  DocumentValidationReport,
  Edge,
  EdgeDefinition,
  Graph,
  GraphDocument,
  GraphSettings,
  LayoutDefinition,
  LayoutState,
  Node,
  NodeDefinition,
  NodePosition,
  PanelDefinition,
  PanelRegion,
  PortDeclaration,
  PropertyDefinition,
  PropertyOption,
  PropertyType,
  ThemeDefinition,
  ToolAvailability,
  ToolCommand,
  ToolDefinition,
  ValidationIssue,
  ValidationLevel,
  ValidationReport,
} from "./index.js";
import {
  DEFAULT_BUILDER_ID,
  SDK_EVENT_NAMES,
  SDK_ISSUE_CODES,
  assertOk,
  assertValid,
  capabilityGaps,
  createBuilder,
  installPlugin,
  isQualifiedId,
  normalizeAdapter,
  requirementsFrom,
  sdkError,
  toEdgeDefinition,
  toNodeDefinition,
  toPropertyDefinition,
  withRendererBinding,
  EMPTY_RENDERER_BINDINGS,
  RENDERER_KINDS,
  type Builder,
  type BuilderPlugin,
} from "./index.js";

/**
 * Guard for the SDK entry point: this file is the only supported import for a
 * host application. Everything a third party needs must be reachable from here,
 * through the public vocabulary, without touching an internal module.
 */

describe("public SDK surface", () => {
  it("exports the documented vocabulary", () => {
    expect(SUPPORTED_EXPORTS).toEqual(
      expect.arrayContaining([
        "ADAPTER_CAPABILITIES",
        "DEFAULT_BUILDER_ID",
        "EMPTY_RENDERER_BINDINGS",
        "RENDERER_KINDS",
        "SDK_EVENT_NAMES",
        "SDK_ISSUE_CODES",
        "SUPPORTED_FEATURES",
        "SdkAssertionError",
        "assertOk",
        "assertValid",
        "capabilityGaps",
        "createBuilder",
        "installPlugin",
        "isQualifiedId",
        "normalizeAdapter",
        "requirementsFrom",
        "resolveFeatures",
        "sdkError",
        "toEdgeDefinition",
        "toIssues",
        "toNodeDefinition",
        "toPortDeclarations",
        "toPropertyDefinition",
        "withRendererBinding",
      ]),
    );
  });

  it("publishes the vocabulary its own signatures use", () => {
    // `PublicVocabulary` names one re-exported type per entry, so the guard only
    // compiles while the barrel publishes every one of them; the count is its
    // runtime side and is itself checked against the tuple length.
    expect(VOCABULARY_TYPE_COUNT).toBe(27);
  });

  it("lets a host type a theme input and a layout with the exported names", () => {
    const tokens: DesignTokens = {
      colors: {},
      spacing: {},
      typography: {},
      borders: {},
      shadows: {},
      icons: {},
      node: {},
      edge: {},
      handle: {},
      selection: {},
      canvas: {},
    };
    const themeInput: CreateThemeInput = { id: "acme.brand", name: "Acme brand", tokens };
    const layout: LayoutDefinition = {
      id: "acme.layout",
      panels: [{ panelId: "palette", region: "left" }],
    };

    const builder = assertValid(createBuilder());
    const theme: ThemeDefinition = assertValid(builder.theme.register(themeInput));
    const registered: LayoutDefinition = assertValid(builder.layout.register(layout));

    expect(theme.name).toBe("Acme brand");
    expect(builder.theme.all().map((entry) => entry.id)).toContain("acme.brand");
    expect(registered.panels).toEqual([{ panelId: "palette", region: "left" }]);
  });

  it("exposes a closed diagnostic vocabulary a host can render", () => {
    expect(SDK_ISSUE_CODES).toContain("sdk.invalid-id");
    expect(SDK_ISSUE_CODES).toContain("sdk.plugin-conflict");
    expect(SDK_EVENT_NAMES).toEqual(["plugin.registered", "plugin.error"]);
    expect(RENDERER_KINDS).toContain("nodes");
    expect(EMPTY_RENDERER_BINDINGS.nodes.size).toBe(0);
  });
});

describe("a host integrates through the entry point only", () => {
  const Node = (): null => null;

  function build(): Builder {
    return assertValid(
      createBuilder({
        adapter: { id: "demo.engine", label: "Demo engine", capabilities: {} },
        registry: {
          nodes: [
            {
              type: "demo.input",
              label: "Input",
              category: "io",
              icon: "inbox",
              ports: { outputs: [{ id: "out", dataType: "string" }] },
              properties: [{ id: "value", type: "string" }],
              renderer: Node,
            },
            {
              type: "demo.output",
              label: "Output",
              category: "io",
              ports: { inputs: [{ id: "in", dataType: "string" }] },
            },
          ],
          edges: [{ type: "demo.flow", label: "Flow" }],
        },
        features: { minimap: false },
        document: { format: "ggd", version: "1.0.0" },
      }),
    );
  }

  it("composes, edits, validates and exports a graph", () => {
    const builder = build();
    const events: string[] = [];
    builder.events.on("node.created", () => events.push("node.created"));

    const source = assertValid(
      builder.graph.addNode({ type: "demo.input", nodeId: "n1" }),
    );
    const target = assertValid(
      builder.graph.addNode({ type: "demo.output", nodeId: "n2" }),
    );
    const edge = assertValid(
      builder.graph.connect({ source: source.id, target: target.id }),
    );

    expect(builder.graph.nodeCount()).toBe(2);
    expect(edge.id).toBeTruthy();
    expect(events).toEqual(["node.created", "node.created"]);
    expect(builder.graph.validate().issues).toEqual([]);

    const text = assertValid(builder.document.serialize("json"));
    const reparsed = assertValid(builder.document.deserialize("json", text));
    expect(reparsed.nodeCount).toBe(2);
  });

  it("installs a plugin authored against the public contract", () => {
    const builder = build();
    const contributionIds: string[] = [];
    const plugin: BuilderPlugin = {
      id: "company.extra-nodes",
      version: "1.0.0",
      install(api) {
        const node = api.nodes.register({
          type: "company.prompt",
          label: "Prompt",
          category: "ai",
        });
        if (node.ok) {
          contributionIds.push(node.value.id);
        }
      },
    };

    const installed = assertValid(builder.use(plugin));

    expect(installed.contributionIds).toEqual(["company.prompt"]);
    expect(contributionIds).toEqual(["company.prompt"]);
    expect(builder.registries.nodes.has("company.prompt")).toBe(true);
  });

  it("keeps the helper surface usable without throwing internally", () => {
    expect(isQualifiedId("demo.node")).toBe(true);
    expect(sdkError("sdk.invalid-id", "bad").code).toBe("sdk.invalid-id");
    expect(toNodeDefinition({ type: "demo.node", label: "D", category: "c" }).ok).toBe(
      true,
    );
    expect(toEdgeDefinition({ type: "demo.edge", label: "D" }).ok).toBe(true);
    expect(toPropertyDefinition({ id: "p", type: "string" }).ok).toBe(true);
    expect(normalizeAdapter({ id: "demo.engine", label: "Demo" }).ok).toBe(true);
    expect(requirementsFrom({ nodes: [], edges: [] }).nodeRenderers).toBe(false);
    expect(
      capabilityGaps(undefined, {
        nodeRenderers: true,
        edgeRenderers: false,
        portRenderers: false,
        propertyRenderers: false,
        edgeStyles: false,
      }),
    ).toEqual([]);
    expect(withRendererBinding(EMPTY_RENDERER_BINDINGS, "nodes", { id: "x", value: 1 }).ok).toBe(
      true,
    );
    expect(assertOk(toNodeDefinition({ type: "demo.node", label: "D", category: "c" }))).toBeDefined();
    expect(DEFAULT_BUILDER_ID).toBe("nodera.builder");
  });
});

/**
 * Every type name a host must be able to write.
 *
 * One tuple entry per published vocabulary name: naming them is the whole
 * assertion, because this file stops compiling the moment the entry point stops
 * exporting one of them. A host never has to recover one of these types with
 * `Parameters<Builder["theme"]["register"]>[0]` or any other derivation.
 */
type PublicVocabulary = readonly [
  PanelDefinition,
  PanelRegion,
  ToolDefinition,
  ToolCommand,
  ToolAvailability,
  LayoutDefinition,
  LayoutState,
  ThemeDefinition,
  CreateThemeInput,
  DesignTokens,
  Graph,
  Node,
  Edge,
  Connection,
  NodePosition,
  GraphSettings,
  PortDeclaration,
  PropertyDefinition,
  PropertyOption,
  PropertyType,
  GraphDocument,
  DocumentValidationReport,
  NodeDefinition,
  EdgeDefinition,
  ValidationReport,
  ValidationLevel,
  ValidationIssue,
];

/** Entry count of {@link PublicVocabulary}, typed against the tuple itself. */
const VOCABULARY_TYPE_COUNT: PublicVocabulary["length"] = 27;

/** Names this guard expects the entry point to publish. */
const SUPPORTED_EXPORTS = [
  "ADAPTER_CAPABILITIES",
  "DEFAULT_BUILDER_ID",
  "DEFAULT_DEFINITION_VERSION",
  "EMPTY_RENDERER_BINDINGS",
  "RENDERER_KINDS",
  "SDK_EVENT_NAMES",
  "SDK_ISSUE_CODES",
  "SUPPORTED_FEATURES",
  "SdkAssertionError",
  "assertOk",
  "assertValid",
  "capabilityGaps",
  "createBuilder",
  "installPlugin",
  "isQualifiedId",
  "normalizeAdapter",
  "requirementsFrom",
  "resolveFeatures",
  "sdkError",
  "toEdgeDefinition",
  "toIssues",
  "toNodeDefinition",
  "toPortDeclarations",
  "toPropertyDefinition",
  "withRendererBinding",
];
