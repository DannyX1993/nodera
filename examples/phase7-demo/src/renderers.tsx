/**
 * React renderers of the Phase 7 demo: the host half of the plugin ecosystem.
 *
 * A plugin contribution is never a component (AGENTS.md §5, §9). The node
 * definitions and the two developer-tools panels arrive as declarative data
 * through the public plugin API, and the host is what gives them their looks:
 *
 * | Renderer id                    | Component                     | Contributed by            |
 * | ------------------------------ | ----------------------------- | ------------------------- |
 * | `example.basic.start`          | {@link StartNode}             | `example.basic-nodes`     |
 * | `example.basic.transform`      | {@link TransformNode}         | `example.basic-nodes`     |
 * | `example.ai.classify`          | {@link ClassifyNode}          | `example.ai-nodes`        |
 * | `example.ai.embed`             | {@link EmbedNode}             | `example.ai-nodes`        |
 * | `example.dev.panel.issues`     | {@link createIssuesPanel}     | `example.developer-tools` |
 * | `example.dev.panel.shortcuts`  | {@link createShortcutsPanel}  | `example.developer-tools` |
 *
 * The ids are the plugins' own: a node type *is* its renderer id, and a panel
 * without a `renderer` of its own resolves its id. `builder.ts` binds them next
 * to the plugins that declare them.
 *
 * `example.ai-nodes` illustrates the split at its purest: the plugin contributes
 * two node definitions and binds no renderer, and the two components below are
 * the host's share of that contract — no plugin ever ships a component.
 *
 * The panel factories close over the builder because a panel renderer receives
 * only its panel definition: what a panel shows is whatever the host decides to
 * read from the public surface, never something the framework pushes into it.
 */

import { useState, type CSSProperties, type ReactNode } from "react";

import type { NoderaNodeRendererProps, PanelRendererProps } from "@nodera/react-flow";
import type { Builder } from "@nodera/sdk";

/** Group the developer-tools plugin declares for its actions. */
const DEVELOPER_TOOL_GROUP = "Developer";

/* ------------------------------------------------------------------ */
/*  Token-driven styles (the theme writes these custom properties)     */
/* ------------------------------------------------------------------ */

const BOX_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
  boxSizing: "border-box",
  minWidth: "var(--ndr-node-min-width, 170px)",
  maxWidth: 240,
  padding: "var(--ndr-node-padding, 8px)",
  border: "1px solid var(--ndr-node-border-color, #c7d2e0)",
  borderLeftWidth: "3px",
  borderRadius: "var(--ndr-node-radius, 5px)",
  background: "var(--ndr-node-background, #ffffff)",
  color: "var(--ndr-node-text-color, #111827)",
  fontFamily: "var(--ndr-typography-font-family, system-ui)",
  fontSize: "var(--ndr-node-font-size, 13px)",
  cursor: "inherit",
};

const BOX_SELECTED_STYLE: CSSProperties = {
  borderColor: "var(--ndr-node-border-color-selected, #2563eb)",
  outline:
    "var(--ndr-selection-outline-width, 2px) solid var(--ndr-selection-outline-color, #2563eb)",
  outlineOffset: "var(--ndr-selection-outline-offset, 1px)",
};

const BOX_HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-sm, 4px)",
};

const BADGE_STYLE: CSSProperties = {
  padding: "0 var(--ndr-spacing-sm, 4px)",
  border: "1px solid var(--ndr-colors-accent, #2563eb)",
  borderRadius: "var(--ndr-borders-radius-sm, 3px)",
  color: "var(--ndr-colors-accent, #2563eb)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  fontWeight: "var(--ndr-typography-font-weight-bold, 600)",
  letterSpacing: "0.04em",
};

const TITLE_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: "var(--ndr-node-label-font-weight, 600)",
};

const MONO_STYLE: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--ndr-node-text-color-muted, #5b6472)",
  fontFamily: "var(--ndr-typography-font-family-mono, ui-monospace)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
};

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
  lineHeight: 1.6,
};

const ACTION_STYLE: CSSProperties = {
  alignSelf: "flex-start",
  padding: "2px 8px",
  border: "1px solid var(--ndr-colors-border, #d8dee9)",
  borderRadius: "var(--ndr-borders-radius-sm, 3px)",
  background: "var(--ndr-colors-surface, #ffffff)",
  color: "var(--ndr-colors-text, #111827)",
  font: "inherit",
  cursor: "pointer",
};

/* ------------------------------------------------------------------ */
/*  Readers: property values are `unknown` until checked               */
/* ------------------------------------------------------------------ */

/** One property value as display text, without assuming its type. */
function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value) ?? "undefined";
}

/** The node box every plugin node type of this demo is drawn with. */
function NodeBox(
  props: {
    readonly kind: string;
    readonly badge: string;
    readonly node: NoderaNodeRendererProps;
  },
): ReactNode {
  const { data, selected } = props.node;
  // A plugin declares its node data; the host renders what it reads back. These
  // definitions declare no properties, so the demo seeds illustrative values and
  // shows at most two of them.
  const properties = Object.entries(data.properties).slice(0, 2);
  const ports = data.ports.map((port) => `${port.direction === "input" ? "→" : "←"} ${port.id}`);

  return (
    <div
      data-demo-node-renderer={props.kind}
      data-demo-node-type={data.definitionId}
      data-selected={selected ? "true" : "false"}
      style={{ ...BOX_STYLE, ...(selected ? BOX_SELECTED_STYLE : {}) }}
    >
      <div style={BOX_HEADER_STYLE}>
        <span style={BADGE_STYLE}>{props.badge}</span>
        <span style={TITLE_STYLE}>{data.label}</span>
      </div>
      {properties.length === 0 ? (
        <span style={MONO_STYLE}>no properties</span>
      ) : (
        properties.map(([id, value]) => (
          <span key={id} style={MONO_STYLE} title={displayValue(value)}>
            {id}: {displayValue(value)}
          </span>
        ))
      )}
      <span style={MONO_STYLE}>{ports.length === 0 ? "no ports" : ports.join("  ")}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Node renderers of the basic-nodes plugin                           */
/* ------------------------------------------------------------------ */

/** Renderer of `example.basic.start`. */
export function StartNode(props: NoderaNodeRendererProps): ReactNode {
  return <NodeBox kind="start" badge="IN" node={props} />;
}

/** Renderer of `example.basic.transform`. */
export function TransformNode(props: NoderaNodeRendererProps): ReactNode {
  return <NodeBox kind="transform" badge="FN" node={props} />;
}

/* ------------------------------------------------------------------ */
/*  Node renderers of the ai-nodes plugin                              */
/* ------------------------------------------------------------------ */

/** Renderer of `example.ai.classify`. */
export function ClassifyNode(props: NoderaNodeRendererProps): ReactNode {
  return <NodeBox kind="classify" badge="AI" node={props} />;
}

/** Renderer of `example.ai.embed`. */
export function EmbedNode(props: NoderaNodeRendererProps): ReactNode {
  return <NodeBox kind="embed" badge="AI" node={props} />;
}

/* ------------------------------------------------------------------ */
/*  Panel renderers of the developer-tools plugin                      */
/* ------------------------------------------------------------------ */

/** Issues the panel collected, ready to render. */
interface IssueLine {
  readonly key: string;
  readonly severity: string;
  readonly text: string;
}

/**
 * Renderer of the `example.dev.panel.issues` panel.
 *
 * The button runs the builder's own validation, which is the registry the
 * data-nodes plugin contributed its validator to: the panel is the host's view
 * of code another plugin registered.
 */
export function createIssuesPanel(builder: Builder) {
  return function IssuesPanel(props: PanelRendererProps): ReactNode {
    const [lines, setLines] = useState<readonly IssueLine[] | undefined>(undefined);

    const run = (): void => {
      const report = builder.graph.validate();
      setLines(
        report.issues.map((issue, index) => ({
          key: `${issue.code}:${index}`,
          severity: issue.severity,
          text: `${issue.code} — ${issue.message}`,
        })),
      );
    };

    return (
      <div data-demo-panel={props.panel.id} style={PANEL_STYLE}>
        <h3 style={HEADING_STYLE}>{props.panel.title}</h3>
        <p style={NOTE_STYLE}>
          Panel contributed by <code>example.developer-tools</code>; the button runs{" "}
          <code>builder.graph.validate()</code>, which includes the validator{" "}
          <code>example.data-nodes</code> registered.
        </p>
        <button type="button" style={ACTION_STYLE} onClick={run}>
          Validate graph
        </button>
        {lines === undefined ? (
          <p style={NOTE_STYLE}>Not run yet.</p>
        ) : lines.length === 0 ? (
          <p style={NOTE_STYLE}>No issues.</p>
        ) : (
          <ul style={LIST_STYLE}>
            {lines.map((line) => (
              <li key={line.key}>
                {line.severity.toUpperCase()} {line.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };
}

/**
 * Renderer of the `example.dev.panel.shortcuts` panel.
 *
 * It reads the tool registry: the actions the plugin contributed are data, so
 * the host can list them without knowing what they do.
 */
export function createShortcutsPanel(builder: Builder) {
  return function ShortcutsPanel(props: PanelRendererProps): ReactNode {
    const tools = builder.registries.tools.byGroup(DEVELOPER_TOOL_GROUP);

    return (
      <div data-demo-panel={props.panel.id} style={PANEL_STYLE}>
        <h3 style={HEADING_STYLE}>{props.panel.title}</h3>
        <p style={NOTE_STYLE}>
          Actions in the <code>{DEVELOPER_TOOL_GROUP}</code> group, read from{" "}
          <code>builder.registries.tools</code>.
        </p>
        <ul style={LIST_STYLE}>
          {tools.map((tool) => (
            <li key={tool.id}>
              {tool.label} <code>({tool.command.kind})</code>
            </li>
          ))}
        </ul>
      </div>
    );
  };
}
