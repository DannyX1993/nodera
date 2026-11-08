import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import {
  EditorEngine,
  addNode,
  createEdge,
  updateNodeMetadata,
} from "@nodera/application";
import type { ValidationIssue } from "@nodera/contracts";
import type { EdgeDefinition } from "@nodera/edge-registry";
import { EDITOR_LAYOUT_ID } from "@nodera/layout-engine";
import type { NodeDefinition } from "@nodera/node-registry";
import type { PropertyDefinition, PropertyType } from "@nodera/property-system";
import { DEFAULT_THEME_ID } from "@nodera/theme-engine";
import { UiStateStore } from "@nodera/ui-core";

import { NoderaUiProvider } from "../../providers/ui-provider.js";
import type { ComponentRenderers } from "../../registries/component-registry.js";
import { defaultPropertyRenderer } from "./property-renderers/defaults.js";

/** Definition id of the node the inspector tests register. */
export const INSPECTOR_NODE_DEFINITION_ID = "test.inspectable";
/** Definition id of the edge the inspector tests register. */
export const INSPECTOR_EDGE_DEFINITION_ID = "test.flow";
/** Definition id of the option-set fixture (dynamic options and editability). */
export const OPTION_SET_DEFINITION_ID = "test.option-set";

/**
 * Properties of the fixture definition.
 *
 * They cover every concern the panels must delegate to the property system:
 * ordering (`order`), grouping (`group`), a static hidden property, a
 * conditional visibility (`visibleWhen`), a required property, a select with
 * declared options plus a default value, and a `custom` property without a
 * renderer.
 */
export const INSPECTOR_PROPERTIES: readonly PropertyDefinition[] = Object.freeze([
  { id: "endpoint", type: "string", label: "Endpoint", group: "connection", order: 1 },
  { id: "secret", type: "string", label: "Secret", visible: false },
  {
    id: "retries",
    type: "number",
    label: "Retries",
    group: "connection",
    order: 3,
    validations: [
      { kind: "min", value: 0 },
      { kind: "max", value: 5 },
    ],
  },
  {
    id: "retryDelay",
    type: "number",
    label: "Retry delay",
    group: "connection",
    order: 2,
  },
  { id: "token", type: "string", label: "Token", group: "connection", order: 4, required: true },
  { id: "payload", type: "json-editor", label: "Payload" },
  { id: "widget", type: "custom", label: "Widget", component: "acme.widget" },
  {
    id: "mode",
    type: "select",
    label: "Mode",
    options: [
      { value: "fast", label: "Fast" },
      { value: "safe", label: "Safe" },
    ],
    defaultValue: "fast",
  },
  {
    id: "fallback",
    type: "string",
    label: "Fallback",
    visibleWhen: { kind: "propertyNotEquals", propertyId: "mode", value: "fast" },
  },
] as readonly PropertyDefinition[]);

/** Edge definition the inspector tests register. */
export const INSPECTOR_EDGE_DEFINITION: EdgeDefinition = {
  id: INSPECTOR_EDGE_DEFINITION_ID,
  name: "Flow",
  version: "1.0.0",
};

/** Node definition the inspector tests register. */
export function inspectorNodeDefinition(): NodeDefinition {
  return {
    id: INSPECTOR_NODE_DEFINITION_ID,
    name: "Inspectable node",
    category: "test",
    version: "2.1.0",
    ports: [
      { id: "in", name: "In", direction: "input", dataType: "string" },
      { id: "out", name: "Out", direction: "output", dataType: "number" },
    ],
    properties: [...INSPECTOR_PROPERTIES],
  };
}

/** Creates an editor with the fixture node and edge definitions registered. */
export function createInspectorEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "graph-inspector-test" });
  editor.domain.nodes.register(inspectorNodeDefinition());
  editor.domain.edges.register(INSPECTOR_EDGE_DEFINITION);
  return editor;
}

/**
 * Fixture whose option set and editability depend on another property.
 *
 * It exists so the panel tests can prove that dynamic options and the enabled
 * state are resolved by the property system, not by the panel.
 */
export function createOptionSetEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "graph-inspector-options" });
  editor.domain.nodes.register({
    id: OPTION_SET_DEFINITION_ID,
    name: "Option set node",
    category: "test",
    version: "1.0.0",
    ports: [{ id: "in", direction: "input" }],
    properties: [
      {
        id: "mode",
        type: "select",
        label: "Mode",
        defaultValue: "fast",
        options: [
          { value: "fast", label: "Fast" },
          { value: "safe", label: "Safe" },
        ],
      },
      {
        id: "level",
        type: "select",
        label: "Level",
        options: [
          { value: "low", label: "Low" },
          { value: "high", label: "High" },
        ],
        optionSets: [
          {
            when: { kind: "propertyEquals", propertyId: "mode", value: "safe" },
            options: [
              { value: "strict", label: "Strict" },
              { value: "loose", label: "Loose" },
            ],
          },
        ],
        enabledWhen: { kind: "propertyEquals", propertyId: "mode", value: "safe" },
      },
    ],
  });
  return editor;
}

/** Options accepted by {@link addInspectorNode}. */
export interface AddInspectorNodeOptions {
  readonly nodeId: string;
  readonly definitionId?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly position?: { readonly x: number; readonly y: number };
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Adds one node through the application use case (never by mutating the graph). */
export function addInspectorNode(
  editor: EditorEngine,
  options: AddInspectorNodeOptions,
): void {
  const added = addNode(editor, {
    nodeId: options.nodeId,
    definitionId: options.definitionId ?? INSPECTOR_NODE_DEFINITION_ID,
    ...(options.properties === undefined ? {} : { properties: options.properties }),
    ...(options.position === undefined ? {} : { position: options.position }),
  });
  if (!added.ok) {
    throw new Error(added.error.message);
  }
  if (options.metadata !== undefined) {
    updateNodeMetadata(editor, { nodeId: options.nodeId, metadata: options.metadata });
  }
}

/** Connects two nodes through the application use case. */
export function connectInspectorNodes(
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
    definitionId: INSPECTOR_EDGE_DEFINITION_ID,
    source: { nodeId: options.from, portId: "out" },
    target: { nodeId: options.to, portId: "in" },
    ...(options.label === undefined ? {} : { label: options.label }),
  });
  if (!created.ok) {
    throw new Error(created.error.message);
  }
}

/** UI state store the inspector tests start from. */
export function createInspectorStore(): UiStateStore {
  return new UiStateStore({ themeId: DEFAULT_THEME_ID, layoutId: EDITOR_LAYOUT_ID });
}

/** Options accepted by {@link renderInspector}. */
export interface RenderInspectorOptions {
  readonly editor?: EditorEngine;
  readonly renderers?: ComponentRenderers;
}

/** Renders a component inside a provider that supplies a real editor. */
export function renderInspector(
  element: ReactElement,
  options: RenderInspectorOptions = {},
): RenderResult {
  return render(
    <NoderaUiProvider
      store={createInspectorStore()}
      editor={options.editor ?? createInspectorEditor()}
      {...(options.renderers === undefined ? {} : { renderers: options.renderers })}
    >
      {element}
    </NoderaUiProvider>,
  );
}

/** Returns the only element matching a selector, failing loudly when absent. */
export function required<T extends Element>(container: HTMLElement, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`missing element: ${selector}`);
  }
  return element;
}

/** Text content of every element carrying an attribute, in document order. */
export function attributeValues(
  container: HTMLElement,
  attribute: string,
): readonly (string | null)[] {
  return [...container.querySelectorAll(`[${attribute}]`)].map((element) =>
    element.getAttribute(attribute),
  );
}

/** One fixture property of {@link INSPECTOR_PROPERTIES}. */
export function inspectorProperty(id: string): PropertyDefinition {
  const definition = INSPECTOR_PROPERTIES.find((property) => property.id === id);
  if (definition === undefined) {
    throw new Error(`missing fixture property: ${id}`);
  }
  return definition;
}

/** Builds an ad-hoc definition for a single property type. */
export function adHocProperty(
  id: string,
  type: PropertyType,
  overrides: Partial<PropertyDefinition> = {},
): PropertyDefinition {
  return { id, type, ...overrides };
}

/** Options accepted by {@link renderProperty}. */
export interface RenderPropertyOptions {
  readonly definition: PropertyDefinition;
  readonly value?: unknown;
  readonly issues?: readonly ValidationIssue[];
  readonly disabled?: boolean;
  readonly onChange?: (value: unknown) => void;
  readonly renderers?: ComponentRenderers;
}

/**
 * Renders the built-in renderer resolved for a definition type.
 *
 * Tests go through `defaultPropertyRenderer`, the same resolution the panel
 * uses as its fallback, so a missing or mis-mapped type surfaces here.
 */
export function renderProperty(options: RenderPropertyOptions): RenderResult {
  const Renderer = defaultPropertyRenderer(options.definition.type);
  return renderInspector(
    <Renderer
      definition={options.definition}
      value={options.value}
      issues={options.issues ?? []}
      disabled={options.disabled ?? false}
      onChange={options.onChange ?? (() => undefined)}
    />,
    options.renderers === undefined ? {} : { renderers: options.renderers },
  );
}
