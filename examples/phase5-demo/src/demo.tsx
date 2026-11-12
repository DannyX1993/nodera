/**
 * Application root of the Phase 5 demo.
 *
 * It is deliberately thin: the demo builds its registries and UI state in
 * `main.tsx`, and this component only wires them into the single provider every
 * UI surface reads (`NoderaUiProvider`). Nothing here knows what a panel, a
 * theme or a layout is beyond passing it along.
 */

import type { ReactNode } from "react";

import type { EditorEngine } from "@nodera/application";
import type { LayoutRegistry } from "@nodera/layout-engine";
import type { ThemeRegistry } from "@nodera/theme-engine";
import type { PanelRegistry, ToolRegistry, UiStateStore } from "@nodera/ui-core";
import {
  NoderaUiProvider,
  type ComponentRenderers,
} from "@nodera/react";

import { Workspace } from "./app.js";

/** Everything the demo host owns and hands to the provider. */
export interface DemoAppProps {
  readonly editor: EditorEngine;
  readonly store: UiStateStore;
  readonly themeRegistry: ThemeRegistry;
  readonly layoutRegistry: LayoutRegistry;
  readonly panelRegistry: PanelRegistry;
  readonly toolRegistry: ToolRegistry;
  readonly renderers: ComponentRenderers;
}

/** The composed demo editor. */
export function DemoApp(props: DemoAppProps): ReactNode {
  return (
    <NoderaUiProvider
      store={props.store}
      editor={props.editor}
      themeRegistry={props.themeRegistry}
      layoutRegistry={props.layoutRegistry}
      panelRegistry={props.panelRegistry}
      toolRegistry={props.toolRegistry}
      renderers={props.renderers}
    >
      <Workspace editor={props.editor} />
    </NoderaUiProvider>
  );
}
