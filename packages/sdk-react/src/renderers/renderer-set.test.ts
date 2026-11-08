import { describe, expect, it } from "vitest";
import { forwardRef, memo } from "react";

import { RENDERER_KINDS, type RendererBindings, type RendererKind } from "@nodera/sdk";
import type { PanelRendererProps } from "@nodera/ui-react";
import {
  ComponentRegistry,
  createDefaultComponentRenderers,
  type ComponentRenderers,
} from "@nodera/ui-react";

import {
  InvalidRendererBindingError,
  createRendererSet,
  isRenderableComponent,
} from "./renderer-set.js";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const PanelA = (): null => null;
const PanelB = (): null => null;
const ToolbarA = (): null => null;
const MenuA = (): null => null;
const PropertyA = (): null => null;

/** Builds a binding snapshot without repeating the seven empty maps. */
function bindings(
  partial: Partial<Record<RendererKind, ReadonlyMap<string, unknown>>> = {},
): RendererBindings {
  const empty: Record<RendererKind, ReadonlyMap<string, unknown>> = {
    nodes: new Map(),
    edges: new Map(),
    ports: new Map(),
    properties: new Map(),
    panels: new Map(),
    toolbars: new Map(),
    menus: new Map(),
  };
  return { ...empty, ...partial };
}

/* ------------------------------------------------------------------ */
/*  isRenderableComponent                                              */
/* ------------------------------------------------------------------ */

describe("isRenderableComponent", () => {
  it("accepts functions, strings and component objects", () => {
    expect(isRenderableComponent((): null => null)).toBe(true);
    expect(isRenderableComponent(function Named(): null { return null; })).toBe(true);
    expect(isRenderableComponent(memo((): null => null))).toBe(true);
    expect(isRenderableComponent(forwardRef((): null => null))).toBe(true);
    expect(isRenderableComponent("div")).toBe(true);
  });

  it("rejects values that React cannot render", () => {
    expect(isRenderableComponent(undefined)).toBe(false);
    expect(isRenderableComponent(null)).toBe(false);
    expect(isRenderableComponent(42)).toBe(false);
    expect(isRenderableComponent("")).toBe(false);
    expect(isRenderableComponent({})).toBe(false);
    expect(isRenderableComponent({ type: "div" })).toBe(false);
    expect(isRenderableComponent([])).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Kind → registry mapping                                            */
/* ------------------------------------------------------------------ */

describe("createRendererSet", () => {
  it("keeps the framework renderers as the default base", () => {
    const set = createRendererSet(bindings());
    expect(set.components.panels.has("nodera.panel.palette")).toBe(true);
    expect(set.components.properties.has("string")).toBe(true);
    expect(set.nodeRenderers.listIds()).toEqual([]);
    expect(set.edgeRenderers.listIds()).toEqual([]);
    expect(set.portRenderers.listIds()).toEqual([]);
  });

  it("maps every SDK renderer kind onto its React registry", () => {
    const set = createRendererSet(
      bindings({
        nodes: new Map([["acme.node.pill", PanelA]]),
        edges: new Map([["acme.edge.wave", PanelB]]),
        ports: new Map([["acme.port.dot", PanelA]]),
        properties: new Map([["acme.http-request.url", PropertyA]]),
        panels: new Map([["acme.panel.notes", PanelB]]),
        toolbars: new Map([["acme.toolbar.compact", ToolbarA]]),
        menus: new Map([["acme.menu.brand", MenuA]]),
      }),
    );

    expect(set.nodeRenderers.get("acme.node.pill")).toBe(PanelA);
    expect(set.edgeRenderers.get("acme.edge.wave")).toBe(PanelB);
    expect(set.portRenderers.get("acme.port.dot")).toBe(PanelA);
    // The property panel resolves `definition.component ?? definition.type`,
    // so a bound property renderer is keyed by the component id it derives.
    expect(set.components.properties.tryGet("acme.http-request.url")).toBe(PropertyA);
    expect(set.components.panels.tryGet("acme.panel.notes")).toBe(PanelB);
    expect(set.components.toolbars.tryGet("acme.toolbar.compact")).toBe(ToolbarA);
    expect(set.components.menus.tryGet("acme.menu.brand")).toBe(MenuA);
  });

  it("replaces a bound id of the base and keeps the untouched ones", () => {
    const base = createDefaultComponentRenderers();
    const original = base.panels.get("nodera.panel.palette");

    const set = createRendererSet(
      bindings({ panels: new Map([["nodera.panel.palette", PanelA]]) }),
      { base },
    );

    expect(set.components.panels.get("nodera.panel.palette")).toBe(PanelA);
    expect(set.components.panels.get("nodera.panel.validation")).toBe(
      base.panels.get("nodera.panel.validation"),
    );
    // The host's base is copied, never mutated.
    expect(base.panels.get("nodera.panel.palette")).toBe(original);
  });

  it("uses a host-supplied base as the starting point", () => {
    const base: ComponentRenderers = {
      panels: new ComponentRegistry<PanelRendererProps>(),
      properties: createDefaultComponentRenderers().properties,
      toolbars: createDefaultComponentRenderers().toolbars,
      menus: createDefaultComponentRenderers().menus,
    };
    base.panels.register("acme.panel.host", PanelB);

    const set = createRendererSet(bindings(), { base });
    expect(set.components.panels.tryGet("acme.panel.host")).toBe(PanelB);
    expect(set.components.panels.has("nodera.panel.palette")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  Invalid bindings                                                   */
/* ------------------------------------------------------------------ */

describe("createRendererSet invalid bindings", () => {
  it("throws naming every offending binding", () => {
    const call = (): unknown =>
      createRendererSet(
        bindings({
          nodes: new Map<string, unknown>([["acme.bad-node", 42]]),
          properties: new Map<string, unknown>([["acme.node.url", { type: "div" }]]),
        }),
      );

    expect(call).toThrow(InvalidRendererBindingError);
    try {
      call();
      expect.unreachable("createRendererSet must throw for a non-component value");
    } catch (error) {
      const failure = error as InvalidRendererBindingError;
      expect(failure.name).toBe("InvalidRendererBindingError");
      expect(failure.bindings).toEqual(["nodes:acme.bad-node", "properties:acme.node.url"]);
      expect(failure.message).toContain("nodes:acme.bad-node");
      expect(failure.message).toContain("properties:acme.node.url");
    }
  });

  it("reports the offenders of every kind it was given", () => {
    const ids: Record<RendererKind, string> = {
      nodes: "acme.n",
      edges: "acme.e",
      ports: "acme.p",
      properties: "acme.pr",
      panels: "acme.pa",
      toolbars: "acme.t",
      menus: "acme.m",
    };
    const offline = (id: string): ReadonlyMap<string, unknown> =>
      new Map<string, unknown>([[id, null]]);
    const everyKind: RendererBindings = {
      nodes: offline(ids.nodes),
      edges: offline(ids.edges),
      ports: offline(ids.ports),
      properties: offline(ids.properties),
      panels: offline(ids.panels),
      toolbars: offline(ids.toolbars),
      menus: offline(ids.menus),
    };

    expect(() => createRendererSet(everyKind)).toThrow(InvalidRendererBindingError);
    try {
      createRendererSet(everyKind);
      expect.unreachable("createRendererSet must throw for a non-component value");
    } catch (error) {
      const failure = error as InvalidRendererBindingError;
      expect(failure.bindings).toEqual(
        RENDERER_KINDS.map((kind) => `${kind}:${ids[kind]}`),
      );
    }
  });

  it("accepts a valid snapshot without throwing", () => {
    expect(() =>
      createRendererSet(bindings({ panels: new Map([["acme.panel.notes", PanelB]]) })),
    ).not.toThrow();
  });
});
