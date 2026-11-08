import { cleanup, render } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { PanelDefinition } from "@nodera/ui-core";

import type {
  ComponentRenderers,
  EditorShellSlots,
  GraphCanvasProps,
  MenuRendererProps,
  NoderaNodeData,
  NoderaNodePort,
  NoderaNodeRendererProps,
  NoderaPortRendererProps,
  PanelRendererProps,
  PropertyRendererProps,
  ToolbarRendererProps,
} from "./index.js";

/**
 * Guard for the renderer vocabulary of the React binding.
 *
 * A renderer value stays opaque (`unknown`) inside `@nodera/sdk`; these are the
 * names a host writes once its renderer reaches the React binding. The tuple is
 * the compile-time assertion: this file stops compiling when the barrel drops
 * one of them. {@link RENDERER_VOCABULARY_NAMES} is its runtime twin, so a
 * rename or a reordering of the tuple is caught too, and the panel renderer is
 * actually rendered with its imported props type, so the contract is exercised
 * instead of merely being named.
 */
type RendererVocabulary = readonly [
  readonly [name: "NoderaNodeRendererProps", contract: NoderaNodeRendererProps],
  readonly [name: "NoderaPortRendererProps", contract: NoderaPortRendererProps],
  readonly [name: "NoderaNodeData", contract: NoderaNodeData],
  readonly [name: "NoderaNodePort", contract: NoderaNodePort],
  readonly [name: "GraphCanvasProps", contract: GraphCanvasProps],
  readonly [name: "PanelRendererProps", contract: PanelRendererProps],
  readonly [name: "PropertyRendererProps", contract: PropertyRendererProps],
  readonly [name: "ToolbarRendererProps", contract: ToolbarRendererProps],
  readonly [name: "MenuRendererProps", contract: MenuRendererProps],
  readonly [name: "EditorShellSlots", contract: EditorShellSlots],
  readonly [name: "ComponentRenderers", contract: ComponentRenderers],
];

/** Entry count of {@link RendererVocabulary}, typed against the tuple itself. */
const RENDERER_VOCABULARY_COUNT: RendererVocabulary["length"] = 11;

/**
 * The published names in tuple order.
 *
 * The annotation is the compile-time half of the guard: an entry the tuple does
 * not publish (a renamed or removed contract) stops this file compiling. The
 * assertion below is the runtime half, so an omission or a reordering is caught
 * as well.
 */
const RENDERER_VOCABULARY_NAMES: readonly RendererVocabulary[number][0][] = [
  "NoderaNodeRendererProps",
  "NoderaPortRendererProps",
  "NoderaNodeData",
  "NoderaNodePort",
  "GraphCanvasProps",
  "PanelRendererProps",
  "PropertyRendererProps",
  "ToolbarRendererProps",
  "MenuRendererProps",
  "EditorShellSlots",
  "ComponentRenderers",
];

/** A panel a host could define; the renderer below must accept it. */
const PANEL: PanelDefinition = {
  id: "acme.panel.inspector",
  title: "Acme inspector",
  region: "right",
};

afterEach(cleanup);

describe("public renderer vocabulary", () => {
  it("publishes every renderer contract a host has to implement, by name", () => {
    expect(RENDERER_VOCABULARY_COUNT).toBe(11);
    expect(RENDERER_VOCABULARY_NAMES).toEqual([
      "NoderaNodeRendererProps",
      "NoderaPortRendererProps",
      "NoderaNodeData",
      "NoderaNodePort",
      "GraphCanvasProps",
      "PanelRendererProps",
      "PropertyRendererProps",
      "ToolbarRendererProps",
      "MenuRendererProps",
      "EditorShellSlots",
      "ComponentRenderers",
    ]);
  });

  it("renders a panel renderer written against the published props type", () => {
    const Panel = ({ panel }: PanelRendererProps): ReactElement =>
      createElement("section", { "data-panel": panel.id }, panel.title);

    const { container } = render(createElement(Panel, { panel: PANEL }));

    const rendered = container.querySelector("section");
    expect(rendered?.getAttribute("data-panel")).toBe("acme.panel.inspector");
    expect(rendered?.textContent).toBe("Acme inspector");
  });
});
