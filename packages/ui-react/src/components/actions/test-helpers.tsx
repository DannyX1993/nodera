import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import { EditorEngine, addNode, createEdge, selectNode } from "@nodera/application";
import type { ValidationIssue } from "@nodera/contracts";
import { EDITOR_LAYOUT, createLayoutState } from "@nodera/layout-engine";
import type { NodeDefinition } from "@nodera/node-registry";
import { DEFAULT_THEME_ID } from "@nodera/theme-engine";
import { ToolRegistry, UiStateStore, type ToolDefinition } from "@nodera/ui-core";

import { createDefaultPanelRegistry } from "@nodera/ui-core";
import { NoderaUiProvider } from "../../providers/ui-provider.js";
import {
  createComponentRenderers,
  type ComponentRenderers,
} from "../../registries/component-registry.js";

/** Definition whose property is required, so validating a node reports an error. */
export const REQUIRED_DEFINITION_ID = "test.action-node";
/** Definition without required properties, for clean graphs. */
export const PLAIN_DEFINITION_ID = "test.action-plain";

const REQUIRED_DEFINITION: NodeDefinition = {
  id: REQUIRED_DEFINITION_ID,
  name: "Action node",
  category: "test",
  version: "1.0.0",
  ports: [
    { id: "in", direction: "input" },
    { id: "out", direction: "output" },
  ],
  properties: [{ id: "endpoint", type: "string", label: "Endpoint", required: true }],
};

const PLAIN_DEFINITION: NodeDefinition = {
  id: PLAIN_DEFINITION_ID,
  name: "Plain node",
  category: "test",
  version: "1.0.0",
  ports: [
    { id: "in", direction: "input" },
    { id: "out", direction: "output" },
  ],
  properties: [],
};

/** Creates an editor with the action-test definitions already registered. */
export function createActionEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "graph-action-test" });
  editor.domain.nodes.register(REQUIRED_DEFINITION);
  editor.domain.nodes.register(PLAIN_DEFINITION);
  return editor;
}

/** Adds one node through the application use case. */
export function addActionNode(
  editor: EditorEngine,
  options: {
    readonly nodeId: string;
    readonly definitionId?: string;
    readonly properties?: Readonly<Record<string, unknown>>;
  },
): void {
  const added = addNode(editor, {
    nodeId: options.nodeId,
    definitionId: options.definitionId ?? REQUIRED_DEFINITION_ID,
    ...(options.properties === undefined ? {} : { properties: options.properties }),
  });
  if (!added.ok) {
    throw new Error(added.error.message);
  }
}

/** Connects two nodes through the application use case. */
export function connectActionNodes(
  editor: EditorEngine,
  options: { readonly edgeId: string; readonly from: string; readonly to: string },
): void {
  const created = createEdge(editor, {
    edgeId: options.edgeId,
    source: { nodeId: options.from, portId: "out" },
    target: { nodeId: options.to, portId: "in" },
  });
  if (!created.ok) {
    throw new Error(created.error.message);
  }
}

/** Selects one node through the application use case. */
export function selectActionNode(editor: EditorEngine, nodeId: string): void {
  const selected = selectNode(editor, { nodeId });
  if (!selected.ok) {
    throw new Error(selected.error.message);
  }
}

/** Registers a graph validator that reports one issue of each configurable severity. */
export function registerSeverityValidator(
  editor: EditorEngine,
  issues: readonly ValidationIssue[],
  id = "test.severities",
): void {
  const registered = editor.domain.validators.registerValidator({
    id,
    level: "domain",
    validate: () => issues,
  });
  if (!registered.ok) {
    throw new Error(registered.error.message);
  }
}

/** Store with the classic editor layout already applied, so panel actions work. */
export function createActionStore(): UiStateStore {
  const panelRegistry = createDefaultPanelRegistry();
  return new UiStateStore({
    themeId: DEFAULT_THEME_ID,
    layoutId: EDITOR_LAYOUT.id,
    layout: createLayoutState(EDITOR_LAYOUT, { panels: panelRegistry.all() }),
  });
}

/** Visibility of one panel of the applied layout, if the panel is placed. */
export function panelVisible(store: UiStateStore, panelId: string): boolean | undefined {
  return store
    .getState()
    .layout?.panels.find((panel) => panel.panelId === panelId)?.visible;
}

/** Builds a tool registry in one call, failing loudly on a refused registration. */
export function createToolRegistry(tools: readonly ToolDefinition[]): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of tools) {
    const registered = registry.register(tool);
    if (!registered.ok) {
      throw new Error(registered.error.message);
    }
  }
  return registry;
}

/** Options accepted by {@link renderWithUi}. */
export interface RenderActionOptions {
  /** Editor the surfaces bind to. Omitted to render a provider without one. */
  readonly editor?: EditorEngine;
  readonly store?: UiStateStore;
  readonly toolRegistry?: ToolRegistry;
  readonly renderers?: ComponentRenderers;
}

/**
 * Renders a component inside a real provider with real registries.
 *
 * No surface is stubbed: the editor, the tool registry, the UI store and the
 * renderer registries are the ones the host would wire.
 */
export function renderWithUi(
  element: ReactElement,
  options: RenderActionOptions = {},
): RenderResult {
  const store = options.store ?? createActionStore();
  const renderers = options.renderers ?? createComponentRenderers();
  return render(
    <NoderaUiProvider
      store={store}
      renderers={renderers}
      {...(options.editor === undefined ? {} : { editor: options.editor })}
      {...(options.toolRegistry === undefined ? {} : { toolRegistry: options.toolRegistry })}
    >
      {element}
    </NoderaUiProvider>,
  );
}
