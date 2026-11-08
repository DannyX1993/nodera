/**
 * Host-authored renderers of the Phase 5 demo (S3 Level 2).
 *
 * Nothing here is framework code: the demo host replaces a panel renderer, a
 * property renderer and the menu presentation with its own markup, and
 * contributes a custom port renderer to the canvas adapter's registry. That is
 * exactly the customization contract — the definitions keep their stable
 * renderer ids, and the host decides which component an id resolves to.
 */

import type { ReactNode } from "react";
import { useRef } from "react";

import { addNode } from "@nodera/application";
import {
  DEFAULT_PORT_RENDERER_ID,
  PortHandle,
  PortRendererRegistry,
  type NoderaPortRendererProps,
} from "@nodera/react-flow";
// React Flow lives in the host application here, never in a `@nodera/*` package:
// a port *is* a canvas connection point, so a custom port renderer has to draw a
// React Flow `Handle`. The adapter re-exports its own registries and prop
// contracts, but not React Flow itself (AGENTS.md §4.1).
import { Handle, Position } from "@xyflow/react";
import { isToolAvailable } from "@nodera/ui-core";
import {
  NodePalette,
  ValidationPanel,
  useEditorEngine,
  type MenuRendererProps,
  type PanelRendererProps,
  type PropertyRendererProps,
} from "@nodera/ui-react";

import { BADGE_PORT_RENDERER_ID, TABLE_SINK_DEFINITION } from "./definitions.js";

/** Renderer id of the built-in node palette panel renderer. */
export const PALETTE_RENDERER_ID = "nodera.panel.palette";

/** Renderer id of the built-in validation panel renderer. */
export const VALIDATION_RENDERER_ID = "nodera.panel.validation";

/* ------------------------------------------------------------------ */
/*  Level 2: panel renderer replacement                                */
/* ------------------------------------------------------------------ */

/** Built-in palette panel renderer, kept so the demo can toggle back. */
export function DefaultPalettePanel(_props: PanelRendererProps): ReactNode {
  return <NodePalette />;
}

/**
 * Brand palette.
 *
 * A completely different discovery surface: the host groups the definitions its
 * own way, renders its own cards and places the nodes where it wants (S2: "La
 * aplicación host debe decidir"). The framework palette is not used at all.
 */
export function BrandPalette(_props: PanelRendererProps): ReactNode {
  const editor = useEditorEngine();
  const added = useRef(0);
  const definitions = editor.domain.nodes.all();

  const add = (definitionId: string): void => {
    added.current += 1;
    const index = added.current;
    const result = addNode(editor, {
      definitionId,
      position: { x: 120 + index * 40, y: 320 + index * 30 },
    });
    if (!result.ok) {
      console.error(result.error.message);
    }
  };

  return (
    <div data-demo-brand-palette="" className="demo-brand-palette">
      <h4>Brand catalogue</h4>
      {definitions.map((definition) => (
        <div key={definition.id} className="demo-brand-card" data-demo-brand-card={definition.id}>
          <span>
            {definition.icon ?? "•"} {definition.name}
          </span>
          <button
            type="button"
            className="demo-button"
            aria-label={`Add ${definition.name}`}
            onClick={() => {
              add(definition.id);
            }}
          >
            + Add
          </button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Level 2: menu renderer replacement                                 */
/* ------------------------------------------------------------------ */

/**
 * Brand menu.
 *
 * The menu *content* is still the framework's: `items` is the tool list the
 * registry produced for the open target, and `availability` is the live editor
 * facts the built-in path evaluates. Only the presentation is the host's — a
 * header row, its own item markup and a close button — which is exactly what
 * replacing a renderer means (S3 Level 2). Commands keep flowing through the
 * framework dispatcher, so undo, delete or panel placement exist once.
 *
 * Styles are inline and token-driven (`var(--ndr-*, fallback)`) like every other
 * Nodera surface, so the menu follows the active theme with no stylesheet.
 */
export function BrandMenu(props: MenuRendererProps): ReactNode {
  return (
    <div
      data-demo-brand-menu=""
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--ndr-spacing-xs, 2px)",
        minWidth: 180,
      }}
    >
      <div
        data-demo-brand-menu-header=""
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--ndr-spacing-sm, 4px)",
          padding: "0 var(--ndr-spacing-xs, 2px) var(--ndr-spacing-xs, 2px)",
          borderBottom: "var(--ndr-borders-width, 1px) solid var(--ndr-colors-border, #d8dee9)",
          color: "var(--ndr-colors-text-muted, #5b6472)",
          fontSize: "var(--ndr-typography-font-size-sm, 11px)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        <span>
          {props.kind === "context" ? "Context" : "Panel"} · {props.targetKind}
        </span>
        <button
          type="button"
          data-demo-brand-menu-close=""
          aria-label="Close menu"
          title="Close menu"
          onClick={props.onClose}
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "0 var(--ndr-spacing-xs, 2px)",
            color: "var(--ndr-colors-text-muted, #5b6472)",
          }}
        >
          ✕
        </button>
      </div>
      {props.items.length === 0 ? (
        <p
          data-demo-brand-menu-empty=""
          style={{
            margin: 0,
            padding: "var(--ndr-spacing-sm, 4px)",
            color: "var(--ndr-colors-text-muted, #5b6472)",
            fontSize: "var(--ndr-typography-font-size-sm, 11px)",
          }}
        >
          No actions for this target
        </p>
      ) : (
        props.items.map((tool) => {
          const enabled = isToolAvailable(tool, props.availability);
          return (
            <button
              key={tool.id}
              type="button"
              role="menuitem"
              data-demo-brand-menu-item={tool.id}
              disabled={!enabled}
              title={tool.description ?? tool.label}
              onClick={() => {
                props.onCommand(tool.command);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--ndr-spacing-xs, 2px)",
                width: "100%",
                padding: "var(--ndr-spacing-xs, 2px) var(--ndr-spacing-sm, 4px)",
                border: "var(--ndr-borders-width, 1px) solid var(--ndr-colors-border, #d8dee9)",
                borderRadius: "var(--ndr-borders-radius-md, 5px)",
                background: "transparent",
                color: enabled
                  ? "var(--ndr-colors-text, #111827)"
                  : "var(--ndr-colors-text-muted, #5b6472)",
                font: "inherit",
                textAlign: "start",
                cursor: enabled ? "pointer" : "default",
                opacity: enabled ? 1 : 0.6,
              }}
            >
              <span aria-hidden="true">{tool.icon ?? "›"}</span>
              <span>{tool.label}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Level 2: property renderer replacement                             */
/* ------------------------------------------------------------------ */

/**
 * Brand editor of `string` properties.
 *
 * A monospace, accent-bordered field with the definition's own label: the panel
 * keeps all of its logic (ordering, grouping, visibility, validation) and only
 * the control is replaced, which is what "Sustituir completamente ... Property
 * Renderer" means.
 */
export function BrandStringField(props: PropertyRendererProps): ReactNode {
  const label = props.definition.label ?? props.definition.id;
  return (
    <label className="demo-field" data-demo-brand-field={props.definition.id}>
      <span>
        {label} <span aria-hidden="true">#host-renderer</span>
      </span>
      <input
        type="text"
        aria-label={label}
        value={typeof props.value === "string" ? props.value : ""}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
      {props.issues.length === 0 ? null : (
        <span role="alert" style={{ color: "var(--ndr-colors-danger, #dc2626)", fontSize: 11 }}>
          {props.issues[0]?.message ?? "Invalid value"}
        </span>
      )}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*  Level 3: host composition of a panel                               */
/* ------------------------------------------------------------------ */

/**
 * Host-composed validation panel.
 *
 * The host wraps the framework panel to add an action of its own: the button
 * adds a sink node whose required property is unfilled, so the auto-validating
 * report has something to show. The panel itself is untouched.
 */
export function DemoValidationPanel(_props: PanelRendererProps): ReactNode {
  const editor = useEditorEngine();
  const broken = useRef(0);

  const breakGraph = (): void => {
    broken.current += 1;
    const result = addNode(editor, {
      definitionId: TABLE_SINK_DEFINITION.id,
      position: { x: 640, y: 60 + broken.current * 90 },
      // The required `table` property is deliberately left unset.
      properties: {},
    });
    if (!result.ok) {
      console.error(result.error.message);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <ValidationPanel autoValidate />
      <button type="button" className="demo-break" onClick={breakGraph}>
        Break the graph
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Level 2: port renderer replacement                                 */
/* ------------------------------------------------------------------ */

/**
 * Custom renderer of one port definition.
 *
 * It is registered in a `PortRendererRegistry` and selected by
 * `PortDeclaration.visual.renderer` on the definition, exactly like a node or
 * edge renderer id. The handle markup has to come from React Flow because a
 * port *is* a canvas connection point — that import is legal here because this
 * is a host application, and it stays outside every `@nodera/*` package.
 */
export function BadgePortRenderer(props: NoderaPortRendererProps): ReactNode {
  const isInput = props.direction === "input";
  return (
    <Handle
      id={props.portId}
      type={isInput ? "target" : "source"}
      position={isInput ? Position.Left : Position.Right}
      aria-label={props.name ?? props.portId}
      title={props.name ?? props.portId}
      data-nodera-port-id={props.portId}
      data-demo-port-renderer={BADGE_PORT_RENDERER_ID}
      style={{
        width: 12,
        height: 12,
        borderRadius: 3,
        background: "var(--ndr-colors-accent, #2563eb)",
        border: "2px solid var(--ndr-colors-surface, #ffffff)",
      }}
    />
  );
}

/**
 * Port renderer registry of the canvas.
 *
 * The default id is registered with the framework handle so ports that declare
 * no renderer keep the standard look, and the badge id is registered for the one
 * definition that asks for it.
 */
export function createDemoPortRenderers(): PortRendererRegistry {
  const registry = new PortRendererRegistry();
  registry.register(DEFAULT_PORT_RENDERER_ID, PortHandle);
  registry.register(BADGE_PORT_RENDERER_ID, BadgePortRenderer);
  return registry;
}
