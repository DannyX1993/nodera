import {
  createElement,
  Fragment,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type FC,
  type ComponentType,
  type ReactNode,
  type MouseEvent,
  type DragEvent as ReactDragEvent,
} from "react";

import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ConnectionMode,
  EdgeLabelRenderer,
  Handle,
  Position,
  ViewportPortal,
  type NodeChange,
  type EdgeChange,
  type EdgeProps,
  type Connection,
  type IsValidConnection,
  type Edge as RfEdge,
  type Node as RfNode,
  type XYPosition,
  type NodeTypes,
  type EdgeTypes,
  type OnNodeDrag,
  type ReactFlowInstance,
} from "@xyflow/react";

import type { EditorEngine } from "@nodera/application";
import type {
  ConnectionsPolicy,
  DragPolicy,
  InsertHandlesPolicy,
  PortsPolicy,
} from "@nodera/ui-core";
import { NODERA_CREATE_NODE_DIALOG_ID } from "@nodera/ui-core";
import { useEdgeInsertActions, useNoderaUi } from "@nodera/ui-react";
import {
  moveNode,
  createEdge,
  clearSelection,
  removeNode,
  removeEdge,
  selectNode,
  selectEdge,
  selectMultiple,
  validateConnection as validateConnectionUseCase,
} from "@nodera/application";

import { useEditorGraph } from "./use-editor-graph.js";
import { useNodeTypes } from "./custom-node.js";
import { isNodeDefinitionDrag, nodeDefinitionFromDataTransfer } from "./definition-drop.js";
import {
  DEFAULT_EDGE_RENDERER_ID,
  DEFAULT_NODE_RENDERER_ID,
  DEFAULT_PORT_RENDERER_ID,
  PortRendererRegistry,
} from "../registries/renderer-registries.js";
import {
  nodePositionFromReactFlow,
  connectionFromReactFlow,
  removedIdsFromReactFlowChanges,
  applyMeasuredDimensions,
  hasNewDimensions,
} from "../map/react-flow-mapper.js";
import type {
  NodeRendererRegistry,
  EdgeRendererRegistry,
} from "../registries/renderer-registries.js";
import { DefaultEdgeRenderer } from "../renderers/default-edge-renderer.js";
import type {
  NoderaNodeData,
  NoderaNodeRendererProps,
  NoderaPortRendererProps,
} from "../renderers/node-renderer-props.js";
import { canvasInteractionSettings, type CanvasInteractionMode } from "./interaction-mode.js";

/* ------------------------------------------------------------------ */
/*  Canvas background (token contract)                                 */
/* ------------------------------------------------------------------ */

/**
 * Gap between background dots, in flow units.
 *
 * The theme contract publishes `canvas.backgroundDotSize` as a CSS *token
 * string* (`"16"`), but React Flow's `<Background gap>` is a **number** and a
 * CSS custom property can never feed a numeric React prop. The adapter
 * therefore owns this documented numeric default (the token's value): a host
 * that needs another gap renders its own `<Background />` or overrides the
 * pattern through CSS.
 */
const CANVAS_BACKGROUND_DOT_GAP = 16;

/**
 * Colour of the canvas background dots: the theme variable with a literal
 * fallback (D2), so an unthemed host still renders a visible pattern.
 */
const CANVAS_BACKGROUND_DOT_COLOR = "var(--ndr-canvas-background-dot, #cbd5e1)";

/** Props the canvas hands to React Flow's `<Background />`. */
export interface CanvasBackgroundOptions {
  readonly variant: BackgroundVariant;
  readonly gap: number;
  readonly color: string;
}

/**
 * Background pattern options derived from the theme token contract.
 *
 * Single source for what the canvas passes to `<Background />`: the dot colour
 * is a CSS variable reference (themeable without re-rendering React) and the
 * dot gap is the documented numeric default explained above.
 */
export function canvasBackgroundOptions(): CanvasBackgroundOptions {
  return {
    variant: BackgroundVariant.Dots,
    gap: CANVAS_BACKGROUND_DOT_GAP,
    color: CANVAS_BACKGROUND_DOT_COLOR,
  };
}

/* ------------------------------------------------------------------ */
/*  Edge types                                                         */
/* ------------------------------------------------------------------ */

/** Options that turn the edge insert affordance on.
 *
 * Passed to {@link canvasEdgeTypes}; the canvas supplies it from its
 * `edgeInsertion` / `renderEdgeInsert` props.
 */
export interface EdgeInsertRenderOptions {
  /**
   * Renders the "+" affordance of one edge.
   *
   * The canvas owns the position (the midpoint of the rendered edge) and the
   * activation plumbing; the renderer only decides what the control looks like.
   * The framework's default is {@link DefaultEdgeInsertButton}.
   */
  readonly render: (edgeId: string) => ReactNode;
}

/**
 * React Flow edge-type map built from an edge renderer registry.
 *
 * Every registered renderer id becomes an RF edge type, and the Nodera default
 * is always present under {@link DEFAULT_EDGE_RENDERER_ID}. A definition that
 * names an unregistered renderer id is absent from this map, so React Flow
 * falls back to its built-in default edge instead of blanking the graph.
 *
 * When `insert` is supplied every type is wrapped so it also renders that
 * affordance at its midpoint; without it the map keeps the registered
 * components untouched, so a canvas without the affordance renders exactly as
 * before.
 *
 * Casts stay confined to the adapter boundary: React Flow's `EdgeTypes` is a
 * `ComponentType<any>` map while Nodera renderers have stricter props.
 */
export function canvasEdgeTypes(
  edgeRenderers?: EdgeRendererRegistry,
  insert?: EdgeInsertRenderOptions,
): EdgeTypes {
  const types: EdgeTypes = {};
  if (edgeRenderers) {
    for (const id of edgeRenderers.listIds()) {
      try {
        // The registry stores a bare `ComponentType`; an edge renderer receives
        // React Flow's `EdgeProps`, which is what the wrapper passes through.
        types[id] = withEdgeInsert(
          edgeRenderers.get(id) as unknown as ComponentType<EdgeProps>,
          insert,
        ) as unknown as EdgeTypes[string];
      } catch {
        // Skip unresolvable registrations.
      }
    }
  }
  types[DEFAULT_EDGE_RENDERER_ID] = withEdgeInsert(
    DefaultEdgeRenderer,
    insert,
  ) as unknown as EdgeTypes[string];
  return types;
}

/* ------------------------------------------------------------------ */
/*  Edge insert affordance (S6)                                        */
/* ------------------------------------------------------------------ */

/** Accessible name of the framework's "+" button. */
export const EDGE_INSERT_LABEL = "Insert node";

/**
 * Style of the affordance button.
 *
 * Token-driven with literal fallbacks (AGENTS.md §15): a host themes it through
 * CSS custom properties and an unthemed graph still paints a visible target.
 */
const EDGE_INSERT_BUTTON_STYLE: CSSProperties = {
  pointerEvents: "all",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "var(--ndr-edge-insert-size, 20px)",
  height: "var(--ndr-edge-insert-size, 20px)",
  padding: 0,
  borderRadius: "999px",
  border: "var(--ndr-edge-insert-border, 1px solid #7c8896)",
  background: "var(--ndr-edge-insert-background, #ffffff)",
  color: "var(--ndr-edge-insert-color, #334155)",
  fontSize: "var(--ndr-edge-insert-font-size, 13px)",
  lineHeight: 1,
  cursor: "pointer",
};

/** Props accepted by {@link DefaultEdgeInsertButton}. */
export interface DefaultEdgeInsertButtonProps {
  /** Edge the insertion will replace. */
  readonly edgeId: string;
}

/**
 * The framework's "+" on an edge.
 *
 * A native `button`, so `Enter` and `Space` activate it and it takes part in the
 * tab order without a key handler of its own. Activation records the edge as a
 * pending insertion and opens the node-creation dialog through the UI store
 * (`useEdgeInsertActions`); it never mutates the graph and never decides where
 * the node lands. The click does not reach the canvas, so pressing "+" does not
 * also select the edge it belongs to.
 */
export function DefaultEdgeInsertButton(props: DefaultEdgeInsertButtonProps): ReactNode {
  const insert = useEdgeInsertActions();

  return (
    <button
      type="button"
      data-nodera-edge-insert=""
      aria-label={EDGE_INSERT_LABEL}
      aria-haspopup="dialog"
      style={EDGE_INSERT_BUTTON_STYLE}
      onClick={(event) => {
        event.stopPropagation();
        insert.begin(props.edgeId);
      }}
    >
      +
    </button>
  );
}

/**
 * Wraps an edge renderer so it also paints the insert affordance.
 *
 * React Flow hands every edge its two handle coordinates, so the midpoint is the
 * geometric middle of the rendered edge rather than a guess from node centres.
 * The label portal keeps the button outside the SVG path, which is what makes
 * it a real focusable control instead of an SVG element.
 */
function withEdgeInsert(
  renderer: ComponentType<EdgeProps>,
  insert: EdgeInsertRenderOptions | undefined,
): ComponentType<EdgeProps> {
  if (insert === undefined) {
    return renderer;
  }

  const EdgeWithInsert = (props: Record<string, unknown>): ReactNode => {
    const edgeId = typeof props.id === "string" ? props.id : String(props.id ?? "");
    const sourceX = typeof props.sourceX === "number" ? props.sourceX : 0;
    const sourceY = typeof props.sourceY === "number" ? props.sourceY : 0;
    const targetX = typeof props.targetX === "number" ? props.targetX : 0;
    const targetY = typeof props.targetY === "number" ? props.targetY : 0;
    return (
      <>
        {/* The props React Flow hands an edge component are `EdgeProps`; this
            wrapper only reads the id and the two handle coordinates. */}
        {createElement(renderer, props as unknown as EdgeProps)}
        <EdgeLabelRenderer>
          <div
            data-nodera-edge-insert-for={edgeId}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${String(
                (sourceX + targetX) / 2,
              )}px, ${String((sourceY + targetY) / 2)}px)`,
              pointerEvents: "none",
            }}
          >
            {insert.render(edgeId)}
          </div>
        </EdgeLabelRenderer>
      </>
    );
  };
  EdgeWithInsert.displayName = `NoderaEdgeInsert(${
    renderer.displayName ?? renderer.name ?? "edge"
  })`;
  return EdgeWithInsert;
}

/* ------------------------------------------------------------------ */
/*  Phantom placeholders (S7, S21): overlay, never graph elements      */
/* ------------------------------------------------------------------ */

/**
 * Axis a placeholder steps along.
 *
 * The host declares it (`GraphCanvas.layoutDirection`) because the canvas
 * adapter can read neither `graph.layout.direction` nor `graph.layout.spacing`:
 * both are SDK configuration, and presentation geometry is derived here.
 */
export type PlaceholderAxis = "horizontal" | "vertical";

/**
 * Distance between a node and the placeholder that follows it, in flow units.
 *
 * The canvas cannot see `graph.layout.spacing` (the placement rule lives in the
 * SDK, the geometry in `@nodera/graph-layout`), so the adapter owns this
 * documented numeric default — one visual step past the node, which is all a
 * placeholder needs.
 */
const PHANTOM_NODE_OFFSET = 240;

/**
 * Shortest connector the overlay ever draws, in flow units.
 *
 * The connector spans the gap between a node's far edge and the placeholder that
 * follows it, so it is `step - nodeSize` long. A node wider (or taller) than one
 * step would collapse that gap to zero and leave two boxes touching with no line
 * joining them, so the step grows instead of the connector shrinking away.
 */
const PHANTOM_CONNECTOR_MIN_LENGTH = 24;

/**
 * Box of a node React Flow has not measured yet, in flow units.
 *
 * A real node is measured by React Flow before anyone sees it; this is only the
 * fallback for the first paint (and for a headless renderer), and it matches the
 * `--ndr-node-min-width` / `--ndr-node-min-height` token defaults so the
 * connector starts where the painted node ends.
 */
const PLACEHOLDER_NODE_SIZE = { width: 140, height: 40 } as const;

/**
 * Style of a placeholder box.
 *
 * Inactive is expressed by the **dashed border** and the muted palette, never by
 * colour alone (AGENTS.md §15), and every value is a token with a literal
 * fallback so a themed host restyles it without re-rendering.
 */
const PHANTOM_NODE_STYLE: CSSProperties = {
  borderWidth: "var(--ndr-phantom-node-border-width, 1px)",
  borderStyle: "dashed",
  borderColor: "var(--ndr-phantom-node-border-color, #b6c2cf)",
  backgroundColor: "transparent",
  borderRadius: "var(--ndr-node-radius, 5px)",
  padding: "var(--ndr-node-padding, 8px)",
  color: "var(--ndr-phantom-node-text-color, #8a97a5)",
  fontSize: "var(--ndr-node-font-size, 13px)",
  minWidth: "var(--ndr-node-min-width, 140px)",
  minHeight: "var(--ndr-node-min-height, 40px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  opacity: "var(--ndr-phantom-opacity, 0.75)",
  // Only the "+" takes the pointer, so the box never hit-tests a real element
  // underneath it.
  pointerEvents: "none",
};

/**
 * Thickness of a placeholder connector, as a **CSS length**.
 *
 * Deliberately not `--ndr-edge-stroke-width`: that token is the theme's SVG
 * `stroke-width` and its value is a unitless number (`"1.5"`, see the theme
 * presets). A unitless number in a CSS `border` width is an invalid
 * declaration, so the whole `border-top` was dropped at computed-value time and
 * the connector painted nothing in a themed host — while its box still existed
 * and positioned the `"+"` on the line that should have been drawn. Any host CSS
 * that defines `--ndr-edge-stroke-width` reproduced the defect; the test suite
 * never saw it because jsdom applies no theme, so only the `px` fallback was in
 * play. The connector therefore owns its own length-bearing token.
 */
const PLACEHOLDER_CONNECTOR_WIDTH = "var(--ndr-phantom-edge-width, 1.5px)";

/** Colour of a placeholder connector, muted like the box it leads to. */
const PLACEHOLDER_CONNECTOR_COLOR = "var(--ndr-phantom-edge-color, #b6c2cf)";

/**
 * Stacking of the overlay shapes, above React Flow's node layer.
 *
 * The node layer (`.react-flow__nodes`) carries no `z-index` of its own, while a
 * node React Flow selects does; declaring one here keeps the dashed shapes on
 * top of the layer instead of relying on the portal's DOM position alone.
 */
const PLACEHOLDER_Z_INDEX = "var(--ndr-phantom-z-index, 1)";

/** A box in flow coordinates: the placeholder itself, or its connector. */
export interface PlaceholderBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The dashed connector from a node to the placeholder that follows it. */
export interface PlaceholderConnector {
  /** Flow coordinate the connector starts at (the node's far edge). */
  readonly x: number;
  readonly y: number;
  /** Length along the axis; the connector is 1 px thick across it. */
  readonly length: number;
  readonly axis: PlaceholderAxis;
}

/**
 * Whether the placeholder stands for the empty state (S7) or one leaf's
 * successor (S21).
 *
 * It is a presentation label only: both open the same dialog and record the same
 * anchor, so the host needs one branch, not two.
 */
export type PlaceholderKind = "empty-state" | "successor";

/** One dashed placeholder, in flow coordinates. Never a node or an edge. */
export interface PhantomPlaceholder {
  /** Node the new node follows; `undefined` while the graph is still empty. */
  readonly anchorId: string | undefined;
  readonly kind: PlaceholderKind;
  readonly box: PlaceholderBox;
  /** Absent for the empty graph: there is no node to connect from. */
  readonly connector: PlaceholderConnector | undefined;
}

/** One node as the placeholder derivation reads it (presentation data only). */
export interface PlaceholderNodeInput {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
  /** Measured width, when React Flow has measured the node. */
  readonly width?: number | undefined;
  /** Measured height, when React Flow has measured the node. */
  readonly height?: number | undefined;
  /** Ports of the node, as its renderer data carries them. */
  readonly ports?: ReadonlyArray<{ readonly direction: "input" | "output" | "bidirectional" }> | undefined;
}

/** What {@link canvasPlaceholders} needs to derive the placeholders. */
export interface CanvasPlaceholderInput {
  /** The `edgeInsertion` flag: off means the canvas paints none of them. */
  readonly enabled: boolean;
  /** Axis the host declares; defaults to `"horizontal"`. */
  readonly axis?: PlaceholderAxis | undefined;
  readonly nodes: readonly PlaceholderNodeInput[];
  /** Edges of the document, read to tell a leaf from a node with a successor. */
  readonly edges: ReadonlyArray<{ readonly source: string; readonly target: string }>;
}

/**
 * Whether an outgoing edge may start at a node.
 *
 * A port pointing at the graph (`output`/`bidirectional`) is what the insertion
 * needs; a node with only inputs can never be continued, so the affordance stays
 * away instead of promising an insertion the graph cannot perform.
 */
function sourceCapable(node: PlaceholderNodeInput): boolean {
  return (node.ports ?? []).some(
    (port) => port.direction === "output" || port.direction === "bidirectional",
  );
}

/** One placeholder one step past `node` along `axis`. */
function placeholderAfter(
  anchorId: string,
  kind: PlaceholderKind,
  node: PlaceholderNodeInput,
  axis: PlaceholderAxis,
): PhantomPlaceholder {
  const width = node.width ?? PLACEHOLDER_NODE_SIZE.width;
  const height = node.height ?? PLACEHOLDER_NODE_SIZE.height;
  const { x, y } = node.position;

  // One step past the node, but never so short that the connector disappears.
  if (axis === "vertical") {
    const step = Math.max(PHANTOM_NODE_OFFSET, height + PHANTOM_CONNECTOR_MIN_LENGTH);
    return {
      anchorId,
      kind,
      box: { x, y: y + step, width, height },
      connector: {
        x: x + width / 2,
        y: y + height,
        length: step - height,
        axis,
      },
    };
  }

  const step = Math.max(PHANTOM_NODE_OFFSET, width + PHANTOM_CONNECTOR_MIN_LENGTH);
  return {
    anchorId,
    kind,
    box: { x: x + step, y, width, height },
    connector: {
      x: x + width,
      y: y + height / 2,
      length: step - width,
      axis,
    },
  };
}

/**
 * Derives every placeholder the canvas draws, in flow coordinates.
 *
 * Two states, one derivation, so a single node can never carry two placeholders
 * for itself:
 *
 * - the **empty state** (S7): with no node at all, the placeholder sits at the
 *   origin and has no connector; with exactly one node it sits one step past it
 *   and a dashed connector joins the two;
 * - the **successor placeholders** (S21): from two nodes on, every node with no
 *   outgoing edge *and* a source-capable port gets one — a leaf is where the
 *   hierarchy ends, so a successor is unambiguous there. A leaf with no output
 *   port gets nothing.
 *
 * The result is geometry, not graph elements: the canvas paints it through
 * `ViewportPortal`, so nothing here can reach the React Flow `nodes` / `edges`
 * arrays, the document, an event or a history entry. The set is derived from the
 * edges on every render, so a placeholder disappears in the same commit that
 * gives its node a successor and nothing has to be cleaned up.
 */
export function canvasPlaceholders(
  input: CanvasPlaceholderInput,
): readonly PhantomPlaceholder[] {
  if (!input.enabled) {
    return [];
  }

  const axis = input.axis ?? "horizontal";
  const anchor = input.nodes[0];

  if (input.nodes.length === 0) {
    const { width, height } = PLACEHOLDER_NODE_SIZE;
    return [{ anchorId: undefined, kind: "empty-state", box: { x: 0, y: 0, width, height }, connector: undefined }];
  }

  if (input.nodes.length === 1 && anchor !== undefined) {
    return [placeholderAfter(anchor.id, "empty-state", anchor, axis)];
  }

  const hasSuccessor = new Set(input.edges.map((edge) => edge.source));
  return input.nodes
    .filter((node) => !hasSuccessor.has(node.id) && sourceCapable(node))
    .map((node) => placeholderAfter(node.id, "successor", node, axis));
}

/**
 * The phantom `"+"`: records the append anchor and opens the node-creation
 * dialog.
 *
 * `anchorId` is the node the new node follows, or `undefined` for an empty graph
 * — the value the host passes as `addNode({ after })`. The session is written to
 * the UI store as presentation state (never to the document), and a pending
 * edge insertion of another affordance is cleared first so this pick can never
 * be read as an insertion. A store without a dialog registry opens nothing, so
 * no session is recorded for a dialog that will not appear.
 */
function PhantomInsertButton(props: { readonly anchorId: string | undefined }): ReactNode {
  const { store } = useNoderaUi();

  return (
    <button
      type="button"
      data-nodera-phantom-insert=""
      data-nodera-phantom-insert-for={props.anchorId ?? ""}
      aria-label={EDGE_INSERT_LABEL}
      aria-haspopup="dialog"
      style={EDGE_INSERT_BUTTON_STYLE}
      onClick={(event) => {
        event.stopPropagation();
        const opened = store.openDialog(NODERA_CREATE_NODE_DIALOG_ID);
        if (!opened.ok) {
          return;
        }
        store.setPendingEdgeInsertId(undefined);
        store.setPendingAppendAnchorId(props.anchorId);
      }}
    >
      +
    </button>
  );
}

/** The dashed connector from a node to the placeholder that follows it. */
function PlaceholderConnectorView(props: {
  readonly connector: PlaceholderConnector;
}): ReactNode {
  const { connector } = props;
  // Longhands, not the `border-top`/`border-left` shorthand: each edge is then a
  // declaration of its own, so an unreadable token can never discard the style
  // and the thickness is a CSS length like any other border.
  const across: CSSProperties =
    connector.axis === "horizontal"
      ? {
          width: connector.length,
          height: 0,
          borderTopWidth: PLACEHOLDER_CONNECTOR_WIDTH,
          borderTopStyle: "dashed",
          borderTopColor: PLACEHOLDER_CONNECTOR_COLOR,
        }
      : {
          width: 0,
          height: connector.length,
          borderLeftWidth: PLACEHOLDER_CONNECTOR_WIDTH,
          borderLeftStyle: "dashed",
          borderLeftColor: PLACEHOLDER_CONNECTOR_COLOR,
        };

  return (
    <div
      data-nodera-phantom-edge={connector.axis}
      aria-hidden="true"
      style={{
        position: "absolute",
        zIndex: PLACEHOLDER_Z_INDEX,
        transform: `translate(${String(connector.x)}px, ${String(connector.y)}px)`,
        pointerEvents: "none",
        ...across,
      }}
    />
  );
}

/** Key of the placeholder that follows no node (the empty graph). */
const EMPTY_GRAPH_KEY = "nodera.phantom.empty";

/**
 * The placeholder overlay: dashed boxes (S7, S21) drawn inside the viewport.
 *
 * `<ViewportPortal>` puts the boxes in the viewport's transform layer, so they
 * share the nodes' coordinate system and pan and zoom with them, while staying
 * out of React Flow's `nodes` and `edges` arrays. That separation is the whole
 * point: a placeholder appended to either array is a graph element as far as
 * React Flow is concerned, and a node entry without port handles silently empties
 * the edge layer — every real edge disappears. An overlay cannot do that.
 *
 * Each placeholder is a dashed box joined to its anchor by a dashed connector,
 * and the `"+"` sits **inside** the box, centred by the box's own flex layout —
 * one control in one place, whether or not there is a connector (the empty graph
 * has none), instead of hanging on the connector's midpoint.
 *
 * Nothing here is selectable, draggable, deletable or connectable, because
 * nothing here is an element React Flow manages: the boxes are plain `div`s with
 * `pointer-events: none`, and only the `"+"` takes the pointer.
 */
export const CanvasPlaceholderOverlay: FC<{
  readonly placeholders: readonly PhantomPlaceholder[];
}> = ({ placeholders }) => {
  if (placeholders.length === 0) {
    return null;
  }

  return (
    <ViewportPortal>
      {placeholders.map((placeholder) => (
        <Fragment key={placeholder.anchorId ?? EMPTY_GRAPH_KEY}>
          {placeholder.connector === undefined ? null : (
            <PlaceholderConnectorView connector={placeholder.connector} />
          )}
          <div
            data-nodera-phantom-node="inactive"
            data-nodera-phantom-kind={placeholder.kind}
            data-nodera-phantom-for={placeholder.anchorId ?? ""}
            className="nodera-phantom-node"
            style={{
              ...PHANTOM_NODE_STYLE,
              position: "absolute",
              zIndex: PLACEHOLDER_Z_INDEX,
              width: placeholder.box.width,
              height: placeholder.box.height,
              transform: `translate(${String(placeholder.box.x)}px, ${String(
                placeholder.box.y,
              )}px)`,
            }}
          >
            <PhantomInsertButton anchorId={placeholder.anchorId} />
          </div>
        </Fragment>
      ))}
    </ViewportPortal>
  );
};

/* ------------------------------------------------------------------ */
/*  Insert-handle placement (S23): the branching "+", also an overlay  */
/* ------------------------------------------------------------------ */

/** Accessible name of the framework's branching "+" button. */
export const BRANCH_INSERT_LABEL = "Insert node before the branches";

/** One branching affordance, in flow coordinates. Never a node or an edge. */
export interface BranchHandle {
  /** Parent whose split the insertion replaces. */
  readonly nodeId: string;
  readonly x: number;
  readonly y: number;
}

/** What {@link canvasBranchHandles} needs to derive the branching handles. */
export interface CanvasBranchHandleInput {
  /** The `edgeInsertion` flag: off means the canvas paints none of them. */
  readonly enabled: boolean;
  /** `graph.layout.insertHandles`, reflected in the UI state; defaults to `"each-edge"`. */
  readonly policy?: InsertHandlesPolicy | undefined;
  /** Axis the host declares; defaults to `"horizontal"`. */
  readonly axis?: PlaceholderAxis | undefined;
  readonly nodes: readonly PlaceholderNodeInput[];
  /** Edges of the document; two outgoing edges are what a split is. */
  readonly edges: ReadonlyArray<{ readonly source: string; readonly target: string }>;
}

/**
 * Whether a policy asks for the branching "+" at all.
 *
 * `"each-edge"` — the default — is today's behaviour and draws none of them.
 */
export function wantsBranchHandle(policy: InsertHandlesPolicy | undefined): boolean {
  return policy === "before-branching" || policy === "both";
}

/**
 * Ids of the nodes with two or more outgoing edges: the nodes with a split to
 * insert before.
 *
 * Two outgoing edges, not two distinct targets: a parallel relation to the same
 * successor is still a relation the insertion replaces, and counting targets
 * would hide one handle for a shape that needs it.
 */
export function branchingNodeIds(
  edges: ReadonlyArray<{ readonly source: string }>,
): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
  }
  const branching = new Set<string>();
  for (const [nodeId, count] of counts) {
    if (count >= 2) {
      branching.add(nodeId);
    }
  }
  return branching;
}

/**
 * Derives every branching "+" the canvas draws, in flow coordinates.
 *
 * One handle per parent with at least two outgoing edges, one documented step
 * past the node along the declared axis and centred on its row — i.e. on the
 * parent's outgoing side, before the edges split. Like the phantom placeholders
 * the result is geometry, not graph elements: the canvas paints it through
 * `ViewportPortal`, so it can never reach the React Flow `nodes` / `edges`
 * arrays, the document, an event or a history entry.
 */
export function canvasBranchHandles(
  input: CanvasBranchHandleInput,
): readonly BranchHandle[] {
  if (!input.enabled || !wantsBranchHandle(input.policy)) {
    return [];
  }
  const axis = input.axis ?? "horizontal";
  const branching = branchingNodeIds(input.edges);
  const handles: BranchHandle[] = [];
  for (const node of input.nodes) {
    if (!branching.has(node.id)) {
      continue;
    }
    const width = node.width ?? PLACEHOLDER_NODE_SIZE.width;
    const height = node.height ?? PLACEHOLDER_NODE_SIZE.height;
    const { x, y } = node.position;
    handles.push(
      axis === "vertical"
        ? { nodeId: node.id, x: x + width / 2, y: y + PHANTOM_NODE_OFFSET }
        : { nodeId: node.id, x: x + PHANTOM_NODE_OFFSET, y: y + height / 2 },
    );
  }
  return handles;
}

/** What {@link edgeOffersInsertHandle} needs to decide about one edge. */
export interface EdgeInsertPlacementInput {
  readonly policy?: InsertHandlesPolicy | undefined;
  /** Source node of the edge being asked about. */
  readonly sourceId: string;
  /** Nodes with two or more outgoing edges; see {@link branchingNodeIds}. */
  readonly branchNodeIds: ReadonlySet<string>;
}

/**
 * Whether one edge keeps its own "+" under the policy in effect.
 *
 * `"each-edge"` and `"both"` keep every per-edge handle. `"before-branching"`
 * draws one handle **instead of** the per-edge ones on a branching parent, and
 * leaves every other edge alone: a single-successor parent keeps the ordinary
 * affordance, because there is no split to put a handle before.
 */
export function edgeOffersInsertHandle(input: EdgeInsertPlacementInput): boolean {
  if (input.policy !== "before-branching") {
    return true;
  }
  return !input.branchNodeIds.has(input.sourceId);
}

/**
 * The framework's branching "+": records the parent the dialog branches from
 * and opens the node-creation dialog.
 *
 * A native `button`, so `Enter` and `Space` activate it and it takes part in the
 * tab order without a key handler of its own. Like the other affordances it
 * writes presentation state only — `UiState.pendingBranchInsertId` — and clears
 * the sessions of the other affordances first, so a pick can never be read as an
 * insertion into an edge or as an append after a node.
 */
export const DefaultBranchInsertButton: FC<{ readonly nodeId: string }> = ({ nodeId }) => {
  const { store } = useNoderaUi();

  return (
    <button
      type="button"
      data-nodera-branch-insert=""
      data-nodera-branch-insert-for={nodeId}
      aria-label={BRANCH_INSERT_LABEL}
      aria-haspopup="dialog"
      style={EDGE_INSERT_BUTTON_STYLE}
      onClick={(event) => {
        event.stopPropagation();
        const opened = store.openDialog(NODERA_CREATE_NODE_DIALOG_ID);
        if (!opened.ok) {
          return;
        }
        store.setPendingEdgeInsertId(undefined);
        store.setPendingAppendAnchorId(undefined);
        store.setPendingBranchInsertId(nodeId);
      }}
    >
      +
    </button>
  );
};

/**
 * The branching overlay: the "+" of every split, drawn inside the viewport.
 *
 * `<ViewportPortal>` keeps it in the viewport's transform layer, so it shares
 * the nodes' coordinate system and pans and zooms with them, while staying out of
 * React Flow's `nodes` and `edges` arrays — the separation that keeps a
 * presentation control from ever becoming a graph element.
 */
export const CanvasBranchHandleOverlay: FC<{
  readonly handles: readonly BranchHandle[];
}> = ({ handles }) => {
  if (handles.length === 0) {
    return null;
  }

  return (
    <ViewportPortal>
      {handles.map((handle) => (
        <div
          key={handle.nodeId}
          data-nodera-branch-handle={handle.nodeId}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${String(handle.x)}px, ${String(
              handle.y,
            )}px)`,
            pointerEvents: "none",
          }}
        >
          <DefaultBranchInsertButton nodeId={handle.nodeId} />
        </div>
      ))}
    </ViewportPortal>
  );
};

/* ------------------------------------------------------------------ */
/*  Drag commit                                                        */
/* ------------------------------------------------------------------ */

/**
 * Commit the final positions of a node drag to the engine, honouring the drag
 * policy the host declared.
 *
 * The policy is what tells a manual drag apart from a placement the host owns:
 *
 * - `"free"`: every dragged node is committed through `moveNode`, so it becomes
 *   its own undo unit (today's behaviour).
 * - `"locked"`: nothing is committed — the layout owns the positions, so the
 *   canvas never writes one.
 * - `"snap-back"`: nothing is committed either; the caller re-derives the
 *   nodes, which paints the assigned position again after the release.
 *
 * Grouping a whole multi-node drag into ONE history unit requires
 * application-core support (use cases refuse `history.push` inside an
 * open transaction) and is a documented phase-4 limitation.
 */
export function commitDraggedNodes(
  editor: EditorEngine,
  draggedNodes: ReadonlyArray<{ readonly id: string; readonly position: XYPosition }>,
  dragPolicy: DragPolicy = "free",
): void {
  if (dragPolicy !== "free") {
    return;
  }
  for (const node of draggedNodes) {
    const { nodeId, position } = nodePositionFromReactFlow(
      node as unknown as Parameters<typeof nodePositionFromReactFlow>[0],
    );
    moveNode(editor, { nodeId, position });
  }
}

/**
 * Sync a React Flow selection change into the engine through
 * `selectMultiple` (which also selects/deselects edges). Needed because
 * RF box/multi selection does not flow through node/edge click handlers.
 */
export function commitSelectionFromReactFlow(
  editor: EditorEngine,
  selection: { readonly nodes: ReadonlyArray<{ readonly id: string }>; readonly edges: ReadonlyArray<{ readonly id: string }> },
): void {
  selectMultiple(editor, {
    nodeIds: selection.nodes.map((n) => n.id),
    edgeIds: selection.edges.map((e) => e.id),
  });
}

/**
 * Commits one React Flow connection through the `create-edge` use case.
 *
 * Returns whether the connection was **accepted**. Under any policy other than
 * `"editable"` nothing is written and the caller reports nothing to its host, so
 * a surface whose connections are fixed can never produce an edge. Under
 * `"editable"` this is exactly the path the canvas always ran: an incomplete
 * connection is dropped by the mapper and a semantic violation is decided by the
 * use case, never here — so the return value says "the canvas accepted it", not
 * "an edge appeared".
 */
export function commitConnection(
  editor: EditorEngine,
  connection: CanvasConnection,
  connectionsPolicy: ConnectionsPolicy = "editable",
): boolean {
  if (connectionsPolicy !== "editable") {
    return false;
  }
  const conn = connectionFromReactFlow({
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? null,
    targetHandle: connection.targetHandle ?? null,
  });
  if (conn === undefined) {
    return false;
  }
  createEdge(editor, {
    source: { nodeId: conn.source.nodeId, portId: conn.source.portId },
    target: { nodeId: conn.target.nodeId, portId: conn.target.portId },
  });
  return true;
}

/** One connection as React Flow reports it, before it is mapped to the domain. */
export interface CanvasConnection {
  readonly source: string;
  readonly target: string;
  readonly sourceHandle?: string | null;
  readonly targetHandle?: string | null;
}

/**
 * A port handle a person cannot start or end a connection from, or see.
 *
 * `hidden` keeps the element in the DOM on purpose: React Flow anchors every
 * edge to a `Handle` by id, so removing them takes the edges with them. The
 * handle stays, invisible and inert, and only the affordance disappears.
 */
function inertPort(props: NoderaPortRendererProps, hidden: boolean): ReactNode {
  const isInput = props.direction === "input";
  return (
    <Handle
      id={props.portId}
      type={isInput ? "target" : "source"}
      position={isInput ? Position.Left : Position.Right}
      isConnectable={false}
      aria-label={props.name ?? props.portId}
      aria-hidden={hidden}
      data-nodera-port-id={props.portId}
      data-nodera-port-direction={props.direction ?? "bidirectional"}
      className="nodera-port-handle"
      style={hidden ? HIDDEN_PORT_HANDLE_STYLE : INERT_PORT_HANDLE_STYLE}
    />
  );
}

/** A port handle kept for edge anchoring but invisible to a person. */
const HiddenPort: FC<NoderaPortRendererProps> = (props) => inertPort(props, true);

/**
 * Visual contract of a port handle, mirrored from `PortHandle` so a themed host
 * keeps its `--ndr-handle-*` tokens when the port is painted inert.
 *
 * `PortHandle` renders those values itself but does not forward React Flow's
 * `isConnectable`, and the node wrapper that owns port rendering never passes it
 * down, so a handle it renders always accepts a connection. `"fixed"` therefore
 * paints the same contract with `isConnectable={false}`: React Flow omits its
 * `connectable` marker and refuses to start a connection from it, instead of the
 * canvas letting a drag start and then rejecting the write.
 */
const INERT_PORT_HANDLE_STYLE: CSSProperties = {
  width: "var(--ndr-handle-size, 8px)",
  height: "var(--ndr-handle-size, 8px)",
  backgroundColor: "var(--ndr-handle-background, #ffffff)",
  borderWidth: "var(--ndr-handle-border-width, 1.5px)",
  borderStyle: "solid",
  borderColor: "var(--ndr-handle-border-color, #7c8896)",
  borderRadius: "var(--ndr-handle-radius, 50%)",
};

/** Same handle, painted away: present for edge anchoring, absent for a person. */
const HIDDEN_PORT_HANDLE_STYLE: CSSProperties = {
  ...INERT_PORT_HANDLE_STYLE,
  opacity: 0,
  pointerEvents: "none",
};

/** A port handle a person cannot start or end a connection from. */
function InertPort(props: NoderaPortRendererProps): ReactNode {
  return inertPort({ ...props, direction: props.direction ?? "bidirectional" }, false);
}

/**
 * Port renderer registry the node surface uses under the two policies.
 *
 * `"visible"` ports with `"editable"` connections hands the host's registry
 * through untouched, so today's handles are exactly today's handles. Otherwise
 * every port renderer id — the host's registered ones and the built-in default —
 * is answered with one replacement component:
 *
 * - `"hidden"` ports: a component that draws nothing, which removes the React
 *   Flow `Handle` element itself instead of styling it away, so no element is
 *   left to start or end a connection from;
 * - `"visible"` ports with fixed connections: an inert handle, painted exactly
 *   as before but refusing every connection.
 *
 * The node data keeps its ports in every case, so a renderer body receives the
 * same `data.ports` it would otherwise (hiding a handle removes a control, not a
 * port).
 */
export function portRenderersForPolicy(
  connectionsPolicy: ConnectionsPolicy,
  portsPolicy: PortsPolicy,
  registry: PortRendererRegistry | undefined,
): PortRendererRegistry | undefined {
  if (portsPolicy === "visible" && connectionsPolicy === "editable") {
    return registry;
  }
  const replacement = portsPolicy === "hidden" ? HiddenPort : InertPort;
  const replaced = new PortRendererRegistry();
  replaced.register(DEFAULT_PORT_RENDERER_ID, replacement);
  for (const rendererId of registry?.listIds() ?? []) {
    if (!replaced.has(rendererId)) {
      replaced.register(rendererId, replacement);
    }
  }
  return replaced;
}

/* ------------------------------------------------------------------ */
/*  GraphCanvas                                                        */
/* ------------------------------------------------------------------ */

/** Props for the GraphCanvas component. */
export interface GraphCanvasProps {
  /** Editor engine instance owned by the host. */
  readonly editor: EditorEngine;
  /** Optional node renderer registry. When provided, registered renderers are used. */
  readonly nodeRenderers?: NodeRendererRegistry;
  /** Optional edge renderer registry. When provided, registered renderers are used. */
  readonly edgeRenderers?: EdgeRendererRegistry;
  /** Optional port renderer registry. When provided, ports use registered renderers. */
  readonly portRenderers?: PortRendererRegistry;
  /**
   * Interaction mode of the canvas (S5 "Modo de interacción").
   *
   * The host owns the value (it is UI state in `@nodera/ui-core`); the canvas
   * only maps it onto React Flow's drag props through
   * `canvasInteractionSettings`. Defaults to `"select"`.
   */
  readonly interactionMode?: CanvasInteractionMode;
  /**
   * What a manual drag does with the positions the layout assigned.
   *
   * The host owns the value (it is UI state in `@nodera/ui-core`, seeded from
   * `graph.layout.drag`); the canvas only maps it onto React Flow's
   * `nodesDraggable` prop and the drag commit path. Defaults to `"free"`, the
   * behaviour of a canvas whose host owns placement.
   */
  readonly dragPolicy?: DragPolicy;
  /**
   * Whether a person may draw a new connection on this canvas.
   *
   * The host owns the value (it is UI state in `@nodera/ui-core`, seeded from
   * `graph.layout.connections`); the canvas maps it onto React Flow's
   * `nodesConnectable` prop and the connect-commit path. `"fixed"` offers no
   * connectable handle and refuses a connection that arrives anyway, so no edge
   * is written, no event is emitted and no history entry is pushed. Defaults to
   * `"editable"`, today's behaviour.
   */
  readonly connectionsPolicy?: ConnectionsPolicy;
  /**
   * Whether the node surface paints its port handles.
   *
   * The host owns the value (it is UI state in `@nodera/ui-core`, seeded from
   * `graph.layout.ports`). `"hidden"` renders no handle element at all — not an
   * invisible one — while every node renderer keeps receiving its `data.ports`,
   * so a host can show port names in a layout-owned graph without offering a
   * connection to drag. Defaults to `"visible"`, today's behaviour.
   */
  readonly portsPolicy?: PortsPolicy;
  /**
   * Where the insert "+" affordance sits when a node has several successors
   * (S23).
   *
   * The host owns the value (it is UI state in `@nodera/ui-core`, seeded from
   * `graph.layout.insertHandles`). `"each-edge"` — the default — keeps one "+" on
   * every edge. `"before-branching"` draws a single "+" on a branching parent's
   * outgoing side, before the edges split, and those edges lose their own handle
   * while every other edge keeps it. `"both"` draws both. Only meaningful while
   * `edgeInsertion` is on: with the affordance off nothing is drawn either way.
   */
  readonly insertHandles?: InsertHandlesPolicy;
  /**
   * Render the "+" affordance centred on every edge (S6).
   *
   * Off by default: the canvas adds no control the host did not ask for.
   * Activating it records the edge as the pending insertion in the UI state and
   * opens the registered node-creation dialog, so a canvas that turns it on
   * needs a `<NoderaUiProvider>` (or its own `renderEdgeInsert`). It adds no
   * document state: the affordance is presentation only.
   *
   * The same flag also paints the phantom placeholders (S7, S21): with no node
   * at all the canvas draws one at the origin, with exactly one node it adds one
   * beside it joined by a dashed connector, and from two nodes on every leaf (a
   * node with no outgoing edge and a source-capable port) gets its own. They are
   * **overlay** boxes, drawn through `ViewportPortal`: never in the document, the
   * history or the events, and never in the React Flow `nodes` / `edges` arrays
   * either — a placeholder appended to either array is a graph element to React
   * Flow, and a node entry without handles silently empties the edge layer.
   * Their activation records `UiState.pendingAppendAnchorId` instead of a
   * pending edge. Growing a graph that way is **two** history units for the host
   * (add, then connect), which no part of this adapter claims otherwise.
   */
  readonly edgeInsertion?: boolean;
  /**
   * Axis the phantom placeholders step along (S21).
   *
   * The host declares it, because the canvas adapter can read neither
   * `graph.layout.direction` nor `graph.layout.spacing`: one step is the
   * adapter's documented `PHANTOM_NODE_OFFSET` (240 flow units). Defaults to
   * `"horizontal"`. It changes no document state; a host composing
   * `<NoderaEditor>` passes the same value as `NoderaEditor.layoutDirection`.
   */
  readonly layoutDirection?: PlaceholderAxis;
  /**
   * Host renderer for the "+" affordance, replacing the framework's button.
   *
   * The canvas keeps the position and the activation path; the host replaces
   * what the control looks like (or wires its own handler entirely). Hosts that
   * want the built-in behaviour inside their own component call
   * `useEdgeInsertActions()` from `@nodera/ui-react`.
   */
  readonly renderEdgeInsert?: (edgeId: string) => ReactNode;
  /** CSS class for the outer container. */
  readonly className?: string;
  /** Show the minimap. */
  readonly showMinimap?: boolean;
  /** Show the zoom/pan controls. */
  readonly showControls?: boolean;
  /** Color mode of the canvas chrome ("system" follows the OS). */
  readonly colorMode?: "light" | "dark" | "system";
  /** Optional callback for node changes (position, remove, etc). */
  readonly onNodesChange?: (changes: NodeChange[]) => void;
  /** Optional callback for edge changes. */
  readonly onEdgesChange?: (changes: EdgeChange[]) => void;
  /** Optional callback for connections. */
  readonly onConnect?: (params: Connection) => void;
  /** Optional callback for node selection (RF v12 passes node object). */
  readonly onNodeClick?: (event: MouseEvent, node: RfNode) => void;
  /** Optional callback for edge selection. */
  readonly onEdgeClick?: (event: MouseEvent, edge: RfEdge) => void;
  /** Optional callback after a connection is validated (non-persisting probe). */
  readonly onLinkValidate?: (valid: boolean, issues: readonly import("@nodera/contracts").ValidationIssue[]) => void;
  /**
   * Optional callback for a node definition dropped on the canvas (D7).
   *
   * The adapter only translates the drop into a definition id plus a flow
   * position; creating the node stays a host decision. Without this
   * callback the canvas ignores drops entirely.
   */
  readonly onDropNodeDefinition?: (definitionId: string, position: XYPosition) => void;
}

/**
 * Main canvas component: translates domain graph ↔ React Flow,
 * subscribes to editor events, and forwards interactions to use cases.
 *
 * Controlled-flow rules:
 *   - The engine is the single source of truth; nodes/edges are derived
 *     from it (with engine selection merged in) on every relevant event.
 *   - Measured node dimensions are applied back onto the derived nodes
 *     (guarded by `hasNewDimensions` so identical re-measurements never
 *     trigger a re-render — otherwise the controlled flow loops forever).
 *   - Drag positions are committed to the engine on drag stop
 *     (`onNodeDragStop`) as per-node undo units, and only under the `"free"`
 *     drag policy: `"locked"` and `"snap-back"` write no position at all.
 *   - Position changes arriving through `onNodesChange` are never
 *     committed (they carry no final state in this design).
 */
export const GraphCanvas: FC<GraphCanvasProps> = ({
  editor,
  nodeRenderers,
  edgeRenderers,
  portRenderers,
  interactionMode = "select",
  dragPolicy = "free",
  connectionsPolicy = "editable",
  portsPolicy = "visible",
  edgeInsertion = false,
  insertHandles = "each-edge",
  layoutDirection = "horizontal",
  renderEdgeInsert,
  className,
  showMinimap = true,
  showControls = true,
  colorMode = "light",
  onNodesChange: externalOnNodesChange,
  onEdgesChange: externalOnEdgesChange,
  onConnect: externalOnConnect,
  onNodeClick: externalOnNodeClick,
  onEdgeClick: externalOnEdgeClick,
  onLinkValidate: externalOnLinkValidate,
  onDropNodeDefinition: externalOnDropNodeDefinition,
}) => {
  // Derive RF nodes/edges/selection from engine via event-driven hook.
  const { nodes, edges, refresh } = useEditorGraph(editor);

  // nodeTypes: wrapper components that resolve the definition renderer
  // and ALWAYS render the port handles (via useNodeTypes/createNodeType).
  // Under the `"hidden"` ports policy the wrapper renders no handle at all: the
  // policy substitutes the port renderers, never the node data the renderer body
  // receives.
  const effectivePortRenderers = useMemo(
    () => portRenderersForPolicy(connectionsPolicy, portsPolicy, portRenderers),
    [connectionsPolicy, portsPolicy, portRenderers],
  );
  const nodeTypes = useNodeTypes(nodeRenderers, effectivePortRenderers);

  // Measured node dimensions are canvas state (never domain state): RF
  // reports them through `dimensions` node changes and both the minimap
  // and edge handle math need them on the node objects.
  const measuredDims = useRef(new Map<string, { width: number; height: number }>());
  const nodesWithDims = useMemo(
    () => applyMeasuredDimensions(nodes, measuredDims.current),
    [nodes],
  );

  // Route node types: a definition renderer id with no registry entry
  // would make React Flow fall back to its bare built-in node (error 003,
  // no port handles). Re-route those to the default Nodera wrapper.
  const nodesWithTypes = useMemo(
    () =>
      nodesWithDims.map((node) =>
        node.type !== undefined && nodeTypes[node.type] ? node : { ...node, type: DEFAULT_NODE_RENDERER_ID },
      ),
    [nodesWithDims, nodeTypes],
  );

  // Which nodes have a split to insert before, and which edges therefore lose
  // their own "+" under `"before-branching"` (S23).
  const branchNodeIds = useMemo(() => branchingNodeIds(edges), [edges]);
  const edgeSources = useMemo(
    () => new Map(edges.map((edge) => [edge.id, edge.source])),
    [edges],
  );

  // Build edgeTypes map: registry renderers + default sentinel. When the
  // affordance is enabled every type is wrapped, so a custom renderer keeps its
  // own "+" instead of losing the feature.
  const edgeTypes = useMemo(() => {
    if (!edgeInsertion) {
      return canvasEdgeTypes(edgeRenderers);
    }
    const hostRender = renderEdgeInsert;
    return canvasEdgeTypes(edgeRenderers, {
      render: (edgeId: string): ReactNode => {
        const sourceId = edgeSources.get(edgeId);
        if (
          sourceId !== undefined &&
          !edgeOffersInsertHandle({ policy: insertHandles, sourceId, branchNodeIds })
        ) {
          return null;
        }
        return hostRender === undefined ? (
          <DefaultEdgeInsertButton edgeId={edgeId} />
        ) : (
          hostRender(edgeId)
        );
      },
    });
  }, [edgeRenderers, edgeInsertion, renderEdgeInsert, insertHandles, branchNodeIds, edgeSources]);

  // Phantom placeholders (S7, S21): an overlay, never graph elements. The
  // boxes are derived from what the document holds on every render — positions,
  // measured sizes, ports and the edges that tell a leaf from a node with a
  // successor — and drawn through `ViewportPortal`. Nothing is appended to the
  // `nodes` / `edges` arrays React Flow receives, so React Flow never sees an
  // element whose handles it cannot resolve (that is what emptied the edge layer
  // in an earlier attempt) and the engine keeps holding exactly the document.
  const placeholders = useMemo(
    () =>
      canvasPlaceholders({
        enabled: edgeInsertion,
        axis: layoutDirection,
        nodes: nodesWithTypes.map((node) => ({
          id: node.id,
          position: node.position,
          width: node.measured?.width ?? node.width,
          height: node.measured?.height ?? node.height,
          ports: (node.data as unknown as NoderaNodeData | undefined)?.ports,
        })),
        edges,
      }),
    [edgeInsertion, layoutDirection, nodesWithTypes, edges],
  );

  // The branching "+" (S23): the same overlay discipline as the placeholders —
  // geometry derived from the document on every render, painted through
  // `ViewportPortal`, never an element React Flow manages.
  const branchHandles = useMemo(
    () =>
      canvasBranchHandles({
        enabled: edgeInsertion,
        policy: insertHandles,
        axis: layoutDirection,
        nodes: nodesWithTypes.map((node) => ({
          id: node.id,
          position: node.position,
          width: node.measured?.width ?? node.width,
          height: node.measured?.height ?? node.height,
        })),
        edges,
      }),
    [edgeInsertion, insertHandles, layoutDirection, nodesWithTypes, edges],
  );

  // Interaction mode → React Flow drag props (pure mapping, see
  // interaction-mode.ts). The mode itself is never stored in the adapter, and
  // the memo keeps the prop identity stable between unrelated re-renders so
  // React Flow does not re-register its drag handlers.
  const interaction = useMemo(
    () => canvasInteractionSettings(interactionMode),
    [interactionMode],
  );

  // React Flow instance, captured through `onInit`. Kept in a ref (canvas
  // state, never domain state) so `screenToFlowPosition` is available to
  // the drop handler without re-rendering the whole canvas.
  const flowInstance = useRef<ReactFlowInstance | null>(null);

  const handleInit = useCallback((instance: ReactFlowInstance) => {
    flowInstance.current = instance;
  }, []);

  // Drag over: accept the drag only when a drop handler exists AND the
  // payload announces the node definition MIME type (D7).
  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!externalOnDropNodeDefinition) {
        return;
      }
      if (!isNodeDefinitionDrag(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [externalOnDropNodeDefinition],
  );

  // Drop: screen coordinates → flow coordinates through the instance, so
  // the host creates the node where the user dropped it. Falls back to raw
  // client coordinates when no instance is available yet.
  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!externalOnDropNodeDefinition) {
        return;
      }
      const definitionId = nodeDefinitionFromDataTransfer(event.dataTransfer);
      if (definitionId === undefined) {
        return;
      }
      event.preventDefault();
      const screenPosition = { x: event.clientX, y: event.clientY };
      const position = flowInstance.current
        ? flowInstance.current.screenToFlowPosition(screenPosition)
        : screenPosition;
      externalOnDropNodeDefinition(definitionId, position);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [externalOnDropNodeDefinition],
  );

  // Invalidate connection validation: probe without persisting. A canvas whose
  // connections are fixed refuses every probe, which also covers a host node
  // renderer that paints its own handle outside the port renderer registry.
  const isValidConnection = useCallback<IsValidConnection>(
    (connection): boolean => {
      if (connectionsPolicy !== "editable") {
        return false;
      }
      const sourceHandle = (connection as Connection).sourceHandle ?? (connection as RfEdge).sourceHandle;
      const targetHandle = (connection as Connection).targetHandle ?? (connection as RfEdge).targetHandle;

      if (sourceHandle === undefined || targetHandle === undefined) {
        return false;
      }

      const input = {
        source: { nodeId: String(connection.source), portId: String(sourceHandle) },
        target: { nodeId: String(connection.target), portId: String(targetHandle) },
      };
      const result = validateConnectionUseCase(editor, input);
      if (externalOnLinkValidate) {
        if (result.ok) {
          externalOnLinkValidate(true, result.value.issues);
        } else {
          externalOnLinkValidate(false, []);
        }
      }
      return result.ok && result.value.valid;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, connectionsPolicy],
  );

  // Node change handler: record NEW measured dimensions only (identical
  // re-measurements must not re-render — that is the feedback loop),
  // and removals → removeNode. Positions commit on drag stop.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      externalOnNodesChange?.(changes);

      const dimsChanged = hasNewDimensions(changes, measuredDims.current);
      if (dimsChanged) {
        for (const change of changes) {
          if (change.type === "dimensions" && change.dimensions) {
            measuredDims.current.set(change.id, change.dimensions);
          }
        }
      }

      const removedIds = removedIdsFromReactFlowChanges(changes);
      if (removedIds.length > 0) {
        for (const nodeId of removedIds) {
          removeNode(editor, { nodeId });
        }
      } else if (dimsChanged) {
        refresh();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, refresh],
  );

  // Drag stop: commit final positions of every dragged node, or discard them.
  // Only `"free"` commits; `"snap-back"` re-derives the nodes so React Flow
  // paints the assigned position again instead of the pointer position it
  // tracked during the drag; `"locked"` never even starts a drag.
  const handleNodeDragStop = useCallback<OnNodeDrag>(
    (_event, _node, draggedNodes) => {
      commitDraggedNodes(
        editor,
        draggedNodes.map((node) => ({ id: node.id, position: node.position })),
        dragPolicy,
      );
      if (dragPolicy === "snap-back") {
        refresh();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, dragPolicy, refresh],
  );

  // Edge change handler: removals → removeEdge.
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      externalOnEdgesChange?.(changes);

      const removedIds = removedIdsFromReactFlowChanges(changes);
      for (const edgeId of removedIds) {
        removeEdge(editor, { edgeId });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  // Connect handler: connection → createEdge, under the connections policy.
  const handleConnect = useCallback(
    (params: Connection) => {
      const accepted = commitConnection(
        editor,
        {
          source: params.source,
          target: params.target,
          sourceHandle: params.sourceHandle,
          targetHandle: params.targetHandle,
        },
        connectionsPolicy,
      );
      if (!accepted) {
        return;
      }
      externalOnConnect?.(params);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, connectionsPolicy],
  );

  // Node click handler: selection → selectNode.
  const handleNodeClick = useCallback(
    (event: MouseEvent, node: RfNode) => {
      if (externalOnNodeClick) {
        externalOnNodeClick(event, node);
      }
      selectNode(editor, { nodeId: node.id, additive: event.shiftKey });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, refresh],
  );

  // Edge click handler: selection → selectEdge. `selectEdge` now emits
  // `selection.changed` (D5) for panels, but the canvas deliberately keeps
  // its own `refresh()`: re-deriving from that event would make React Flow
  // re-emit its own selection change and re-enter this loop (the phase-4
  // selection ping-pong documented in the feature log).
  const handleEdgeClick = useCallback(
    (event: MouseEvent, edge: RfEdge) => {
      if (externalOnEdgeClick) {
        externalOnEdgeClick(event, edge);
      }
      selectEdge(editor, { edgeId: edge.id });
      refresh();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, refresh],
  );

  // Clicking the pane clears the selection. `clearSelection` emits
  // `selection.changed` (D5) for panels, but the canvas still re-derives
  // locally for the same reason as `handleEdgeClick`: refreshing on that
  // event re-enters React Flow's selection emission.
  const handlePaneClick = useCallback(() => {
    clearSelection(editor);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, refresh]);

  // Box/multi selection (selectionKeyCode drag, meta-click) → engine.
  // Replaces the whole engine selection with RF's current one. No refresh:
  // RF already reflects this selection visually, and re-deriving here
  // makes RF re-emit selection changes — an infinite ping-pong loop.
  const handleSelectionChange = useCallback(
    ({ nodes: selected, edges: selectedEdges }: { nodes: RfNode[]; edges: RfEdge[] }) => {
      commitSelectionFromReactFlow(editor, { nodes: selected, edges: selectedEdges });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, refresh],
  );

  // Minimap node color follows the definition visual hint when present.
  const minimapNodeColor = useCallback((node: RfNode): string => {
    const visual = (node.data as unknown as NoderaNodeData | undefined)?.visual;
    return visual?.color ?? "#a3a3a3";
  }, []);

  return (
    <div
      className={className}
      style={{ width: "100%", height: "100%" }}
      data-color-mode={colorMode}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodesWithTypes}
        edges={edges}
        onInit={handleInit}
        nodeTypes={nodeTypes as unknown as NodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={["Delete", "Backspace"]}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidConnection}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onSelectionChange={handleSelectionChange}
        panOnDrag={interaction.panOnDrag}
        selectionOnDrag={interaction.selectionOnDrag}
        colorMode={colorMode}
        fitView
        nodesDraggable={dragPolicy !== "locked"}
        nodesConnectable={connectionsPolicy === "editable"}
      >
        <Background {...canvasBackgroundOptions()} />
        <CanvasPlaceholderOverlay placeholders={placeholders} />
        <CanvasBranchHandleOverlay handles={branchHandles} />
        {showMinimap && (
          <MiniMap nodeColor={minimapNodeColor} pannable zoomable />
        )}
        {showControls && <Controls />}
      </ReactFlow>
    </div>
  );
};
