import { cleanup, createEvent, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import { assertOk, createBuilder, type Builder, type NodeDefinitionInput } from "@nodera/sdk";
import { NODE_DEFINITION_MIME_TYPE } from "../canvas/definition-drop.js";
import type { LayoutDefinition } from "@nodera/ui-core";

import { NoderaEditor, type NoderaEditorProps } from "./nodera-editor.js";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const NODE: NodeDefinitionInput = {
  type: "acme.http-request",
  label: "HTTP Request",
  category: "acme",
  ports: { inputs: [{ id: "in" }], outputs: [{ id: "out" }] },
};

/** Layout that places the two panels the feature flags own. */
const FEATURE_LAYOUT: LayoutDefinition = {
  id: "acme.layout.features",
  name: "Features",
  panels: [
    { panelId: "header", region: "header", size: 44 },
    { panelId: "palette", region: "left", size: 240 },
    { panelId: "minimap", region: "right", size: 240 },
    { panelId: "validation", region: "bottom", size: 160 },
  ],
};

/** Layout whose left region is the palette. */
const PALETTE_LAYOUT: LayoutDefinition = {
  id: "acme.layout.palette",
  panels: [
    { panelId: "header", region: "header", size: 44 },
    { panelId: "palette", region: "left", size: 240 },
  ],
};

/** Layout whose left region is the navigator instead. */
const NAVIGATOR_LAYOUT: LayoutDefinition = {
  id: "acme.layout.navigator",
  panels: [
    { panelId: "header", region: "header", size: 44 },
    { panelId: "navigator", region: "left", size: 240 },
  ],
};

interface BuilderOptions {
  readonly features?: Readonly<Record<string, boolean>>;
  readonly layouts?: readonly LayoutDefinition[];
  readonly layoutId?: string;
}

function createEditorBuilder(options: BuilderOptions = {}): Builder {
  return assertOk(
    createBuilder({
      registry: {
        nodes: [NODE],
        ...(options.layouts === undefined ? {} : { layouts: options.layouts }),
      },
      ...(options.features === undefined ? {} : { features: options.features }),
      ...(options.layoutId === undefined ? {} : { ui: { layout: options.layoutId } }),
    }),
  );
}

function editor(props: NoderaEditorProps): ReactElement {
  return <NoderaEditor {...props} />;
}

/** The element that owns the canvas drop handlers. */
function dropTarget(container: HTMLElement): HTMLElement {
  const target = container.querySelector("[data-color-mode]");
  if (!(target instanceof HTMLElement)) {
    throw new Error("canvas wrapper not rendered");
  }
  return target;
}

/** Drop event carrying a node-definition payload at explicit coordinates. */
function dropEvent(
  target: HTMLElement,
  definitionId: string,
  position: { readonly clientX: number; readonly clientY: number } = {
    clientX: 120,
    clientY: 80,
  },
): Event {
  const event = createEvent.drop(target, {
    dataTransfer: {
      types: [NODE_DEFINITION_MIME_TYPE],
      getData: () => definitionId,
    },
  });
  Object.defineProperty(event, "clientX", { value: position.clientX });
  Object.defineProperty(event, "clientY", { value: position.clientY });
  return event;
}

afterEach(cleanup);

/* ------------------------------------------------------------------ */
/*  Default composition                                                */
/* ------------------------------------------------------------------ */

describe("<NoderaEditor> default composition", () => {
  it("renders the shell regions with the panels the applied layout places", () => {
    const { container } = render(editor({ builder: createEditorBuilder() }));

    expect(container.querySelector("[data-nodera-shell]")).not.toBeNull();
    for (const region of ["header", "left", "right", "bottom", "canvas"]) {
      expect(container.querySelector(`[data-nodera-region="${region}"]`)).not.toBeNull();
    }

    expect(container.querySelector('[data-nodera-panel-id="header"]')).not.toBeNull();
    expect(container.querySelector('[data-nodera-panel-id="palette"]')).not.toBeNull();
    expect(container.querySelector('[data-nodera-panel-id="properties"]')).not.toBeNull();
    expect(container.querySelector('[data-nodera-panel-id="validation"]')).not.toBeNull();

    expect(container.querySelector("[data-nodera-canvas-container]")).not.toBeNull();
    expect(container.querySelector(".react-flow")).not.toBeNull();
  });

  it("renders the nodes the builder graph owns", () => {
    const builder = createEditorBuilder();
    assertOk(builder.graph.addNode({ type: "acme.http-request", nodeId: "n1" }));

    const { container } = render(editor({ builder }));

    const nodes = container.querySelectorAll("[data-nodera-node]");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.textContent).toContain("HTTP Request");
  });

  it("composes only the panels that still exist in the registry", () => {
    const builder = createEditorBuilder();
    expect(builder.registries.panels.unregister("palette").ok).toBe(true);
    expect(builder.registries.panels.unregister("header").ok).toBe(true);

    const { container } = render(editor({ builder }));

    expect(container.querySelector('[data-nodera-panel-id="palette"]')).toBeNull();
    // Without a header panel the header region falls back to the toolbar.
    expect(container.querySelector('[data-nodera-panel-id="header"]')).toBeNull();
    expect(container.querySelector("[data-nodera-toolbar]")).not.toBeNull();
  });

  it("adds a node dropped from the palette through builder.graph", async () => {
    const builder = createEditorBuilder();
    const { container } = render(editor({ builder }));

    fireEvent(dropTarget(container), dropEvent(dropTarget(container), "acme.http-request"));

    await waitFor(() => {
      expect(builder.graph.nodeCount()).toBe(1);
    });
    await waitFor(() => {
      expect(container.querySelectorAll("[data-nodera-node]")).toHaveLength(1);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Feature flags (D7)                                                 */
/* ------------------------------------------------------------------ */

describe("<NoderaEditor> feature flags", () => {
  it("composes the minimap and validation panels when the features are on", () => {
    const builder = createEditorBuilder({
      layouts: [FEATURE_LAYOUT],
      layoutId: FEATURE_LAYOUT.id,
    });

    const { container } = render(editor({ builder }));

    expect(container.querySelector('[data-nodera-panel-id="minimap"]')).not.toBeNull();
    expect(container.querySelector('[data-nodera-panel-id="validation"]')).not.toBeNull();
  });

  it("drops the panel of every disabled feature and nothing else", () => {
    const builder = createEditorBuilder({
      layouts: [FEATURE_LAYOUT],
      layoutId: FEATURE_LAYOUT.id,
      features: { minimap: false, validation: false },
    });

    const { container } = render(editor({ builder }));

    expect(container.querySelector('[data-nodera-panel-id="minimap"]')).toBeNull();
    expect(container.querySelector('[data-nodera-panel-id="validation"]')).toBeNull();
    // Untouched panels stay composed.
    expect(container.querySelector('[data-nodera-panel-id="palette"]')).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Host composition (Level 3)                                         */
/* ------------------------------------------------------------------ */

describe("<NoderaEditor> host composition", () => {
  it("lets the host replace the canvas region through slots", () => {
    const { container } = render(
      editor({
        builder: createEditorBuilder(),
        slots: { canvas: <div data-testid="host-canvas">Host canvas</div> },
      }),
    );

    expect(container.querySelector('[data-testid="host-canvas"]')).not.toBeNull();
    // The default canvas composition is gone, docked regions are untouched.
    expect(container.querySelector("[data-nodera-canvas-container]")).toBeNull();
    expect(container.querySelector('[data-nodera-panel-id="palette"]')).not.toBeNull();
  });

  it("applies the layout the host names on the editor", () => {
    const builder = createEditorBuilder({
      layouts: [PALETTE_LAYOUT, NAVIGATOR_LAYOUT],
      layoutId: PALETTE_LAYOUT.id,
    });

    const first = render(editor({ builder }));
    expect(first.container.querySelector('[data-nodera-panel-id="palette"]')).not.toBeNull();
    cleanup();

    const second = render(editor({ builder, layout: NAVIGATOR_LAYOUT.id }));
    expect(second.container.querySelector('[data-nodera-panel-id="navigator"]')).not.toBeNull();
    expect(second.container.querySelector('[data-nodera-panel-id="palette"]')).toBeNull();
    expect(builder.store.getState().layoutId).toBe(NAVIGATOR_LAYOUT.id);
  });

  it("resizes the panel of a region through the builder's layout state", () => {
    const builder = createEditorBuilder();
    const resized: { readonly region: string; readonly size: number }[] = [];

    render(
      editor({
        builder,
        onResizeRegion: (region, size) => {
          resized.push({ region, size });
        },
      }),
    );

    const splitter = document.querySelector('[data-nodera-splitter="left"]');
    if (!(splitter instanceof HTMLElement)) {
      throw new Error("left splitter not rendered");
    }
    fireEvent.pointerDown(splitter, { clientX: 240 });
    fireEvent.pointerMove(document, { clientX: 300 });
    fireEvent.pointerUp(document);

    expect(resized).toEqual([{ region: "left", size: 300 }]);
    const palette = builder.store.getState().layout?.panels.find(
      (panel) => panel.panelId === "palette",
    );
    expect(palette?.size).toBe(300);
  });
});

/* ------------------------------------------------------------------ */
/*  Edge insertion passthrough                                         */
/* ------------------------------------------------------------------ */

/**
 * The per-edge "+" is runtime state now: the editor reads it from the UI
 * store (`builder.features.setEdgeInsertion` writes it), so toggling the
 * affordance must reach the canvas without a rebuild.
 */
describe("<NoderaEditor> edge insertion passthrough", () => {
  it("paints the per-edge \"+\" only while the affordance is enabled", async () => {
    const builder = assertOk(
      createBuilder({
        registry: { nodes: [NODE] },
        features: { edgeInsertion: true },
      }),
    );
    assertOk(builder.graph.addNode({ type: "acme.http-request", nodeId: "n1" }));
    assertOk(builder.graph.addNode({ type: "acme.http-request", nodeId: "n2" }));
    assertOk(builder.graph.connect({ source: "n1", target: "n2" }));

    const { container } = render(editor({ builder }));

    expect(
      container.querySelector('button[aria-label="Insert node"]'),
    ).not.toBeNull();

    assertOk(builder.features.setEdgeInsertion(false));

    await waitFor(() => {
      expect(
        container.querySelector('button[aria-label="Insert node"]'),
      ).toBeNull();
    });

    assertOk(builder.features.setEdgeInsertion(true));

    await waitFor(() => {
      expect(
        container.querySelector('button[aria-label="Insert node"]'),
      ).not.toBeNull();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Node transition passthrough                                        */
/* ------------------------------------------------------------------ */

/**
 * How a node reaches its position is host configuration too, so the editor's
 * only job here is the passthrough: `graph.layout.nodeTransition` reaches the UI
 * state and the UI state reaches the canvas, which turns it into one scoped rule.
 * A broken wire would leave the canvas on its own `"instant"` default, which is
 * exactly what these two cases tell apart.
 */
describe("<NoderaEditor> node transition", () => {
  it("renders the transition rule the configuration declares", () => {
    const builder = assertOk(
      createBuilder({
        registry: { nodes: [NODE] },
        graph: { layout: { mode: "auto", drag: "snap-back", nodeTransition: "animated" } },
      }),
    );

    const { container } = render(editor({ builder }));

    expect(builder.store.getState().nodeTransition).toBe("animated");
    expect(container.querySelector("style[data-nodera-node-transition]")).not.toBeNull();
  });

  it("renders no transition rule when the configuration keeps the instant default", () => {
    const builder = assertOk(createBuilder({ registry: { nodes: [NODE] } }));

    const { container } = render(editor({ builder }));

    expect(builder.store.getState().nodeTransition).toBe("instant");
    expect(container.querySelector("style[data-nodera-node-transition]")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Host-rendered insert affordances (S6)                              */
/* ------------------------------------------------------------------ */

/**
 * The placeholder is host-replaceable (S6), so the editor's job is the same
 * passthrough the per-edge "+" already gets: the prop reaches the canvas and
 * the canvas renders it instead of its own control.
 */
describe("<NoderaEditor> host-rendered affordances", () => {
  /** Builder with the affordance on and two leaves. */
  function forkingBuilder(): Builder {
    const builder = assertOk(
      createBuilder({
        registry: { nodes: [NODE] },
        features: { edgeInsertion: true },
      }),
    );
    for (const nodeId of ["n1", "n2", "n3"]) {
      assertOk(builder.graph.addNode({ type: "acme.http-request", nodeId }));
    }
    assertOk(builder.graph.connect({ source: "n1", target: "n2" }));
    assertOk(builder.graph.connect({ source: "n1", target: "n3" }));
    return builder;
  }

  it("forwards renderPlaceholder to the canvas", () => {
    const builder = forkingBuilder();

    const { container } = render(
      editor({
        builder,
        renderPlaceholder: (placeholder) => (
          <div
            data-testid="host-placeholder"
            data-host-kind={placeholder.kind}
            data-host-anchor={placeholder.anchorId ?? ""}
          />
        ),
      }),
    );

    // n2 and n3 carry no outgoing edge, so each one gets a placeholder.
    const placeholders = container.querySelectorAll("[data-testid='host-placeholder']");
    expect(placeholders).toHaveLength(2);
    expect(placeholders[0]?.getAttribute("data-host-kind")).toBe("successor");
    // Replaced, not doubled: the framework's own controls are gone.
    expect(container.querySelector("[data-nodera-phantom-node]")).toBeNull();
  });

  it("keeps the framework's placeholder when the host supplies none", () => {
    const builder = forkingBuilder();

    const { container } = render(editor({ builder }));

    expect(container.querySelectorAll("[data-nodera-phantom-node]")).toHaveLength(2);
    expect(container.querySelector("[data-testid='host-placeholder']")).toBeNull();
  });
});
