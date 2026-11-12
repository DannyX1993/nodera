/**
 * Behaviour of the Phase 7 demo composition, checked through the public
 * surface only: `@nodera/sdk`, `@nodera/react` and the example plugins.
 *
 * The demo is a React application, so what these tests pin is the part that can
 * be asserted without a DOM: which plugins the editor installs, that their
 * contributions are visible in the registries the canvas reads, that every
 * renderer the canvas needs is a React component, and the graph and layout the
 * demo boots with.
 */

import { CLASSIFY_NODE_TYPE, EMBED_NODE_TYPE } from "@nodera/ai-nodes";
import {
  DEVELOPER_TOOLS_PLUGIN_ID,
  ISSUES_PANEL_ID,
  SHORTCUTS_PANEL_ID,
  VALIDATE_TOOL_ID,
} from "@nodera/developer-tools";
import { createRendererSet } from "@nodera/react";
import { describe, expect, it } from "vitest";

import {
  createDemoBuilder,
  demoPluginManager,
  DEMO_LAYOUT_ID,
  DEMO_PLUGIN_IDS,
} from "./builder.js";

/** The builder the demo mounts, composed once per test. */
function demo() {
  const builder = createDemoBuilder();
  return { builder, manager: demoPluginManager(builder) };
}

describe("Phase 7 demo composition", () => {
  it("installs the plugins the editor shows and reports each one active", () => {
    const { manager } = demo();

    const states = manager.list().map((record) => [record.manifest.id, record.state]);

    expect(states).toEqual([
      ["example.basic-nodes", "active"],
      ["example.data-nodes", "active"],
      ["example.developer-tools", "active"],
      ["example.kitchen-sink", "active"],
      ["example.ai-nodes", "active"],
    ]);
    expect(manager.list().map((record) => record.manifest.id)).toEqual(DEMO_PLUGIN_IDS);
  });

  it("makes the contributions the editor renders visible in the registries", () => {
    const { builder } = demo();

    expect(builder.registries.nodes.has("example.basic.start")).toBe(true);
    expect(builder.registries.nodes.has("example.basic.transform")).toBe(true);
    expect(builder.registries.nodes.has(CLASSIFY_NODE_TYPE)).toBe(true);
    expect(builder.registries.nodes.has(EMBED_NODE_TYPE)).toBe(true);
    expect(builder.registries.edges.has("example.basic.flow")).toBe(true);
    expect(builder.registries.panels.has("example.dev.panel.issues")).toBe(true);
    expect(builder.registries.panels.has("example.dev.panel.shortcuts")).toBe(true);
    expect(builder.registries.tools.has("example.dev.tool.validate")).toBe(true);
    expect(builder.registries.themes.has("example.sink.theme.blueprint")).toBe(true);
    expect(builder.registries.layouts.has("example.sink.layout.workspace")).toBe(true);
    expect(builder.validators.all().map((validator) => validator.id)).toContain(
      "example.data.validator",
    );
    expect(builder.exporters.all().map((exporter) => exporter.id)).toContain(
      "example.sink.exporter.ndjson",
    );
  });

  it("binds a React component for every node type and both developer-tools panels", () => {
    const { builder } = demo();

    // A renderer value the React binding can mount is a component, i.e. a
    // function or a `memo`/`forwardRef` object. The demo binds all six node
    // renderers the canvas paints and the two panels it composes.
    expect(typeof builder.renderers.nodes.get("example.basic.start")).toBe("function");
    expect(typeof builder.renderers.nodes.get("example.basic.transform")).toBe("function");
    expect(typeof builder.renderers.nodes.get(CLASSIFY_NODE_TYPE)).toBe("function");
    expect(typeof builder.renderers.nodes.get(EMBED_NODE_TYPE)).toBe("function");
    expect(typeof builder.renderers.panels.get("example.dev.panel.issues")).toBe("function");
    expect(typeof builder.renderers.panels.get("example.dev.panel.shortcuts")).toBe("function");

    // The check the React binding runs when it mounts an editor: every binding
    // has to be something React can render.
    expect(() => createRendererSet(builder.renderers)).not.toThrow();
  });

  it("seeds a graph of plugin node types so the canvas is never empty", () => {
    const { builder } = demo();

    expect(builder.graph.nodes().map((node) => node.type)).toEqual([
      "example.basic.start",
      "example.basic.transform",
      CLASSIFY_NODE_TYPE,
    ]);
    expect(builder.graph.edges().map((edge) => edge.type)).toEqual(["example.basic.flow"]);
    expect(builder.graph.nodeCount()).toBe(3);
    expect(builder.graph.edgeCount()).toBe(1);
  });

  it("applies the host layout, places both developer-tools panels and opens on the plugin theme", () => {
    const { builder } = demo();

    const layout = builder.layout.active();
    expect(layout.id).toBe(DEMO_LAYOUT_ID);
    expect(layout.panels.map((panel) => panel.panelId)).toEqual(
      expect.arrayContaining([
        "palette",
        "properties",
        "example.dev.panel.issues",
        "example.dev.panel.shortcuts",
      ]),
    );
    expect(builder.theme.active().id).toBe("example.sink.theme.blueprint");
  });

  it("withdraws the developer-tools contributions on uninstall and keeps the rest", () => {
    const { builder, manager } = demo();

    const removed = manager.uninstall(DEVELOPER_TOOLS_PLUGIN_ID);
    expect(removed.ok).toBe(true);

    // The panels and tools the manifest declares are gone from the registries
    // the editor composes from, so the regions lose them.
    expect(builder.registries.panels.has(ISSUES_PANEL_ID)).toBe(false);
    expect(builder.registries.panels.has(SHORTCUTS_PANEL_ID)).toBe(false);
    expect(builder.registries.tools.has(VALIDATE_TOOL_ID)).toBe(false);

    // Nothing else moved, and the layout keeps naming a panel that no longer
    // exists: a layout is a declaration, and the editor composes a region from
    // the panels the registry still holds.
    expect(builder.registries.nodes.has("example.basic.start")).toBe(true);
    expect(builder.layout.active().panels.map((panel) => panel.panelId)).toContain(
      ISSUES_PANEL_ID,
    );

    // Renderer bindings are not contributions and are never withdrawn, so the
    // editor keeps the components it mounted (docs/PLUGINS.md, limitations).
    expect(typeof builder.renderers.panels.get(ISSUES_PANEL_ID)).toBe("function");
    expect(() => createRendererSet(builder.renderers)).not.toThrow();
  });

  it("mounts the AI plugin through the host's renderer bindings", () => {
    // `example.ai-nodes` is framework-agnostic: it registers node definitions and
    // binds nothing. The host is what turns each node type into a component, so
    // a builder with it installed is mountable — the five plugins all activate
    // on the same canvas.
    const { builder, manager } = demo();

    expect(manager.get("example.ai-nodes")?.state).toBe("active");
    expect(builder.registries.nodes.get(CLASSIFY_NODE_TYPE)).toMatchObject({ label: "Classify" });
    expect(builder.registries.nodes.get(EMBED_NODE_TYPE)).toMatchObject({ label: "Embed" });

    // Both AI node types resolve to a component the host bound, keyed by the
    // node type itself.
    expect(typeof builder.renderers.nodes.get(CLASSIFY_NODE_TYPE)).toBe("function");
    expect(typeof builder.renderers.nodes.get(EMBED_NODE_TYPE)).toBe("function");

    for (const [id, value] of builder.renderers.nodes) {
      expect([id, typeof value]).toEqual([id, "function"]);
    }
    expect(() => createRendererSet(builder.renderers)).not.toThrow();
  });
});
