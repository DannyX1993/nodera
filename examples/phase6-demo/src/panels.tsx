/**
 * Host-authored panel renderers of the Phase 6 demo.
 *
 * Two different things are demonstrated here, both through the public SDK:
 *
 * - a panel the *plugin* contributes (`demo.panel.observability`), with the
 *   component bound by the plugin itself through `api.renderers.bind`;
 * - a *replacement* of a built-in panel renderer
 *   (`nodera.panel.validation`), bound by the host with
 *   `builder.bindRenderer("panels", panel.renderer, component)`.
 *
 * Each renderer is created by a factory that closes over the builder, because a
 * panel renderer receives only its panel definition: the data a panel shows is
 * whatever the host decides to read from the builder, never something the
 * framework pushes into it.
 */

import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";

import type { Builder } from "@nodera/sdk";

/* ------------------------------------------------------------------ */
/*  Renderer contract the React binding calls panels with              */
/* ------------------------------------------------------------------ */

/**
 * Props of a panel renderer, mirroring the binding's `PanelRendererProps`.
 *
 * The SDK keeps renderers opaque, so the host declares the shape it consumes.
 */
export interface DemoPanelProps {
  readonly panel: {
    readonly id: string;
    readonly title: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Token-driven styles                                                */
/* ------------------------------------------------------------------ */

const PANEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-sm, 4px)",
  height: "100%",
  minHeight: 0,
  padding: "var(--ndr-spacing-sm, 4px)",
  overflow: "auto",
  fontFamily: "var(--ndr-typography-font-family, system-ui)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  color: "var(--ndr-colors-text, #111827)",
};

const HEADING_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--ndr-colors-accent, #2563eb)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  fontWeight: "var(--ndr-typography-font-weight-bold, 600)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const NOTE_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--ndr-colors-text-muted, #5b6472)",
  lineHeight: 1.5,
};

const LIST_STYLE: CSSProperties = {
  margin: 0,
  paddingLeft: 14,
  color: "var(--ndr-colors-text, #111827)",
  lineHeight: 1.6,
};

const FACTS_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "0 var(--ndr-spacing-sm, 4px)",
  margin: 0,
  color: "var(--ndr-colors-text, #111827)",
  lineHeight: 1.6,
};

const FACT_LABEL_STYLE: CSSProperties = {
  color: "var(--ndr-colors-text-muted, #5b6472)",
};

const FACT_VALUE_STYLE: CSSProperties = {
  fontFamily: "var(--ndr-typography-font-family-mono, ui-monospace)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * Counts the graph changes a panel has observed.
 *
 * A panel renderer is a host component: nothing re-renders it when the graph
 * changes, so a panel that shows live numbers has to say what it wants to hear
 * about. `builder.events` is the public way to do that.
 */
function useGraphRevision(builder: Builder): number {
  const [revision, setRevision] = useState(0);
  useEffect(
    () =>
      builder.events.on("graph.changed", () => {
        setRevision((current) => current + 1);
      }),
    [builder],
  );
  return revision;
}

/** One label/value row of a facts list. */
function Fact(props: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <>
      <dt style={FACT_LABEL_STYLE}>{props.label}</dt>
      <dd style={{ ...FACT_VALUE_STYLE, margin: 0 }} title={props.value}>
        {props.value}
      </dd>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Plugin panel                                                       */
/* ------------------------------------------------------------------ */

/**
 * Renderer of the panel the demo plugin registers.
 *
 * It reads the composition the builder reports — adapter, document contract,
 * feature flags, diagnostics — which is exactly what a third-party panel can
 * see through the public API and nothing more.
 *
 * The builder arrives through a reader because `install` runs while the builder
 * is still being composed: the panel resolves it when it renders.
 */
export function createObservabilityPanel(readBuilder: () => Builder): ComponentType<DemoPanelProps> {
  return function ObservabilityPanel(_props: DemoPanelProps): ReactNode {
    const builder = readBuilder();
    const revision = useGraphRevision(builder);
    const adapter = builder.adapter;
    const features = Object.entries(builder.features)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => feature);
    // Definitions are read back in the §9 vocabulary (`type`), not the core one.
    const nodeTypes = builder.registries.nodes.all().map((definition) => definition.type);

    return (
      <div data-demo-panel="observability" style={PANEL_STYLE}>
        <h3 style={HEADING_STYLE}>Plugin panel</h3>
        <p style={NOTE_STYLE}>
          Contributed by the <code>demo.observability</code> plugin through{" "}
          <code>api.panels.register</code> and rendered by the component the plugin
          bound with <code>api.renderers.bind</code>.
        </p>
        <dl style={FACTS_STYLE}>
          <Fact label="Adapter" value={adapter === undefined ? "none" : adapter.id} />
          <Fact
            label="Document"
            value={`${builder.documentFormat.format} ${builder.documentFormat.version}`}
          />
          <Fact label="Features" value={features.join(", ")} />
          <Fact label="Node types" value={String(nodeTypes.length)} />
          <Fact label="Nodes" value={String(builder.graph.nodeCount())} />
          <Fact label="Edges" value={String(builder.graph.edgeCount())} />
          <Fact label="Diagnostics" value={String(builder.diagnostics.length)} />
          <Fact label="Changes seen" value={String(revision)} />
        </dl>
        <h3 style={HEADING_STYLE}>Registered definitions</h3>
        <ul style={LIST_STYLE}>
          {nodeTypes.map((type) => (
            <li key={type}>{type}</li>
          ))}
        </ul>
      </div>
    );
  };
}

/* ------------------------------------------------------------------ */
/*  Replacement of a built-in panel renderer                           */
/* ------------------------------------------------------------------ */

/**
 * Renderer that replaces the built-in validation panel.
 *
 * The panel definition, its region, its title bar and its placement stay the
 * framework's; only the component the renderer id resolves to is the host's.
 * That is what `builder.bindRenderer("panels", panel.renderer, component)`
 * means: component replacement, not panel re-registration.
 */
export function createHostPanel(builder: Builder): ComponentType<DemoPanelProps> {
  return function HostPanel(props: DemoPanelProps): ReactNode {
    const revision = useGraphRevision(builder);
    const nodeTypes = builder.registries.nodes.all();

    return (
      <div data-demo-panel="host-replacement" data-demo-panel-id={props.panel.id} style={PANEL_STYLE}>
        <h3 style={HEADING_STYLE}>Host panel</h3>
        <p style={NOTE_STYLE}>
          This component replaced the built-in <code>nodera.panel.validation</code>{" "}
          renderer through <code>builder.bindRenderer(&quot;panels&quot;, …)</code>. Run{" "}
          <strong>Validate graph</strong> in the host bar to see the validation report.
        </p>
        <dl style={FACTS_STYLE}>
          <Fact label="Panel id" value={props.panel.id} />
          <Fact label="Nodes" value={String(builder.graph.nodeCount())} />
          <Fact label="Edges" value={String(builder.graph.edgeCount())} />
          <Fact label="Definitions" value={String(nodeTypes.length)} />
          <Fact label="Changes seen" value={String(revision)} />
        </dl>
      </div>
    );
  };
}
