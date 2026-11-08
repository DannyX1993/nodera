/**
 * Host vocabulary of the Phase 6 demo: the node definitions authored through the
 * SDK's Node API and the React components they reference as opaque renderer
 * values.
 *
 * Two boundaries are visible here and nowhere else:
 *
 * - a definition is declarative data in the SDK vocabulary (`type`, `label`,
 *   `ports`, `properties`), never a component;
 * - a presentation contribution crosses the SDK boundary as an opaque
 *   `unknown` value (`renderer` on the node, `component` on a property). The
 *   React binding is what turns it into a component, so the props interfaces
 *   below mirror the contracts that binding calls a renderer with.
 *
 * Domain: a small HTTP pipeline (request → enrich → transform → sink).
 */

import { useState, type CSSProperties, type ReactNode } from "react";

import type { NodeDefinitionInput } from "@nodera/sdk";

/* ------------------------------------------------------------------ */
/*  Stable identifiers                                                 */
/* ------------------------------------------------------------------ */

/** HTTP source node type. The SDK uses a node type as its renderer id. */
export const HTTP_REQUEST_NODE_TYPE = "demo.http.request";

/** Lookup/enrichment node type. */
export const ENRICH_NODE_TYPE = "demo.data.enrich";

/** Transformation node type. */
export const TRANSFORM_NODE_TYPE = "demo.data.transform";

/** Sink node type. */
export const SINK_NODE_TYPE = "demo.data.sink";

/** Node type the demo plugin contributes at install time. */
export const AUDIT_NODE_TYPE = "demo.monitor.audit";

/** Node type the host registers on the live builder, after composition. */
export const WEBHOOK_NODE_TYPE = "demo.output.webhook";

/* ------------------------------------------------------------------ */
/*  Renderer contracts the React binding calls these components with   */
/* ------------------------------------------------------------------ */

/**
 * Props of a node renderer, mirroring the binding's `NoderaNodeRendererProps`.
 *
 * The SDK keeps renderers opaque, so a host that may import only the SDK
 * declares the shape it consumes. Only the fields this demo reads are
 * declared; the binding passes more.
 */
interface DemoNodeRendererProps {
  readonly data: {
    readonly definitionId: string;
    readonly label: string;
    readonly properties: Readonly<Record<string, unknown>>;
  };
  readonly selected: boolean;
}

/**
 * Props of a property renderer, mirroring the binding's
 * `PropertyRendererProps`.
 */
interface DemoPropertyRendererProps {
  readonly definition: {
    readonly id: string;
    readonly label?: string;
    readonly description?: string;
  };
  readonly value: unknown;
  readonly issues: readonly { readonly message: string }[];
  readonly disabled: boolean;
  readonly onChange: (value: unknown) => void;
}

/* ------------------------------------------------------------------ */
/*  Small readers: values are `unknown` until checked                  */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Non-empty string property value, or `undefined`. */
function textOf(
  properties: Readonly<Record<string, unknown>>,
  id: string,
): string | undefined {
  const value = properties[id];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** Finite number property value, or `undefined`. */
function numberOf(
  properties: Readonly<Record<string, unknown>>,
  id: string,
): number | undefined {
  const value = properties[id];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Headers of the `custom` property, read as a string-to-string map. */
function readHeaders(value: unknown): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (!isRecord(value)) {
    return headers;
  }
  for (const [name, headerValue] of Object.entries(value)) {
    if (typeof headerValue === "string") {
      headers[name] = headerValue;
    }
  }
  return headers;
}

/* ------------------------------------------------------------------ */
/*  Custom node renderer                                               */
/* ------------------------------------------------------------------ */

const CARD_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
  boxSizing: "border-box",
  minWidth: "var(--ndr-node-min-width, 160px)",
  maxWidth: 260,
  padding: "var(--ndr-node-padding, 8px)",
  border: "1px solid var(--ndr-node-border-color, #c7d2e0)",
  borderLeftWidth: "3px",
  borderLeftColor: "var(--ndr-colors-accent, #2563eb)",
  borderRadius: "var(--ndr-node-radius, 5px)",
  background: "var(--ndr-node-background, #ffffff)",
  color: "var(--ndr-node-text-color, #111827)",
  fontFamily: "var(--ndr-typography-font-family, system-ui)",
  fontSize: "var(--ndr-node-font-size, 13px)",
  cursor: "inherit",
};

const CARD_SELECTED_STYLE: CSSProperties = {
  borderColor: "var(--ndr-node-border-color-selected, #2563eb)",
  outline:
    "var(--ndr-selection-outline-width, 2px) solid var(--ndr-selection-outline-color, #2563eb)",
  outlineOffset: "var(--ndr-selection-outline-offset, 1px)",
};

const CARD_HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-sm, 4px)",
};

const METHOD_BADGE_STYLE: CSSProperties = {
  padding: "0 var(--ndr-spacing-sm, 4px)",
  border: "1px solid var(--ndr-colors-accent, #2563eb)",
  borderRadius: "var(--ndr-borders-radius-sm, 3px)",
  color: "var(--ndr-colors-accent, #2563eb)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  fontWeight: "var(--ndr-typography-font-weight-bold, 600)",
  letterSpacing: "0.04em",
};

const CARD_TITLE_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: "var(--ndr-node-label-font-weight, 600)",
};

const CARD_BODY_STYLE: CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--ndr-node-text-color-muted, #5b6472)",
  fontFamily: "var(--ndr-typography-font-family-mono, ui-monospace)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
};

/**
 * Custom node renderer of the HTTP source.
 *
 * It replaces the framework's default node body for one definition, because the
 * definition names it as its `renderer`. Ports are still drawn by the canvas
 * adapter for every renderer, so this component only owns the node body.
 */
export function HttpRequestNode(props: DemoNodeRendererProps): ReactNode {
  const method = textOf(props.data.properties, "method") ?? "GET";
  const url = textOf(props.data.properties, "url") ?? "No URL configured";
  const timeoutMs = numberOf(props.data.properties, "timeoutMs");
  const followRedirects = props.data.properties["followRedirects"] === true;

  return (
    <div
      data-demo-node-renderer="http-request"
      data-demo-node-type={props.data.definitionId}
      data-selected={props.selected ? "true" : "false"}
      style={{
        ...CARD_STYLE,
        ...(props.selected ? CARD_SELECTED_STYLE : {}),
      }}
    >
      <div style={CARD_HEADER_STYLE}>
        <span style={METHOD_BADGE_STYLE}>{method}</span>
        <span style={CARD_TITLE_STYLE}>{props.data.label}</span>
      </div>
      <div style={CARD_BODY_STYLE} title={url}>
        {url}
      </div>
      <div style={CARD_BODY_STYLE}>
        {[timeoutMs === undefined ? "default timeout" : `${timeoutMs} ms timeout`]
          .concat(followRedirects ? ["follows redirects"] : ["no redirects"])
          .join(" · ")}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Custom property renderer                                           */
/* ------------------------------------------------------------------ */

const FIELD_WRAPPER_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
};

const FIELD_LABEL_STYLE: CSSProperties = {
  color: "var(--ndr-colors-text-muted, #5b6472)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  fontWeight: "var(--ndr-typography-font-weight-bold, 600)",
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-sm, 4px)",
};

const INPUT_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: "2px 4px",
  border: "1px solid var(--ndr-colors-border, #d8dee9)",
  borderRadius: "var(--ndr-borders-radius-sm, 3px)",
  background: "var(--ndr-colors-surface, #ffffff)",
  color: "var(--ndr-colors-text, #111827)",
  fontFamily: "var(--ndr-typography-font-family-mono, ui-monospace)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
};

const ROW_BUTTON_STYLE: CSSProperties = {
  padding: "1px 5px",
  border: "1px solid var(--ndr-colors-border, #d8dee9)",
  borderRadius: "var(--ndr-borders-radius-sm, 3px)",
  background: "transparent",
  color: "var(--ndr-colors-text-muted, #5b6472)",
  font: "inherit",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  cursor: "pointer",
};

const ISSUE_STYLE: CSSProperties = {
  color: "var(--ndr-colors-danger, #dc2626)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
};

/**
 * Custom renderer of the HTTP `headers` property.
 *
 * The property is declared with `type: "custom"` and this component as its
 * opaque `component` value, so the properties panel keeps owning ordering,
 * grouping, visibility and validation while the control is entirely the
 * host's. The value contract (a string-to-string map) is this demo's, not the
 * framework's: a `custom` property is opaque to the property system too.
 */
export function HeadersPropertyEditor(props: DemoPropertyRendererProps): ReactNode {
  const [draftName, setDraftName] = useState("");
  const [draftValue, setDraftValue] = useState("");

  const headers = readHeaders(props.value);
  const entries = Object.entries(headers);
  const label = props.definition.label ?? props.definition.id;
  const canAdd = draftName.trim().length > 0 && !props.disabled;

  const remove = (name: string): void => {
    const next: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (key !== name) {
        next[key] = value;
      }
    }
    props.onChange(next);
  };

  const add = (): void => {
    if (!canAdd) {
      return;
    }
    props.onChange({ ...headers, [draftName.trim()]: draftValue });
    setDraftName("");
    setDraftValue("");
  };

  return (
    <div data-demo-property-renderer="headers" style={FIELD_WRAPPER_STYLE}>
      <span style={FIELD_LABEL_STYLE}>
        {label} · host renderer
      </span>
      {entries.length === 0 ? (
        <span style={FIELD_LABEL_STYLE}>No header yet</span>
      ) : (
        entries.map(([name, value]) => (
          <div key={name} style={ROW_STYLE}>
            <span style={{ ...INPUT_STYLE, flex: "0 0 auto", border: "none" }}>{name}</span>
            <span style={INPUT_STYLE} title={value}>
              {value}
            </span>
            <button
              type="button"
              style={ROW_BUTTON_STYLE}
              aria-label={`Remove header ${name}`}
              disabled={props.disabled}
              onClick={() => {
                remove(name);
              }}
            >
              ✕
            </button>
          </div>
        ))
      )}
      <div style={ROW_STYLE}>
        <input
          style={INPUT_STYLE}
          aria-label="New header name"
          placeholder="Header name"
          value={draftName}
          disabled={props.disabled}
          onChange={(event) => {
            setDraftName(event.target.value);
          }}
        />
        <input
          style={INPUT_STYLE}
          aria-label="New header value"
          placeholder="Header value"
          value={draftValue}
          disabled={props.disabled}
          onChange={(event) => {
            setDraftValue(event.target.value);
          }}
        />
        <button
          type="button"
          style={ROW_BUTTON_STYLE}
          aria-label="Add header"
          disabled={!canAdd}
          onClick={add}
        >
          Add
        </button>
      </div>
      {props.issues.length === 0 ? null : (
        <span role="alert" style={ISSUE_STYLE}>
          {props.issues.map((issue) => issue.message).join(" ")}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Definitions                                                        */
/* ------------------------------------------------------------------ */

/**
 * Node definitions the demo declares in the builder configuration.
 *
 * Between them they declare input and output ports, the four scalar property
 * types the demo shows in the inspector (`string`, `number`, `select` with
 * string options, `boolean`), one `custom` property carrying a host component,
 * and one custom node renderer. A fifth definition (`WEBHOOK_NODE`) and the
 * plugin's own node are registered on the live builder.
 */
export const DEMO_NODES: readonly NodeDefinitionInput[] = [
  {
    type: HTTP_REQUEST_NODE_TYPE,
    version: "1.0.0",
    label: "HTTP request",
    description: "Calls an HTTP endpoint and emits its response.",
    category: "Sources",
    icon: "🌐",
    ports: {
      outputs: [{ id: "response", name: "Records", dataType: "records" }],
    },
    properties: [
      {
        id: "url",
        type: "string",
        label: "URL",
        description: "Endpoint the demo calls when the graph is executed elsewhere.",
        required: true,
        order: 0,
        defaultValue: "https://api.example.com/orders",
      },
      {
        id: "method",
        type: "select",
        label: "Method",
        required: true,
        order: 1,
        defaultValue: "GET",
        options: ["GET", "POST", "PUT", "DELETE"],
      },
      {
        id: "timeoutMs",
        type: "number",
        label: "Timeout (ms)",
        order: 2,
        defaultValue: 5000,
      },
      {
        id: "followRedirects",
        type: "boolean",
        label: "Follow redirects",
        order: 3,
        defaultValue: true,
      },
      {
        id: "headers",
        type: "custom",
        label: "Request headers",
        description: "Edited by the host's own key/value component.",
        order: 4,
        defaultValue: { Accept: "application/json" },
        component: HeadersPropertyEditor,
      },
    ],
    renderer: HttpRequestNode,
  },
  {
    type: ENRICH_NODE_TYPE,
    version: "1.0.0",
    label: "Enrich",
    description: "Merges a lookup result into every incoming record.",
    category: "Processing",
    icon: "🧩",
    ports: {
      inputs: [{ id: "in", name: "In", dataType: "records", required: true }],
      outputs: [{ id: "out", name: "Out", dataType: "records" }],
    },
    properties: [
      {
        id: "lookupUrl",
        type: "string",
        label: "Lookup URL",
        required: true,
        order: 0,
        defaultValue: "https://api.example.com/customers",
      },
      {
        id: "strategy",
        type: "select",
        label: "Merge strategy",
        order: 1,
        defaultValue: "merge",
        options: ["merge", "replace", "keep-left"],
      },
      {
        id: "cacheTtlMinutes",
        type: "number",
        label: "Cache TTL (minutes)",
        order: 2,
        defaultValue: 15,
      },
      {
        id: "deterministic",
        type: "boolean",
        label: "Deterministic order",
        order: 3,
        defaultValue: false,
      },
    ],
  },
  {
    type: TRANSFORM_NODE_TYPE,
    version: "1.0.0",
    label: "Transform",
    description: "Filters the incoming records with an expression.",
    category: "Processing",
    icon: "🔎",
    ports: {
      inputs: [{ id: "in", name: "In", dataType: "records", required: true }],
      outputs: [{ id: "out", name: "Out", dataType: "records" }],
    },
    properties: [
      {
        id: "expression",
        type: "string",
        label: "Expression",
        required: true,
        order: 0,
        defaultValue: "order.total > 100",
      },
      {
        id: "mode",
        type: "select",
        label: "Mode",
        order: 1,
        defaultValue: "keep-matching",
        options: ["keep-matching", "drop-matching"],
      },
      {
        id: "maxRows",
        type: "number",
        label: "Maximum rows",
        order: 2,
        defaultValue: 1000,
      },
      {
        id: "failOnError",
        type: "boolean",
        label: "Fail on expression error",
        order: 3,
        defaultValue: false,
      },
    ],
  },
  {
    type: SINK_NODE_TYPE,
    version: "1.0.0",
    label: "Sink",
    description: "Writes every incoming record to the selected target.",
    category: "Destinations",
    icon: "📥",
    ports: {
      inputs: [{ id: "in", name: "In", dataType: "records", required: true }],
    },
    properties: [
      {
        id: "target",
        type: "select",
        label: "Target",
        required: true,
        order: 0,
        defaultValue: "stdout",
        options: ["stdout", "file", "http"],
      },
      {
        id: "prettyPrint",
        type: "boolean",
        label: "Pretty print",
        order: 1,
        defaultValue: true,
      },
    ],
  },
];

/**
 * Node definition the host adds to the live builder with
 * `builder.registerNode`.
 *
 * Same contract, same validation and same renderer binding as a definition
 * declared in the configuration: the SDK has one authoring path, and this is
 * the entry point a host uses when its vocabulary is not known up front.
 */
export const WEBHOOK_NODE: NodeDefinitionInput = {
  type: WEBHOOK_NODE_TYPE,
  version: "1.0.0",
  label: "Webhook sink",
  description: "Posts every incoming record to a webhook (added at runtime).",
  category: "Destinations",
  icon: "📡",
  ports: {
    inputs: [{ id: "in", name: "In", dataType: "records" }],
  },
  properties: [
    {
      id: "endpoint",
      type: "string",
      label: "Endpoint",
      required: true,
      order: 0,
      defaultValue: "https://hooks.example.com/nodera",
    },
    {
      id: "batchSize",
      type: "number",
      label: "Batch size",
      order: 1,
      defaultValue: 25,
    },
    {
      id: "verifyTls",
      type: "boolean",
      label: "Verify TLS certificates",
      order: 2,
      defaultValue: true,
    },
  ],
};

/**
 * Node definition the demo plugin contributes.
 *
 * It lives next to the host's own definitions because it is authored with the
 * same public contract; the plugin is what makes it a *plugin* contribution.
 */
export const AUDIT_NODE: NodeDefinitionInput = {
  type: AUDIT_NODE_TYPE,
  version: "1.0.0",
  label: "Audit log",
  description: "Records every event that reaches it (contributed by a plugin).",
  category: "Observability",
  icon: "🧾",
  ports: {
    inputs: [{ id: "in", name: "In", dataType: "records" }],
    outputs: [{ id: "out", name: "Out", dataType: "records" }],
  },
  properties: [
    {
      id: "label",
      type: "string",
      label: "Audit label",
      order: 0,
      defaultValue: "phase6",
    },
    {
      id: "includePayload",
      type: "boolean",
      label: "Include payload",
      order: 1,
      defaultValue: false,
    },
  ],
};
