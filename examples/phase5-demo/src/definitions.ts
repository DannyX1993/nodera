/**
 * Vocabulary of the Phase 5 demo host application.
 *
 * This module is the *host* side of the composition: node and edge
 * definitions, the seeded graph and the custom layout the demo declares. None
 * of it lives in the framework — a different application would register its own
 * definitions and layouts and reuse the exact same core (S2, S4).
 */

import { EditorEngine, addNode, createEdge } from "@nodera/application";
import type { LayoutDefinition } from "@nodera/ui-core";
import type { NodeDefinition } from "@nodera/node-registry";

/** Renderer id of the custom port renderer registered by the demo. */
export const BADGE_PORT_RENDERER_ID = "demo.port.badge";

/** Stable id of the single edge definition the demo registers. */
export const ROWS_EDGE_DEFINITION_ID = "demo.edge.rows";

/** Id of the custom layout this host declares on top of the predefined ones. */
export const DEMO_WORKSPACE_LAYOUT_ID = "demo.layout.workspace";

/**
 * Source definition.
 *
 * It carries one property of every shape the properties panel has to render
 * (string, number, select with options, boolean) plus a grouped and ordered
 * section, so the inspector proves S3/S7 rather than showing one text field.
 *
 * Its output port declares `visual.renderer`, which is how S3 Level 2 ("Port
 * Renderer") is selected: the definition names a renderer id, the host decides
 * which component that id resolves to.
 */
export const CSV_SOURCE_DEFINITION: NodeDefinition = {
  id: "demo.source.csv",
  name: "CSV source",
  description: "Reads a delimited file into the graph.",
  category: "sources",
  version: "1.0.0",
  icon: "📄",
  ports: [
    {
      id: "out",
      name: "Rows",
      direction: "output",
      dataType: "table",
      visual: { renderer: BADGE_PORT_RENDERER_ID },
    },
  ],
  properties: [
    {
      id: "path",
      type: "string",
      label: "File path",
      description: "Absolute path or a path relative to the demo workspace.",
      group: "Source",
      order: 0,
      required: true,
    },
    {
      id: "delimiter",
      type: "select",
      label: "Delimiter",
      group: "Source",
      order: 1,
      defaultValue: ",",
      options: [
        { value: ",", label: "Comma" },
        { value: ";", label: "Semicolon" },
        { value: "\t", label: "Tab" },
        { value: "|", label: "Pipe" },
      ],
    },
    {
      id: "header",
      type: "boolean",
      label: "First row is a header",
      group: "Source",
      order: 2,
      defaultValue: true,
    },
    {
      id: "maxRows",
      type: "number",
      label: "Maximum rows",
      description: "Grouped section: ordered after the fields above.",
      group: "Options",
      order: 3,
      defaultValue: 1000,
      schema: { type: "number", minimum: 0 },
    },
    {
      id: "encoding",
      type: "select",
      label: "Encoding",
      group: "Options",
      order: 4,
      defaultValue: "utf-8",
      options: [
        { value: "utf-8", label: "UTF-8" },
        { value: "utf-16", label: "UTF-16" },
        { value: "latin-1", label: "Latin-1" },
      ],
    },
  ],
  visual: { color: "#2563eb", icon: "📄" },
};

/** Transformation definition: a second category with its own properties. */
export const FILTER_DEFINITION: NodeDefinition = {
  id: "demo.transform.filter",
  name: "Filter rows",
  description: "Keeps the rows that match a predicate.",
  category: "transformations",
  version: "1.0.0",
  icon: "🔎",
  ports: [
    { id: "in", name: "Rows", direction: "input", dataType: "table" },
    { id: "out", name: "Rows", direction: "output", dataType: "table" },
  ],
  properties: [
    {
      id: "expression",
      type: "string",
      label: "Predicate",
      group: "Filter",
      order: 0,
      required: true,
    },
    {
      id: "keepRejected",
      type: "boolean",
      label: "Keep rejected rows",
      group: "Filter",
      order: 1,
      defaultValue: false,
    },
  ],
  visual: { color: "#7c3aed", icon: "🔎" },
};

/** Sink definition: the definition the "break the graph" action leaves invalid. */
export const TABLE_SINK_DEFINITION: NodeDefinition = {
  id: "demo.sink.table",
  name: "Table sink",
  description: "Writes the incoming rows into a table.",
  category: "sinks",
  version: "1.0.0",
  icon: "🗄️",
  ports: [{ id: "in", name: "Rows", direction: "input", dataType: "table" }],
  properties: [
    {
      id: "table",
      type: "string",
      label: "Target table",
      group: "Target",
      order: 0,
      required: true,
    },
    {
      id: "batchSize",
      type: "number",
      label: "Batch size",
      group: "Target",
      order: 1,
      defaultValue: 500,
      schema: { type: "number", minimum: 1 },
    },
    {
      id: "createIfMissing",
      type: "boolean",
      label: "Create the table if it is missing",
      group: "Target",
      order: 2,
      defaultValue: true,
    },
  ],
  visual: { color: "#059669", icon: "🗄️" },
};

/** Every node definition the demo registers, in palette order. */
export const DEMO_NODE_DEFINITIONS: readonly NodeDefinition[] = Object.freeze([
  CSV_SOURCE_DEFINITION,
  FILTER_DEFINITION,
  TABLE_SINK_DEFINITION,
]);

/**
 * Custom layout declared by the host (S4: "Los layouts deben poder declararse
 * desde la aplicación host").
 *
 * It places every panel the demo composes — including the floating search panel
 * and the history panel, which none of the predefined layouts use — so the
 * dock/float/hide/preference controls have something real to act on.
 */
export const DEMO_WORKSPACE_LAYOUT: LayoutDefinition = Object.freeze({
  id: DEMO_WORKSPACE_LAYOUT_ID,
  name: "Demo workspace (custom)",
  description:
    "Host-declared layout: palette, properties, minimap, validation, history and a floating search panel.",
  panels: Object.freeze([
    Object.freeze({ panelId: "header", region: "header" as const, size: 44 }),
    Object.freeze({ panelId: "palette", region: "left" as const, size: 250 }),
    Object.freeze({ panelId: "properties", region: "right" as const, size: 300 }),
    Object.freeze({ panelId: "minimap", region: "right" as const, size: 220 }),
    Object.freeze({ panelId: "validation", region: "bottom" as const, size: 150 }),
    Object.freeze({ panelId: "history", region: "bottom" as const, size: 140 }),
    Object.freeze({
      panelId: "search",
      region: "floating" as const,
      size: 300,
      // Floating rectangles are host-owned pixels relative to the canvas
      // container: keep them inside it so the overlay never slides under the
      // host's own chrome (the external metadata column next to the shell).
      rect: Object.freeze({ x: 8, y: 48, width: 240, height: 190 }),
    }),
  ]),
}) as LayoutDefinition;

/**
 * Fails fast on a core result.
 *
 * `@nodera/contracts` is not a dependency of this host (the core packages are),
 * so the helper is typed structurally against the `Result` shape the use cases
 * return: a discriminated union of `{ok: true, value}` and `{ok: false, error}`.
 */
function requireOk<T, E extends { readonly message: string }>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E },
  what: string,
): T {
  if (!result.ok) {
    throw new Error(`${what} failed: ${result.error.message}`);
  }
  return result.value;
}

/**
 * Creates the demo editor: registries, definitions and a seeded graph.
 *
 * Everything goes through the application layer (`addNode`, `createEdge`), so
 * the seed is an ordinary editing session with ordinary history entries and the
 * demo never writes the graph behind the core's back (S8).
 */
export function createDemoEditor(): EditorEngine {
  const editor = new EditorEngine({ graphId: "demo-graph" });

  for (const definition of DEMO_NODE_DEFINITIONS) {
    requireOk(editor.domain.nodes.register(definition), `Registering ${definition.id}`);
  }

  requireOk(
    editor.domain.edges.register({
      id: ROWS_EDGE_DEFINITION_ID,
      name: "Rows",
      description: "Table rows flowing from one node to the next.",
      version: "1.0.0",
      label: "rows",
      connectionTypes: ["table"],
      visual: {
        lineStyle: "solid",
        geometry: "bezier",
        arrowEnd: true,
        color: "#7c3aed",
      },
    }),
    `Registering ${ROWS_EDGE_DEFINITION_ID}`,
  );

  requireOk(
    addNode(editor, {
      nodeId: "node-source",
      definitionId: CSV_SOURCE_DEFINITION.id,
      position: { x: 80, y: 140 },
      properties: {
        path: "data/orders.csv",
        delimiter: ",",
        header: true,
        maxRows: 1000,
        encoding: "utf-8",
      },
    }),
    "Seeding node-source",
  );

  requireOk(
    addNode(editor, {
      nodeId: "node-transform",
      definitionId: FILTER_DEFINITION.id,
      position: { x: 380, y: 140 },
      properties: { expression: "amount > 0", keepRejected: false },
    }),
    "Seeding node-transform",
  );

  requireOk(
    createEdge(editor, {
      edgeId: "edge-rows",
      definitionId: ROWS_EDGE_DEFINITION_ID,
      label: "rows",
      source: { nodeId: "node-source", portId: "out" },
      target: { nodeId: "node-transform", portId: "in" },
    }),
    "Seeding edge-rows",
  );

  return editor;
}
