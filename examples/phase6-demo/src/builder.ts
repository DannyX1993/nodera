/**
 * Composition root of the Phase 6 demo.
 *
 * Everything this file does is done through the public SDK: one
 * `createBuilder` call, authored definitions, a plugin, a theme, a layout, a
 * renderer replacement and a seeded graph. No internal Nodera package is
 * imported — the only Nodera imports of the whole demo are `@nodera/sdk` and
 * `@nodera/sdk-react` — which is the result Phase 6 has to prove.
 */

import {
  assertOk,
  assertValid,
  createBuilder,
  type Builder,
  type BuilderPlugin,
  type EdgeDefinitionInput,
} from "@nodera/sdk";
import { createReactFlowAdapter } from "@nodera/sdk-react";

import {
  AUDIT_NODE,
  DEMO_NODES,
  ENRICH_NODE_TYPE,
  HTTP_REQUEST_NODE_TYPE,
  SINK_NODE_TYPE,
  TRANSFORM_NODE_TYPE,
  WEBHOOK_NODE,
} from "./nodes.js";
import { createHostPanel, createObservabilityPanel } from "./panels.js";
import { BUILT_IN_THEME_ID, DEMO_THEME, DEMO_THEME_ID } from "./theme.js";

/* ------------------------------------------------------------------ */
/*  Stable identifiers of the demo composition                         */
/* ------------------------------------------------------------------ */

/** Id of the builder this host composes. */
export const DEMO_BUILDER_ID = "demo.phase6-builder";

/** Id of the layout this host declares on top of the predefined ones. */
export const DEMO_LAYOUT_ID = "demo.layout.pipeline";

/** Id of the panel the demo plugin contributes. */
export const OBSERVABILITY_PANEL_ID = "demo.panel.observability";

/** Renderer id of that panel: what the plugin binds its component to. */
export const OBSERVABILITY_RENDERER_ID = "demo.panel.observability";

/** Id of the built-in panel whose renderer the host replaces. */
export const REPLACED_PANEL_ID = "validation";

/** Edge type drawn as a dashed line, with the renderer-only `strokeWidth` hint. */
export const DATA_FLOW_EDGE_TYPE = "demo.edge.data-flow";

/** Edge type drawn as a dotted line. */
export const FALLBACK_EDGE_TYPE = "demo.edge.fallback";

/* ------------------------------------------------------------------ */
/*  Edges                                                              */
/* ------------------------------------------------------------------ */

/**
 * Edge definition the demo registers through `builder.registerEdge` on the live
 * builder; the dashed data-flow edge is declared in the configuration below.
 *
 * `style` accepts the declared visual keys and renderer-only hints: `lineStyle`
 * and `color` exist on the domain's `EdgeVisual`, while a key such as
 * `strokeWidth` is stored by the SDK as a renderer hint so nothing an author
 * writes is silently dropped.
 */
const FALLBACK_EDGE: EdgeDefinitionInput = {
  type: FALLBACK_EDGE_TYPE,
  version: "1.0.0",
  label: "Fallback route",
  description: "Route taken when the primary stage produced nothing.",
  style: { lineStyle: "dotted", color: "#94a3b8", arrowEnd: true },
};

/** Edge definitions declared in the builder configuration. */
const DEMO_EDGES: readonly EdgeDefinitionInput[] = [
  {
    type: DATA_FLOW_EDGE_TYPE,
    version: "1.0.0",
    label: "Data flow",
    description: "Records flowing from one stage to the next.",
    style: { lineStyle: "dashed", strokeWidth: 3 },
  },
];

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

/**
 * Input accepted by `builder.layout.register`.
 *
 * Derived from the public API: the SDK declares layouts but does not re-export
 * the layout engine's `LayoutDefinition` type.
 */
type DemoLayoutDefinition = Parameters<Builder["layout"]["register"]>[0];

/**
 * Layout the host declares and applies at boot.
 *
 * It places the plugin's panel, which is the only way that panel can appear:
 * the framework composes the panels a layout places, and a plugin can
 * contribute the definition but never the geometry.
 */
const DEMO_LAYOUT: DemoLayoutDefinition = {
  id: DEMO_LAYOUT_ID,
  name: "Pipeline",
  description: "Host layout of the Phase 6 demo: palette, properties, plugin panel and validation.",
  regionSizes: { left: 230, right: 320, bottom: 170 },
  panels: [
    { panelId: "header", region: "header", size: 44 },
    { panelId: "palette", region: "left", size: 230 },
    { panelId: "properties", region: "right", size: 320 },
    { panelId: OBSERVABILITY_PANEL_ID, region: "right", size: 220 },
    { panelId: REPLACED_PANEL_ID, region: "bottom", size: 170 },
    { panelId: "footer", region: "footer", size: 28 },
  ],
};

/* ------------------------------------------------------------------ */
/*  Plugin                                                             */
/* ------------------------------------------------------------------ */

/** Combines the messages of an SDK diagnostic list into one line. */
function issueSummary(issues: readonly { readonly code: string; readonly message: string }[]): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("; ");
}

/**
 * Builder the demo plugin and its panel renderer resolve at render time.
 *
 * `api` deliberately exposes registries, not the builder, and `install` runs
 * before `createBuilder` returns, so the composition is captured here and read
 * when a panel actually renders.
 */
let composedBuilder: Builder | undefined;

/** The composed builder; a read before composition finished is a bug. */
function currentBuilder(): Builder {
  if (composedBuilder === undefined) {
    throw new Error("The demo builder was read before createDemoBuilder finished composing it");
  }
  return composedBuilder;
}

/**
 * The demo plugin: one node and one panel, both contributed through the public
 * api and installed during composition (`plugins: [demoPlugin]`).
 *
 * A plugin cannot report failures out of `install`, so it throws and the SDK
 * converts the throw into `sdk.plugin-invalid`, which makes `createBuilder`
 * fail closed instead of leaving a half-installed plugin behind.
 */
export const demoPlugin: BuilderPlugin = {
  id: "demo.observability",
  version: "1.0.0",
  install(api) {
    const node = api.nodes.register(AUDIT_NODE);
    if (!node.ok) {
      throw new Error(`demo.observability could not register its node: ${issueSummary(node.error)}`);
    }

    const panel = api.panels.register({
      id: OBSERVABILITY_PANEL_ID,
      title: "Observability",
      description: "Graph facts the demo plugin reads back from the builder.",
      region: "right",
      renderer: OBSERVABILITY_RENDERER_ID,
      size: 220,
    });
    if (!panel.ok) {
      throw new Error(`demo.observability could not register its panel: ${issueSummary(panel.error)}`);
    }

    const bound = api.renderers.bind(
      "panels",
      OBSERVABILITY_RENDERER_ID,
      createObservabilityPanel(currentBuilder),
    );
    if (!bound.ok) {
      throw new Error(`demo.observability could not bind its renderer: ${issueSummary(bound.error)}`);
    }
  },
};

/* ------------------------------------------------------------------ */
/*  Renderer replacement                                               */
/* ------------------------------------------------------------------ */

/**
 * Replaces the renderer of one built-in panel with a host component.
 *
 * The rendered panel keeps its definition, its id, its title bar and its
 * placement: only the component the renderer id resolves to changes.
 */
function replaceBuiltInPanel(builder: Builder): void {
  const panel = builder.registries.panels.get(REPLACED_PANEL_ID);
  if (panel === undefined || panel.renderer === undefined) {
    throw new Error(
      `The framework no longer registers the "${REPLACED_PANEL_ID}" panel; the demo's replacement has no target`,
    );
  }
  assertOk(builder.bindRenderer("panels", panel.renderer, createHostPanel(builder)));
}

/* ------------------------------------------------------------------ */
/*  Seeded graph                                                       */
/* ------------------------------------------------------------------ */

/**
 * Seeds the demo graph through the Graph API so the canvas is never empty.
 *
 * Every value is written through `builder.graph`, which delegates to the
 * application use cases: the same rules (definition exists, port exists, history
 * unit, `node.created` / `edge.created` events) apply as for any host.
 */
function seedDemoGraph(builder: Builder): void {
  const request = assertValid(
    builder.graph.addNode({
      type: HTTP_REQUEST_NODE_TYPE,
      nodeId: "demo-node-request",
      position: { x: 60, y: 120 },
      properties: {
        url: "https://api.example.com/orders",
        method: "GET",
        timeoutMs: 5000,
        followRedirects: true,
        headers: { Accept: "application/json", "X-Demo": "phase6" },
      },
    }),
  );

  const enrich = assertValid(
    builder.graph.addNode({
      type: ENRICH_NODE_TYPE,
      nodeId: "demo-node-enrich",
      position: { x: 360, y: 60 },
      properties: {
        lookupUrl: "https://api.example.com/customers",
        strategy: "merge",
        cacheTtlMinutes: 15,
        deterministic: false,
      },
    }),
  );

  const transform = assertValid(
    builder.graph.addNode({
      type: TRANSFORM_NODE_TYPE,
      nodeId: "demo-node-transform",
      position: { x: 360, y: 220 },
      properties: {
        expression: "order.total > 100",
        mode: "keep-matching",
        maxRows: 1000,
        failOnError: false,
      },
    }),
  );

  const sink = assertValid(
    builder.graph.addNode({
      type: SINK_NODE_TYPE,
      nodeId: "demo-node-sink",
      position: { x: 660, y: 140 },
      properties: { target: "stdout", prettyPrint: true },
    }),
  );

  assertValid(
    builder.graph.connect({
      source: request.id,
      target: enrich.id,
      sourcePort: "response",
      targetPort: "in",
      type: DATA_FLOW_EDGE_TYPE,
      label: "records",
    }),
  );

  assertValid(
    builder.graph.connect({
      source: enrich.id,
      target: transform.id,
      sourcePort: "out",
      targetPort: "in",
      type: DATA_FLOW_EDGE_TYPE,
    }),
  );

  assertValid(
    builder.graph.connect({
      source: transform.id,
      target: sink.id,
      sourcePort: "out",
      targetPort: "in",
      type: FALLBACK_EDGE_TYPE,
      label: "no match",
    }),
  );
}

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

/**
 * Composes the demo builder.
 *
 * The call is the whole integration: engine adapter, registries, feature flags,
 * document contract, initial theme and layout, plugin. Everything the UI shows
 * afterwards — panels, themes, layouts, renderers, graph, document, events —
 * comes from the object this returns.
 */
export function createDemoBuilder(): Builder {
  const builder = assertValid(
    createBuilder({
      id: DEMO_BUILDER_ID,
      adapter: createReactFlowAdapter(),
      registry: {
        nodes: DEMO_NODES,
        edges: DEMO_EDGES,
        layouts: [DEMO_LAYOUT],
      },
      features: { minimap: true, history: true, validation: true },
      document: { format: "ggd", version: "1.0.0" },
      ui: { theme: BUILT_IN_THEME_ID, layout: DEMO_LAYOUT_ID },
      plugins: [demoPlugin],
    }),
  );

  composedBuilder = builder;

  // Theme contribution after composition: the built-in default is applied by the
  // configuration, the host theme is registered and applied through the Theme API.
  assertValid(builder.theme.register(DEMO_THEME));
  assertValid(builder.theme.setDefault(DEMO_THEME_ID));

  // Incremental authoring: a definition added to a live builder goes through the
  // same validation, duplicate detection and renderer binding as one declared in
  // the configuration, so a host can extend its vocabulary at runtime.
  assertValid(builder.registerNode(WEBHOOK_NODE));
  assertValid(builder.registerEdge(FALLBACK_EDGE));

  replaceBuiltInPanel(builder);
  seedDemoGraph(builder);

  return builder;
}
