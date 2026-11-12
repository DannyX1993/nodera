import {
  createElement,
  Fragment,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
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
  BezierEdge,
  StraightEdge,
  StepEdge,
  SmoothStepEdge,
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
import type { RemovalPolicy, ViewportConfiguration } from "@nodera/sdk";
import type {
  ConnectionsPolicy,
  DragPolicy,
  NodeTransition,
  PortsPolicy,
} from "@nodera/ui-core";
import { NODERA_CREATE_NODE_DIALOG_ID } from "@nodera/ui-core";
import { useEdgeInsertActions, useNoderaUi, useShortcuts, useTranslate } from "@nodera/ui-react";
import { NoderaWaypointEditingProvider, NoderaPortAxisProvider } from "./editor-context.js";
import {
  moveNode,
  createEdge,
  clearSelection,
  removeNode,
  removeNodeSplicing,
  removeEdge,
  selectNode,
  selectEdge,
  selectMultiple,
  validateConnection as validateConnectionUseCase,
} from "@nodera/application";

import { useEditorGraph } from "./use-editor-graph.js";
import { useNodeTypes } from "./custom-node.js";
import { isNodeDefinitionDrag, nodeDefinitionFromDataTransfer } from "./definition-drop.js";
import { NoderaEditorProvider } from "./editor-context.js";
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
  applyDragPositions,
  dragPositionsFromChanges,
} from "../map/react-flow-mapper.js";
import type {
  NodeRendererRegistry,
  EdgeRendererRegistry,
} from "../registries/renderer-registries.js";
import { DefaultEdgeRenderer } from "../renderers/default-edge-renderer.js";
import { positionForPlacement } from "../renderers/port-renderer.js";
import {
  defaultPortPlacement,
  type PortPlacement,
} from "../renderers/port-placement.js";
import type {
  NoderaNodeData,
  NoderaNodeRendererProps,
  NoderaPortRendererProps,
} from "../renderers/node-renderer-props.js";
import { canvasInteractionSettings, type CanvasInteractionMode } from "./interaction-mode.js";
import {
  selectionViewportPlan,
  startViewportPlan,
  viewportFitOptions,
  type ViewportFitPlan,
} from "./viewport-fit.js";

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
/*  Node removal policy                                                */
/* ------------------------------------------------------------------ */

/**
 * Deletes one node through the application use case the removal policy names.
 *
 * The canvas' own Delete key lands here (via `handleNodesChange`), so this is
 * where the policy the host configured either holds or not: `"splice"` routes
 * through `removeNodeSplicing`, joining each predecessor of the removed node
 * to each successor inside the same history unit, and `"detach"` — and an
 * absent policy reader — keeps the plain deletion with the edges it carried.
 * The SDK's `builder.graph.removeNode` applies the same rule, so both paths
 * now agree on what `graph.layout.onRemove` means.
 */
export function removeNodeForRemovalPolicy(
  editor: EditorEngine,
  nodeId: string,
  policy: RemovalPolicy,
): void {
  if (policy === "splice") {
    removeNodeSplicing(editor, { nodeId });
    return;
  }  removeNode(editor, { nodeId });
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
 * affordance at its midpoint — including React Flow's own built-in geometry
 * types (`"default"`, `"straight"`, `"step"`, `"smoothstep"`). The edge mapper
 * no longer produces them (every declared geometry is drawn by the Nodera
 * renderer), but a host may still name one explicitly, and those are absent
 * from the registry: without this registration React Flow would fall back to
 * its unwrapped built-in component and the affordance would disappear on those
 * edges. Without `insert` the map keeps the registered components untouched, so
 * a canvas without the affordance renders exactly as before.
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

  // Geometry-mapped definitions resolve to React Flow's built-in geometry
  // components, which carry no renderer registry entry. Wrapping them keeps
  // their geometry and gives them the same affordance every other edge has.
  if (insert !== undefined) {
    const builtIns: Readonly<Record<string, ComponentType<EdgeProps>>> = {
      default: BezierEdge,
      straight: StraightEdge,
      step: StepEdge,
      smoothstep: SmoothStepEdge,
    };
    for (const [id, component] of Object.entries(builtIns)) {
      types[id] = withEdgeInsert(
        component,
        insert,
      ) as unknown as EdgeTypes[string];
    }
  }
  return types;
}

/* ------------------------------------------------------------------ */
/*  Node transition                                                    */
/* ------------------------------------------------------------------ */

/** CSS class the canvas frame carries while node moves are animated. */
export const NODE_TRANSITION_CLASS = "nodera-node-transitions";

/**
 * The empty live-drag position map.
 *
 * One module-level value, so "no drag in progress" is a stable identity and the
 * node derivation does not invalidate on every render that changes nothing.
 */
const NO_DRAG_POSITIONS: ReadonlyMap<string, XYPosition> = new Map<string, XYPosition>();

/**
 * Rule that animates a node reaching a new position, and only then.
 *
 * React Flow marks the node it is dragging with a `dragging` class, and the
 * canvas re-derives every node position from the document — a drag commit, an
 * arrangement, a snap-back return. Excluding `.dragging` is what lets the node
 * follow the pointer with no lag while a programmatic move still glides; a
 * transition on the dragging node would make it trail the cursor.
 *
 * Token-driven with literal fallbacks (AGENTS.md §15), like the rest of the
 * canvas: a host themes the motion through CSS custom properties and an
 * unthemed graph still animates. `prefers-reduced-motion` wins over the host's
 * choice, because the transition is decoration and the position is the content.
 */
export const NODE_TRANSITION_STYLE = `
.${NODE_TRANSITION_CLASS} .react-flow__node:not(.dragging) {
  transition: transform var(--ndr-node-transition-duration, 200ms) var(--ndr-node-transition-easing, ease);
}
@media (prefers-reduced-motion: reduce) {
  .${NODE_TRANSITION_CLASS} .react-flow__node:not(.dragging) {
    transition: none;
  }
}
`;

/* ------------------------------------------------------------------ */
/*  Edge insert affordance (S6)                                        */
/* ------------------------------------------------------------------ */

/**
 * Accessible name of the framework's "+" button role.
 *
 * The affordances read their accessible name from the active locale catalog
 * (`canvas.insertNode`, S8 "Textos traducibles"); this key documents the
 * message a host overrides when it renames the affordance.
 */
export const EDGE_INSERT_LABEL_KEY = "canvas.insertNode";

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
  const t = useTranslate();

  return (
    <button
      type="button"
      data-nodera-edge-insert=""
      aria-label={t(EDGE_INSERT_LABEL_KEY)}
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
 * Default distance between consecutive ranks — and default gap between the
 * neighbouring boxes of one rank — in flow units.
 *
 * The canvas cannot see `graph.layout.rankSpacing` / `graph.layout.spacing`
 * (that is SDK configuration, and the placement rule lives in
 * `@nodera/graph-layout`), so the adapter owns this documented numeric default
 * for both pitches. A host that knows what its layout uses declares it through
 * `GraphCanvasProps.layoutRankSpacing` / `layoutNodeSpacing`, which is what makes
 * the phantom of one branch land on the rank line the sibling branch's real node
 * occupies instead of a default step above or below it.
 *
 * It is **both** pitches the search uses:
 *
 * - the **flow** pitch: the first step past the node, and then every whole step
 *   the walk keeps moving along the axis while the rank band is blocked;
 * - the **cross** pitch: the gap between neighbouring boxes of one rank, added
 *   to the box's own cross extent, which is how far the placeholder slides to
 *   the next lane of the same rank band — the column the layout itself would
 *   place beside it.
 *
 * The flow step may grow past this offset ({@link PHANTOM_CONNECTOR_MIN_LENGTH})
 * so that a node larger than one step never loses its connector.
 *
 * A slot is judged on both axes: a box that shares the candidate's cross band
 * keeps it out of reach until {@link PHANTOM_SLOT_CLEARANCE} separates them,
 * because this step and the layout's rank pitch are two different grids and a
 * step alone can leave the ghost flush against a node of the next rank.
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
 * Smallest gap between a placeholder and any box sharing its cross band, in flow
 * units.
 *
 * A slot is the space a **real node** takes, not the pixels its outline covers
 * (user report: the ghost of one branch clashes with the last node of another),
 * so a candidate has to keep the smallest distance that still reads as a gap —
 * the shortest connector the overlay can draw, which is why this reuses
 * {@link PHANTOM_CONNECTOR_MIN_LENGTH} instead of inventing a second number. Two
 * boxes nearer than that look like one collision even when their areas never
 * overlap: the default step is 240 while a layered rank may sit 280 away, so the
 * first candidate can stop flush against, or a few units above, a node of the
 * next rank that intrudes into the placeholder's column.
 */
const PHANTOM_SLOT_CLEARANCE = PHANTOM_CONNECTOR_MIN_LENGTH;

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
 *
 * Deliberately no `minWidth` / `minHeight`: the box is painted at exactly the
 * dimensions the derivation handed it — the anchor node's measured size, or the
 * `PLACEHOLDER_NODE_SIZE` fallback when nothing was measured — so the ghost
 * lines up with the rank the real nodes form instead of growing past them.
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

/**
 * One straight run of the connector from a node to the placeholder that follows
 * it.
 *
 * A run is axis-aligned and 1 px thick across its axis, which is why a sideways
 * slot needs two of them ({@link PhantomPlaceholder.connectors}) instead of a
 * diagonal: the overlay paints a run as a dashed CSS border, and the geometry
 * that reaches a box beside the anchor is one run along the flow axis plus one
 * along the cross axis.
 */
export interface PlaceholderConnector {
  /** Flow coordinate the run starts at (the node's far edge, or the lane edge). */
  readonly x: number;
  readonly y: number;
  /** Length along the axis; the run is 1 px thick across it. */
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
  /**
   * The dashed run(s) that join the anchor to the box, in drawing order.
   *
   * A slot in the anchor's own column is one run along the declared axis, which
   * is the straight connector this contract has always described. A slot that
   * slid to a neighbouring lane adds a second run along the cross axis at the
   * placeholder's flow line, so the line actually reaches the box instead of
   * stopping short of a box it no longer points at. Empty for the empty graph:
   * there is no node to connect from.
   */
  readonly connectors: readonly PlaceholderConnector[];
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
  /**
   * Flow step between consecutive ranks, in flow units; the value the host
   * declares as `GraphCanvas.layoutRankSpacing`.
   *
   * Defaults to {@link PHANTOM_NODE_OFFSET} (240) when absent, which is the step
   * a host that declares nothing has always seen.
   */
  readonly rankSpacing?: number | undefined;
  /**
   * Gap between neighbouring boxes of one rank, in flow units; the value the host
   * declares as `GraphCanvas.layoutNodeSpacing`.
   *
   * A lane sits one cross pitch away — the box's own cross extent plus this gap —
   * so it lands where the layout would place the next column of that rank.
   * Defaults to {@link PHANTOM_NODE_OFFSET} (240) when absent.
   */
  readonly nodeSpacing?: number | undefined;
  readonly nodes: readonly PlaceholderNodeInput[];
  /** Edges of the document, read to tell a leaf from a node with a successor. */
  readonly edges: ReadonlyArray<{ readonly source: string; readonly target: string }>;
}

/**
 * The two pitches the placeholder walk steps by, in flow units.
 *
 * Both are host-declared presentation geometry (see
 * {@link CanvasPlaceholderInput.rankSpacing} / `nodeSpacing`), already resolved
 * against {@link PHANTOM_NODE_OFFSET}: neither has an axis of its own, so one
 * rule serves a vertical and a horizontal graph.
 */
interface PlaceholderPitch {
  /** Flow step between consecutive ranks. */
  readonly rank: number;
  /** Gap between neighbouring boxes of one rank. */
  readonly node: number;
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

/** One placeholder in the first free slot of its anchor's rank band.
 *
 * The placeholder occupies a slot like a node does (user report: the ghost takes
 * the same space as a normal node), so it is not enough to avoid overlapping a
 * node: the slot itself is the space a node needs, which is what
 * {@link slotTaken} decides on both axes. The search order is
 * {@link firstFreeSlot}; the connector is built by {@link connectorRuns} so it
 * reaches the box wherever the slot was found.
 */
function placeholderAfter(
  anchorId: string,
  kind: PlaceholderKind,
  node: PlaceholderNodeInput,
  axis: PlaceholderAxis,
  occupied: readonly PlaceholderBox[],
  pitch: PlaceholderPitch,
): PhantomPlaceholder {
  const width = node.width ?? PLACEHOLDER_NODE_SIZE.width;
  const height = node.height ?? PLACEHOLDER_NODE_SIZE.height;
  const vertical = axis === "vertical";
  const flowExtent = vertical ? height : width;
  const crossExtent = vertical ? width : height;
  // One rank step past the node, but never so short that the connector
  // disappears: a box larger than the pitch grows the step instead.
  const flowStep = Math.max(pitch.rank, flowExtent + PHANTOM_CONNECTOR_MIN_LENGTH);
  // One lane is one column away: the box's own cross extent plus the gap the
  // layout leaves between neighbouring boxes of a rank.
  const laneStep = crossExtent + pitch.node;
  const box = firstFreeSlot(node, axis, flowStep, laneStep, occupied);

  return { anchorId, kind, box, connectors: connectorRuns(node, axis, box) };
}

/**
 * The dashed run(s) that join a node to the placeholder placed after it.
 *
 * Always one run along the flow axis, from the node's far edge to the flow line
 * the placeholder starts on. A slot that slid to a lane beside the node adds one
 * run along the cross axis, at that same flow line, from the node's centre to the
 * **near edge** of the box — an L rather than a diagonal, because a run is what
 * the overlay paints (a dashed CSS border) and an L needs no new primitive. A
 * slot in the node's own column has no lane offset, so the answer is exactly the
 * single straight connector this contract has always described.
 */
function connectorRuns(
  node: PlaceholderNodeInput,
  axis: PlaceholderAxis,
  box: PlaceholderBox,
): readonly PlaceholderConnector[] {
  const width = node.width ?? PLACEHOLDER_NODE_SIZE.width;
  const height = node.height ?? PLACEHOLDER_NODE_SIZE.height;
  const vertical = axis === "vertical";
  const nodeFarEdge = vertical ? node.position.y + height : node.position.x + width;
  const nodeCentre = vertical ? node.position.x + width / 2 : node.position.y + height / 2;
  const boxFlowStart = vertical ? box.y : box.x;
  const boxCentre = vertical ? box.x + box.width / 2 : box.y + box.height / 2;
  const runs: PlaceholderConnector[] = [
    vertical
      ? { x: nodeCentre, y: nodeFarEdge, length: boxFlowStart - nodeFarEdge, axis }
      : { x: nodeFarEdge, y: nodeCentre, length: boxFlowStart - nodeFarEdge, axis },
  ];

  const laneOffset = boxCentre - nodeCentre;
  if (laneOffset !== 0) {
    // The near edge of the box, never its centre: the run has to reach the box
    // without drawing over it, and the box is a dashed outline of the same
    // colour, so a run along its border would read as a doubled line.
    const nearEdge =
      laneOffset > 0
        ? vertical
          ? box.x
          : box.y
        : vertical
          ? box.x + box.width
          : box.y + box.height;
    runs.push(
      vertical
        ? {
            x: Math.min(nearEdge, nodeCentre),
            y: boxFlowStart,
            length: Math.abs(nearEdge - nodeCentre),
            axis: "horizontal",
          }
        : {
            x: boxFlowStart,
            y: Math.min(nearEdge, nodeCentre),
            length: Math.abs(nearEdge - nodeCentre),
            axis: "vertical",
          },
    );
  }

  return runs;
}

/**
 * Whether `candidate` is too close to `box` to be a free slot.
 *
 * Two boxes only compete when their **cross bands** overlap: a node in a
 * neighbouring column cannot be hit by a placeholder that never enters its lane.
 * Along the flow axis the candidate needs {@link PHANTOM_SLOT_CLEARANCE}, so this
 * reports an overlap (a negative gap) and a near miss alike — the near miss is
 * the reported defect, where a 140-wide node centred at a half step sits 20 units
 * inside the placeholder's column and the two boxes end up touching.
 */
function slotTaken(
  candidate: PlaceholderBox,
  box: PlaceholderBox,
  axis: PlaceholderAxis,
): boolean {
  const vertical = axis === "vertical";
  const crossBandsOverlap = vertical
    ? candidate.x < box.x + box.width && box.x < candidate.x + candidate.width
    : candidate.y < box.y + box.height && box.y < candidate.y + candidate.height;
  if (!crossBandsOverlap) {
    return false;
  }
  const gap = vertical
    ? Math.max(box.y - (candidate.y + candidate.height), candidate.y - (box.y + box.height))
    : Math.max(box.x - (candidate.x + candidate.width), candidate.x - (box.x + box.width));
  return gap < PHANTOM_SLOT_CLEARANCE;
}

/** Whether the slot `candidate` is free of every occupied box. */
function slotFree(
  candidate: PlaceholderBox,
  axis: PlaceholderAxis,
  occupied: readonly PlaceholderBox[],
): boolean {
  return !occupied.some((box) => slotTaken(candidate, box, axis));
}

/** The box a candidate slot would take, in flow coordinates. */
function slotBox(
  node: PlaceholderNodeInput,
  axis: PlaceholderAxis,
  flow: number,
  cross: number,
): PlaceholderBox {
  const width = node.width ?? PLACEHOLDER_NODE_SIZE.width;
  const height = node.height ?? PLACEHOLDER_NODE_SIZE.height;
  return axis === "vertical"
    ? { x: cross, y: flow, width, height }
    : { x: flow, y: cross, width, height };
}

/** The box the node occupies, so the walk can treat it like any other. */
function nodeBox(node: PlaceholderNodeInput): PlaceholderBox {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.width ?? PLACEHOLDER_NODE_SIZE.width,
    height: node.height ?? PLACEHOLDER_NODE_SIZE.height,
  };
}

/**
 * The forward walk: the first free slot in `node`'s own column, from its first
 * step on.
 *
 * This is phase 3 of {@link firstFreeSlot} and the behaviour the placeholder had
 * before lanes existed. The walk is bounded instead of open-ended: a candidate
 * that starts {@link PHANTOM_SLOT_CLEARANCE} past every occupied box's flow far
 * edge clears that box whatever the cross bands are, so the ceiling makes the
 * loop terminate on a free slot for any input — including boxes larger than one
 * step or boxes belonging to other placeholders — with no retry, no randomness
 * and no second scan.
 */
function forwardSlot(
  node: PlaceholderNodeInput,
  axis: PlaceholderAxis,
  step: number,
  occupied: readonly PlaceholderBox[],
): PlaceholderBox {
  const start = axis === "vertical" ? node.position.y : node.position.x;
  const cross = axis === "vertical" ? node.position.x : node.position.y;
  const farEdge = occupied.reduce(
    (far, box) => Math.max(far, axis === "vertical" ? box.y + box.height : box.x + box.width),
    start,
  );
  const candidateAt = (slot: number): PlaceholderBox =>
    slotBox(node, axis, start + slot * step, cross);

  // The first slot past every occupied far edge, plus the clearance, is free by
  // construction.
  const limit =
    Math.max(1, Math.ceil((farEdge + PHANTOM_SLOT_CLEARANCE - start) / step)) + 1;
  for (let slot = 1; slot <= limit; slot += 1) {
    const candidate = candidateAt(slot);
    if (slotFree(candidate, axis, occupied)) {
      return candidate;
    }
  }
  // Unreachable: the loop's last slot already starts clear of every occupied edge.
  return candidateAt(limit);
}

/**
 * The slot a placeholder takes, in three steps, nearest placement first.
 *
 * 1. **The anchor's own column, one flow step past it** — where a real successor
 *    would land, and the placement the ghost has always used when nothing is in
 *    the way.
 * 2. **One cross step to either side of that slot, on the same flow line** — the
 *    placeholder stays in the rank band and takes the neighbouring lane instead
 *    of walking away from the node it belongs to (user report: the ghost takes
 *    the space of a normal node, so it belongs in the next rank, not 400 units
 *    below its anchor with a connector long enough to read as an edge). The
 *    lower cross coordinate is tried first, so the choice is deterministic and
 *    independent of the order the document reported its nodes in.
 * 3. **{@link forwardSlot}**, the forward walk down the anchor's own column,
 *    for a rank band whose whole flow line is blocked.
 *
 * Only one lane each side is offered by step 2 on purpose: a scan that ran
 * outward until it found a free lane would always succeed — the first lane clear
 * of every occupied cross band is free by construction — which would make step 3
 * dead code and would let a placeholder drift off the graph instead of taking the
 * next rank. One slot aside is the distance the layout itself uses between the
 * columns of a rank (`crossExtent + nodeSpacing`), and past it the rank is
 * genuinely full.
 */
function firstFreeSlot(
  node: PlaceholderNodeInput,
  axis: PlaceholderAxis,
  step: number,
  laneStep: number,
  occupied: readonly PlaceholderBox[],
): PlaceholderBox {
  const vertical = axis === "vertical";
  const flow = (vertical ? node.position.y : node.position.x) + step;
  const cross = vertical ? node.position.x : node.position.y;

  const ownSlot = slotBox(node, axis, flow, cross);
  if (slotFree(ownSlot, axis, occupied)) {
    return ownSlot;
  }

  for (const lane of [cross - laneStep, cross + laneStep]) {
    const candidate = slotBox(node, axis, flow, lane);
    if (slotFree(candidate, axis, occupied)) {
      return candidate;
    }
  }

  return forwardSlot(node, axis, step, occupied);
}

/**
 * Derives every placeholder the canvas draws, in flow coordinates.
 *
 * Two states, one derivation, so a single node can never carry two placeholders
 * for itself:
 *
 * - the **empty state** (S7): with no node at all, the placeholder sits at the
 *   origin and has no connector; with exactly one node it sits one free step
 *   past it and a dashed connector joins the two;
 * - the **successor placeholders** (S21): from two nodes on, every node with no
 *   outgoing edge *and* a source-capable port gets one — a leaf is where the
 *   hierarchy ends, so a successor is unambiguous there. A leaf with no output
 *   port gets nothing.
 *
 * Every placeholder takes the first free slot of its anchor's rank band — its own
 * column, a lane beside it, or (only when the whole flow line is blocked) the
 * next free step down the column, always at least
 * {@link PHANTOM_SLOT_CLEARANCE} away from every box in the same band — and each
 * accepted one joins the occupied set, so a placeholder behaves like a node for
 * the ones derived after it: leaves are walked in node id order, which makes the
 * result independent of the order the document (or a React Flow measurement)
 * reported them in.
 *
 * The result is geometry, not graph elements: the canvas paints it through
 * `ViewportPortal`, so nothing here can reach the React Flow `nodes` / `edges`
 * arrays, the document, an event or a history entry. The set is derived from the
 * edges on every render, so a placeholder disappears in the same commit that
 * gives its node a successor and nothing has to be cleaned up.
 *
 * The two pitches the walk steps by come from the host
 * ({@link CanvasPlaceholderInput.rankSpacing} / `nodeSpacing`) and default to
 * {@link PHANTOM_NODE_OFFSET}, so a host that declares its own rank pitch gets a
 * phantom on the rank line its siblings occupy and a host that declares none
 * keeps the step it had.
 */
export function canvasPlaceholders(
  input: CanvasPlaceholderInput,
): readonly PhantomPlaceholder[] {
  if (!input.enabled) {
    return [];
  }

  const axis = input.axis ?? "horizontal";
  const pitch: PlaceholderPitch = {
    rank: input.rankSpacing ?? PHANTOM_NODE_OFFSET,
    node: input.nodeSpacing ?? PHANTOM_NODE_OFFSET,
  };
  const anchor = input.nodes[0];

  if (input.nodes.length === 0) {
    const { width, height } = PLACEHOLDER_NODE_SIZE;
    return [
      {
        anchorId: undefined,
        kind: "empty-state",
        box: { x: 0, y: 0, width, height },
        connectors: [],
      },
    ];
  }

  if (input.nodes.length === 1 && anchor !== undefined) {
    return [
      placeholderAfter(anchor.id, "empty-state", anchor, axis, [nodeBox(anchor)], pitch),
    ];
  }

  const hasSuccessor = new Set(input.edges.map((edge) => edge.source));
  const occupied: PlaceholderBox[] = input.nodes.map((node) => nodeBox(node));
  // Node id order, so the arrangement never depends on iteration order.
  const leaves = input.nodes
    .filter((node) => !hasSuccessor.has(node.id) && sourceCapable(node))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return leaves.map((node) => {
    const placeholder = placeholderAfter(node.id, "successor", node, axis, occupied, pitch);
    occupied.push(placeholder.box);
    return placeholder;
  });
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
  const t = useTranslate();

  return (
    <button
      type="button"
      data-nodera-phantom-insert=""
      data-nodera-phantom-insert-for={props.anchorId ?? ""}
      aria-label={t(EDGE_INSERT_LABEL_KEY)}
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

/** The dashed run from a node to the placeholder that follows it. */
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

/** Props accepted by {@link DefaultPlaceholderBox}. */
export interface DefaultPlaceholderBoxProps {
  /** The placeholder to draw: its kind, anchor, box and connector. */
  readonly placeholder: PhantomPlaceholder;
}

/**
 * The framework's placeholder: a dashed box carrying the "+".
 *
 * Exported so a host that wants a different box can wrap this one instead of
 * re-implementing the geometry the derivation handed it. The box owns nothing
 * but its own presentation: the coordinates come from the placeholder, and the
 * `"+"` inside it (`{@link PhantomInsertButton}`) records the append anchor and
 * opens the node-creation dialog.
 *
 * The box paints at **exactly** the derived dimensions — `border-box`, no min
 * sizes of its own — so a successor placeholder matches the anchor node's
 * measured size and the connector starts where the painted node ends. A host
 * that wants a different size replaces this component through
 * `renderPlaceholder`; the derivation still hands every replacement the anchor's
 * measured box.
 */
export const DefaultPlaceholderBox: FC<DefaultPlaceholderBoxProps> = ({ placeholder }) => (
  <div
    data-nodera-phantom-node="inactive"
    data-nodera-phantom-kind={placeholder.kind}
    data-nodera-phantom-for={placeholder.anchorId ?? ""}
    className="nodera-phantom-node"
    style={{
      ...PHANTOM_NODE_STYLE,
      position: "absolute",
      zIndex: PLACEHOLDER_Z_INDEX,
      boxSizing: "border-box",
      width: placeholder.box.width,
      height: placeholder.box.height,
      minWidth: placeholder.box.width,
      minHeight: placeholder.box.height,
      transform: `translate(${String(placeholder.box.x)}px, ${String(
        placeholder.box.y,
      )}px)`,
    }}
  >
    <PhantomInsertButton anchorId={placeholder.anchorId} />
  </div>
);

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
 *
 * `render` replaces the box **and** its `"+"` for every placeholder (S6); the
 * dashed connector stays the canvas's, because it is the geometry of the
 * placeholder rather than the control. Without it the framework's own
 * {@link DefaultPlaceholderBox} is painted, byte for byte.
 */
export const CanvasPlaceholderOverlay: FC<{
  readonly placeholders: readonly PhantomPlaceholder[];
  readonly render?: (placeholder: PhantomPlaceholder) => ReactNode;
}> = ({ placeholders, render }) => {
  if (placeholders.length === 0) {
    return null;
  }

  return (
    <ViewportPortal>
      {placeholders.map((placeholder) => (
        <Fragment key={placeholder.anchorId ?? EMPTY_GRAPH_KEY}>
          {placeholder.connectors.map((connector, index) => (
            <PlaceholderConnectorView
              key={`${connector.axis}-${String(index)}`}
              connector={connector}
            />
          ))}
          {render === undefined ? (
            <DefaultPlaceholderBox placeholder={placeholder} />
          ) : (
            render(placeholder)
          )}
        </Fragment>
      ))}
    </ViewportPortal>
  );
};

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
  // The side follows the same rule a painted handle does. Without it, hiding or
  // freezing the ports moved every edge anchor back to the left/right border of
  // a vertical graph.
  const placement: PortPlacement =
    props.placement ?? defaultPortPlacement(props.direction, "horizontal");
  return (
    <Handle
      id={props.portId}
      type={isInput ? "target" : "source"}
      position={positionForPlacement(placement)}
      isConnectable={false}
      aria-label={props.name ?? props.portId}
      aria-hidden={hidden}
      data-nodera-port-id={props.portId}
      data-nodera-port-direction={props.direction ?? "bidirectional"}
      className="nodera-port-handle"
      style={hidden ? hiddenPortHandleStyle(placement) : INERT_PORT_HANDLE_STYLE}
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

/**
 * Style of the kept-but-invisible handle.
 *
 * Zero-sized and pinned to the node border on the side it anchors, overriding
 * React Flow's own offset classes: the edge endpoint is the handle's centre, so
 * a hidden handle that keeps its size (or React Flow's outward offset) leaves
 * the edge floating half a handle away from the node — invisible with a visible
 * port dot, glaring without one. With the centre exactly on the border the edge
 * reaches the node whether the ports are painted or not.
 */
function hiddenPortHandleStyle(placement: PortPlacement): CSSProperties {
  return {
    width: 0,
    height: 0,
    borderWidth: 0,
    borderStyle: "none",
    opacity: 0,
    pointerEvents: "none",
    // The handle is pinned to the border of the side it occupies, and the
    // transform pulls its own box back onto that border so the edge centre sits
    // exactly on the node outline whichever side it is on.
    ...(placement === "left"
      ? { left: 0, right: "auto", top: "50%", bottom: "auto", transform: "translateY(-50%)" }
      : placement === "right"
        ? { right: 0, left: "auto", top: "50%", bottom: "auto", transform: "translateY(-50%)" }
        : placement === "top"
          ? { top: 0, bottom: "auto", left: "50%", right: "auto", transform: "translateX(-50%)" }
          : { bottom: 0, top: "auto", left: "50%", right: "auto", transform: "translateX(-50%)" }),
  };
}

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
/*  Camera framing                                                     */
/* ------------------------------------------------------------------ */

/**
 * Applies one camera framing through the captured React Flow instance.
 *
 * The camera is moved through `fitView` on the engine, never through component
 * state: the viewport belongs to React Flow (canvas state), so the canvas keeps
 * no copy of it and a framing writes nothing anywhere else — no document
 * position, no UI state, no history unit and no application event.
 */
function applyViewportPlan(instance: ReactFlowInstance, plan: ViewportFitPlan): void {
  void instance.fitView(viewportFitOptions(plan));
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
   * Reads the removal policy the host configured, right when a deletion is
   * about to run.
   *
   * A canvas deletion (React Flow's Delete/Backspace on a selected node) goes
   * through the application use case directly, so without this it ignores what
   * `graph.layout.onRemove` — and therefore `builder.graph.removeNode` — does.
   * With a reader supplied, `"splice"` routes the deletion through
   * `removeNodeSplicing` so a removed middle node joins each predecessor to
   * each successor, exactly like the SDK path; `"detach"` (and an absent
   * reader, the previous behaviour) deletes the node with the edges it carried.
   *
   * It is a reader, not a value, on purpose: the policy lives in the builder's
   * configuration, the canvas never re-renders when it flips, and reading it at
   * deletion time is what keeps a changed policy from arriving stale.
   */
  readonly removalPolicy?: () => RemovalPolicy;
  /**
   * Reads the camera framing the host configured, when the canvas mounts and
   * whenever the selection changes.
   *
   * A reader, exactly like {@link GraphCanvasProps.removalPolicy}: the framing is
   * host configuration (the SDK's `viewport` group), not UI state, so the canvas
   * never re-renders when it changes and reads it at the one moment that matters.
   * `undefined` — no reader, or a reader that returns nothing — keeps today's
   * behaviour byte for byte: React Flow's plain `fitView` on init and no camera
   * movement on selection.
   *
   * Two framings are possible, decided by the pure rules in `viewport-fit.ts`:
   * the mount framing (`start`: the whole graph, or one named node, at an
   * absolute zoom or under a ceiling) and the selection framing (the selected
   * nodes, plus the selected edges when `edges` is on, and a return to the mount
   * framing once the selection is cleared). It writes nothing, pushes no history
   * and emits no event: the viewport is canvas state (AGENTS.md §5.3).
   */
  readonly viewportFit?: () => ViewportConfiguration | undefined;
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
   * Whether a node moves to its new position or appears there.
   *
   * The host owns the value (it is UI state in `@nodera/ui-core`, seeded from
   * `graph.layout.nodeTransition`). `"instant"` — the default, today's
   * behaviour — paints a position change at once, which is why a drag under
   * `dragPolicy: "snap-back"` returns to the assigned position with a jump.
   * `"animated"` makes the node glide there instead. An active drag is never
   * animated, so the node keeps following the pointer with no lag.
   *
   * It is presentation only: it writes no document position, pushes no history
   * entry and emits no event.
   */
  readonly nodeTransition?: NodeTransition;
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
   * Whether the canvas accepts waypoint reshaping on edges.
   *
   * The canvas composes this from the SDK feature flag, connections policy
   * and active strategy; gestures and handles are gated when false (the
   * default). An edge that already carries waypoints still routes through
   * them — only editing is disabled.
   */
  readonly edgeWaypointEditing?: boolean;
  /**
   * Axis the phantom placeholders step along (S21).
   *
   * The host declares it, because the canvas adapter can read neither
   * `graph.layout.direction` nor `graph.layout.spacing` / `rankSpacing`: both are
   * SDK configuration. The flow step is the rank pitch declared in
   * {@link GraphCanvasProps.layoutRankSpacing} (the adapter's documented 240 flow
   * units when the host declares nothing), and the lane pitch is one column away
   * (see {@link GraphCanvasProps.layoutNodeSpacing}). Defaults to
   * `"horizontal"`. It changes no document state; a host composing
   * `<NoderaEditor>` passes the same value as `NoderaEditor.layoutDirection`.
   */
  readonly layoutDirection?: PlaceholderAxis;
  /**
   * Flow step between consecutive ranks, in flow units (S21).
   *
   * The host declares it for the same reason it declares
   * {@link GraphCanvasProps.layoutDirection}: `graph.layout.rankSpacing` is SDK
   * configuration the canvas adapter cannot read. With it the phantom of a leaf
   * steps by the layout's own rank pitch, so it lands on the **same rank line**
   * the real nodes of the sibling branch occupy — without it the ghost stepped a
   * fixed 240 while the layout's rank sat 280 away, and floated above the rank it
   * belongs to. Defaults to `PHANTOM_NODE_OFFSET` (240), so a host that declares
   * nothing keeps the flow step it always had. Presentation geometry only: it
   * writes no document state.
   */
  readonly layoutRankSpacing?: number | undefined;
  /**
   * Gap between neighbouring boxes of one rank, in flow units (S21).
   *
   * The lane the placeholder slides to when a real node took the anchor's own
   * column sits one **cross pitch** away: the box's own cross extent plus this
   * gap, which is where the layout places the next column of that rank. Defaults
   * to `PHANTOM_NODE_OFFSET` (240), like
   * {@link GraphCanvasProps.layoutRankSpacing}; because the pitch always carries
   * the box's cross extent, the default lane is the box plus a 240-unit gap, not
   * a bare 240 offset.
   */
  readonly layoutNodeSpacing?: number | undefined;
  /**
   * Host renderer for the "+" affordance, replacing the framework's button.
   *
   * The canvas keeps the position and the activation path; the host replaces
   * what the control looks like (or wires its own handler entirely). Hosts that
   * want the built-in behaviour inside their own component call
   * `useEdgeInsertActions()` from `@nodera/ui-react`.
   */
  readonly renderEdgeInsert?: (edgeId: string) => ReactNode;
  /**
   * Host renderer for a phantom placeholder (S6), replacing the framework's
   * dashed box **and** its `"+"`.
   *
   * The host receives the whole {@link PhantomPlaceholder} — `kind`
   * (`"empty-state"` or `"successor"`), `anchorId`, `box` in flow coordinates
   * and the `connectors` that join it to its node — so one component covers both
   * kinds. The canvas keeps the geometry: the box goes exactly where the
   * derivation put it and the dashed connector is still painted, because the
   * line is the placeholder's shape, not its control.
   *
   * Replacing the box also replaces what it *does*: recording
   * `UiState.pendingAppendAnchorId` and opening the node-creation dialog are the
   * framework button's job, so a host that wants the append flow wires it itself
   * (`useNoderaUi()` gives it the store). A host that wants the default
   * behaviour inside its own layout renders `DefaultPlaceholderBox`.
   */
  readonly renderPlaceholder?: (placeholder: PhantomPlaceholder) => ReactNode;
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
 *   - The position changes a drag reports through `onNodesChange` are painted
 *     from canvas state and never committed: React Flow's controlled model
 *     applies them to nothing on its own, so a canvas that dropped them would
 *     not move the node at all. They are dropped when the drag ends, which is
 *     what lets `"snap-back"` return to the assigned position (animated when
 *     `nodeTransition` asks for it).
 */
export const GraphCanvas: FC<GraphCanvasProps> = ({
  editor,
  nodeRenderers,
  edgeRenderers,
  portRenderers,
  interactionMode = "select",
  dragPolicy = "free",
  removalPolicy,
  viewportFit,
  connectionsPolicy = "editable",
  portsPolicy = "visible",
  edgeInsertion = false,
  edgeWaypointEditing = false,
  nodeTransition = "instant",
  layoutDirection = "horizontal",
  layoutRankSpacing,
  layoutNodeSpacing,
  renderEdgeInsert,
  renderPlaceholder,
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
  // The host's deletion key comes from the shortcut contract (S8 "Atajos
  // configurables"); React Flow takes the key itself, so the canvas passes the
  // configured one instead of a literal list of its own.
  const deleteKey = useShortcuts()["delete-selection"].key;
  const deleteKeyCode: string | string[] =
    typeof deleteKey === "string" ? deleteKey : [...deleteKey];

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

  // Live positions a drag reports. Also canvas state, and for the same reason:
  // React Flow's controlled model applies no position change itself, it reports
  // them and expects the host to paint them. They are dropped when the drag ends,
  // so the node follows the pointer while it travels and the document (under
  // `"free"`) or the assigned position (under `"snap-back"`) owns it afterwards.
  const [dragPositions, setDragPositions] =
    useState<ReadonlyMap<string, XYPosition>>(NO_DRAG_POSITIONS);
  const nodesWithDrag = useMemo(
    () => applyDragPositions(nodesWithDims, dragPositions),
    [nodesWithDims, dragPositions],
  );

  // Route node types: a definition renderer id with no registry entry
  // would make React Flow fall back to its bare built-in node (error 003,
  // no port handles). Re-route those to the default Nodera wrapper.
  const nodesWithTypes = useMemo(
    () =>
      nodesWithDrag.map((node) =>
        node.type !== undefined && nodeTypes[node.type] ? node : { ...node, type: DEFAULT_NODE_RENDERER_ID },
      ),
    [nodesWithDrag, nodeTypes],
  );

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
        return hostRender === undefined ? (
          <DefaultEdgeInsertButton edgeId={edgeId} />
        ) : (
          hostRender(edgeId)
        );
      },
    });
  }, [edgeRenderers, edgeInsertion, renderEdgeInsert, edgeSources]);

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
        rankSpacing: layoutRankSpacing,
        nodeSpacing: layoutNodeSpacing,
        nodes: nodesWithTypes.map((node) => ({
          id: node.id,
          position: node.position,
          width: node.measured?.width ?? node.width,
          height: node.measured?.height ?? node.height,
          ports: (node.data as unknown as NoderaNodeData | undefined)?.ports,
        })),
        edges,
      }),
    [edgeInsertion, layoutDirection, layoutRankSpacing, layoutNodeSpacing, nodesWithTypes, edges],
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

  // What the camera frames when the canvas mounts. Read from the live reader on
  // every render (the reader is configuration, not state), so a host that swaps
  // it gets the new framing on the next mount. `undefined` — no reader, or a
  // reader that declares nothing — is today's plain React Flow `fitView`, which
  // is why the boolean prop below stays exactly as it was in that case.
  const startPlan = useMemo(() => startViewportPlan(viewportFit?.()), [viewportFit]);

  const handleInit = useCallback(
    (instance: ReactFlowInstance) => {
      flowInstance.current = instance;
      if (startPlan !== undefined) {
        applyViewportPlan(instance, startPlan);
      }
    },
    [startPlan],
  );

  // Latest reader, so the selection subscription below is installed once per
  // editor instead of re-subscribing on every render of a host that passes an
  // inline arrow (the default composition in `<NoderaEditor>` does exactly
  // that).
  const viewportFitRef = useRef<(() => ViewportConfiguration | undefined) | undefined>(
    viewportFit,
  );
  useEffect(() => {
    viewportFitRef.current = viewportFit;
  }, [viewportFit]);

  // Camera follows the selection.
  //
  // `selection.changed` is the one engine event that knows both "the selection
  // changed" and "the selection is now empty", so the restore path lives here.
  // It is deliberately not in `useEditorGraph`, which skips this event to avoid
  // re-entering React Flow's own selection emission: this subscription moves the
  // camera and never re-derives the nodes.
  //
  // A selection reaches this subscription more than once when React Flow reports
  // its own selection back through `commitSelectionFromReactFlow` (the canvas's
  // `onSelectionChange`), and each call would restart the same animation. The
  // last applied framing is remembered as data — never as component state — so a
  // repeated identical framing is a no-op while a different one always applies.
  const appliedSelectionPlan = useRef<string | undefined>(undefined);
  useEffect(() => {
    return editor.events.subscribe("selection.changed", (event) => {
      const reader = viewportFitRef.current;
      const instance = flowInstance.current;
      if (reader === undefined || instance === null) {
        return;
      }
      const plan = selectionViewportPlan(reader(), {
        nodes: event.payload.selectedNodes,
        edges: event.payload.selectedEdges,
      });
      if (plan === undefined) {
        appliedSelectionPlan.current = undefined;
        return;
      }
      const framing = JSON.stringify(plan);
      if (framing === appliedSelectionPlan.current) {
        return;
      }
      appliedSelectionPlan.current = framing;
      applyViewportPlan(instance, plan);
    });
  }, [editor]);

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
  // re-measurements must not re-render — that is the feedback loop), live drag
  // positions (canvas state, see `nodesWithDrag`), and removals → removeNode.
  // Positions commit on drag stop.
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      externalOnNodesChange?.(changes);

      const livePositions = dragPositionsFromChanges(changes);
      if (livePositions.size > 0) {
        setDragPositions((current) => {
          const next = new Map(current);
          for (const [id, position] of livePositions) {
            next.set(id, position);
          }
          return next;
        });
      }

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
        const policy = removalPolicy?.() ?? "detach";
        for (const nodeId of removedIds) {
          removeNodeForRemovalPolicy(editor, nodeId, policy);
        }
      } else if (dimsChanged) {
        refresh();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, removalPolicy, refresh],
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
      // The drag is over: from here the document is the only source of
      // positions. Under `"snap-back"` this is what the return animates.
      setDragPositions(NO_DRAG_POSITIONS);
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

  // The frame carries the transition scope only while node moves are animated,
  // so an instant canvas renders exactly the DOM it rendered before the option.
  const frameClassName =
    nodeTransition === "animated"
      ? [className, NODE_TRANSITION_CLASS].filter(Boolean).join(" ")
      : className;

  return (
    <NoderaPortAxisProvider axis={layoutDirection}>
    <NoderaWaypointEditingProvider enabled={edgeWaypointEditing}>
      <NoderaEditorProvider editor={editor}>
        <div
          className={frameClassName}
        style={{ width: "100%", height: "100%" }}
        data-color-mode={colorMode}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {nodeTransition === "animated" && (
          <style data-nodera-node-transition="">{NODE_TRANSITION_STYLE}</style>
        )}
        <ReactFlow
          nodes={nodesWithTypes}
          edges={edges}
          onInit={handleInit}
          nodeTypes={nodeTypes as unknown as NodeTypes}
          edgeTypes={edgeTypes}
          deleteKeyCode={deleteKeyCode}
          // Deletion keeps the canvas' hands off the edges that hang on the
          // removed nodes: their fate is the use case's decision, not React
          // Flow's. Under "detach" `removeNode` takes them with the node in one
          // history unit; under "splice" `removeNodeSplicing` needs them intact
          // to join each predecessor to each successor — without this, React
          // Flow strips them first and a spliced removal finds nothing to join.
          // Standalone selected-edge deletions stay in the list and keep going
          // through `handleEdgesChange`.
          onBeforeDelete={({ nodes: removedNodes, edges: removedEdges }) =>
            Promise.resolve({
              nodes: removedNodes,
              edges: removedEdges.filter(
                (edge) =>
                  !removedNodes.some((node) => node.id === edge.source || node.id === edge.target),
              ),
            })
          }
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
          // The plain boolean is the fallback, never removed: React Flow's own
          // init fit runs only when no framing plan exists, so a configured
          // camera is not overwritten by the generic one a moment later.
          fitView={startPlan === undefined}
          nodesDraggable={dragPolicy !== "locked"}
          nodesConnectable={connectionsPolicy === "editable"}
        >
          <Background {...canvasBackgroundOptions()} />
          <CanvasPlaceholderOverlay
            placeholders={placeholders}
            {...(renderPlaceholder === undefined ? {} : { render: renderPlaceholder })}
          />
          {showMinimap && (
            <MiniMap nodeColor={minimapNodeColor} pannable zoomable />
          )}
          {showControls && <Controls />}
        </ReactFlow>
      </div>
    </NoderaEditorProvider>
    </NoderaWaypointEditingProvider>
    </NoderaPortAxisProvider>
  );
};
