import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import {
  EditorEngine,
  addNode,
  createEdge,
  updateNodeMetadata,
} from "@nodera/application";
import { EDITOR_LAYOUT_ID } from "@nodera/layout-engine";
import type { NodeDefinition } from "@nodera/node-registry";
import { DEFAULT_THEME_ID } from "@nodera/theme-engine";
import { UiStateStore } from "@nodera/ui-core";

import { NoderaUiProvider } from "../../providers/ui-provider.js";

/** Definition of the `sources` category used by the discovery tests. */
export const DATASOURCE_DEFINITION_ID = "test.datasource";
/** Second definition of the `sources` category, to prove registration order. */
export const TRANSFORM_DEFINITION_ID = "test.transform";
/** Definition of the `sinks` category, to prove category grouping. */
export const SINK_DEFINITION_ID = "test.sink";
/** Definition with an empty category, to prove the uncategorized bucket. */
export const LOOSE_DEFINITION_ID = "test.loose";

function define(
  id: string,
  name: string,
  category: string,
  description?: string,
): NodeDefinition {
  return {
    id,
    name,
    category,
    ...(description === undefined ? {} : { description }),
    version: "1.0.0",
    ports: [
      { id: "in", direction: "input" },
      { id: "out", direction: "output" },
    ],
    properties: [
      { id: "endpoint", type: "string", label: "Endpoint" },
    ],
  };
}

/**
 * Definitions the discovery tests register: two categories, plus one
 * definition without a category and therefore no named bucket.
 */
export const DISCOVERY_DEFINITIONS: readonly NodeDefinition[] = Object.freeze([
  define(DATASOURCE_DEFINITION_ID, "Datasource", "sources", "Reads records"),
  define(TRANSFORM_DEFINITION_ID, "Transform", "sources", "Maps fields"),
  define(SINK_DEFINITION_ID, "Sink", "sinks", "Writes records"),
  define(LOOSE_DEFINITION_ID, "Loose", ""),
]);

/** Creates an editor with the discovery definitions already registered. */
export function createDiscoveryEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "graph-discovery-test" });
  for (const definition of DISCOVERY_DEFINITIONS) {
    editor.domain.nodes.register(definition);
  }
  return editor;
}

/** Options accepted by {@link addTestNode}. */
export interface AddTestNodeOptions {
  readonly nodeId: string;
  readonly definitionId?: string;
  readonly name?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly position?: { readonly x: number; readonly y: number };
}

/** Adds one node through the application use case (never by mutating the graph). */
export function addTestNode(
  editor: EditorEngine,
  options: AddTestNodeOptions,
): void {
  const added = addNode(editor, {
    nodeId: options.nodeId,
    definitionId: options.definitionId ?? DATASOURCE_DEFINITION_ID,
    ...(options.properties === undefined ? {} : { properties: options.properties }),
    ...(options.position === undefined ? {} : { position: options.position }),
  });
  if (!added.ok) {
    throw new Error(added.error.message);
  }
  if (options.name !== undefined) {
    updateNodeMetadata(editor, { nodeId: options.nodeId, metadata: { name: options.name } });
  }
}

/** Connects two nodes through the application use case. */
export function connectTestNodes(
  editor: EditorEngine,
  options: {
    readonly edgeId: string;
    readonly from: string;
    readonly to: string;
    readonly label?: string;
  },
): void {
  const created = createEdge(editor, {
    edgeId: options.edgeId,
    source: { nodeId: options.from, portId: "out" },
    target: { nodeId: options.to, portId: "in" },
    ...(options.label === undefined ? {} : { label: options.label }),
  });
  if (!created.ok) {
    throw new Error(created.error.message);
  }
}

/** UI state store the discovery tests start from. */
export function createDiscoveryStore(searchQuery = ""): UiStateStore {
  return new UiStateStore({
    themeId: DEFAULT_THEME_ID,
    layoutId: EDITOR_LAYOUT_ID,
    searchQuery,
  });
}

/** Options accepted by {@link renderWithEditor}. */
export interface RenderWithEditorOptions {
  readonly editor: EditorEngine;
  readonly store?: UiStateStore;
}

/** Renders a component inside a provider that supplies a real editor. */
export function renderWithEditor(
  element: ReactElement,
  options: RenderWithEditorOptions,
): RenderResult {
  return render(
    <NoderaUiProvider
      store={options.store ?? createDiscoveryStore()}
      editor={options.editor}
    >
      {element}
    </NoderaUiProvider>,
  );
}
