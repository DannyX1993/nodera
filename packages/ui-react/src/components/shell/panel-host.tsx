import type { CSSProperties, ReactNode } from "react";

import { resolvePanelDefaults } from "@nodera/ui-core";

import { useLayoutActions } from "../../bindings/layout-actions.js";
import {
  useComponentRenderers,
  usePanelRegistry,
} from "../../providers/ui-provider.js";
import { PanelChrome } from "./panel-chrome.js";
import { MUTED_TEXT_STYLE } from "./styles.js";

/** Props accepted by {@link PanelHost}. */
export interface PanelHostProps {
  /** Id of a panel registered in the host panel registry. */
  readonly panelId: string;
}

const UNREGISTERED_STYLE: CSSProperties = {
  padding: "var(--ndr-spacing-md, 8px)",
  border:
    "var(--ndr-borders-width, 1px) dashed var(--ndr-colors-border, #d8dee9)",
  borderRadius: "var(--ndr-borders-radius-md, 5px)",
  ...MUTED_TEXT_STYLE,
};

/**
 * Renders one registered panel inside its chrome.
 *
 * The definition is resolved by id and its renderer by `panel.renderer ?? panel.id`
 * (Level 2 component replacement, S3). An unknown panel renders nothing, and a
 * known panel whose renderer is not registered renders an explicit placeholder
 * instead of throwing: a missing renderer is a host configuration gap, not a
 * reason to break the whole editor.
 */
export function PanelHost(props: PanelHostProps): ReactNode {
  const panelRegistry = usePanelRegistry();
  const panels = useComponentRenderers().panels;
  const layoutActions = useLayoutActions();

  const panel = panelRegistry.get(props.panelId);
  if (panel === undefined) {
    return null;
  }

  const Renderer = panels.tryGet(panel.renderer ?? panel.id);
  if (Renderer === undefined) {
    return (
      <div data-nodera-panel-unregistered={panel.id} style={UNREGISTERED_STYLE}>
        {panel.title}
      </div>
    );
  }

  const { hideable } = resolvePanelDefaults(panel);

  return (
    <PanelChrome
      panelId={panel.id}
      title={panel.title}
      hideable={hideable}
      onHide={() => {
        layoutActions.togglePanel(panel.id);
      }}
    >
      <Renderer panel={panel} />
    </PanelChrome>
  );
}
