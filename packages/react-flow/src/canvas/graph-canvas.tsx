import {
  createElement,
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
  MiniMapNode,
  ConnectionMode,
  EdgeLabelRenderer,
  BaseEdge,
  Handle,
  Position,
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
  type MiniMapNodeProps,
  type OnNodeDrag,
  type ReactFlowInstance,
} from "@xyflow/react";

import type { EditorEngine } from "@nodera/application";
import type { ConnectionsPolicy, DragPolicy, PortsPolicy } from "@nodera/ui-core";
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
/*  Phantom empty state (S7)                                           */
/* ------------------------------------------------------------------ */

/**
 * React Flow id of the presentation-only phantom node.
 *
 * Reserved: it is generated by the canvas and never written to the document,
 * exactly like the edge below, so a host must not reuse it as an instance id.
 */
export const PHANTOM_NODE_ID = "nodera.phantom.node";

/** React Flow id of the presentation-only phantom edge. */
export const PHANTOM_EDGE_ID = "nodera.phantom.edge";

/**
 * Node type of the phantom node.
 *
 * Deliberately outside the renderer registry: a host renderer registry keyed by
 * definition cannot name it, so the placeholder never replaces a real renderer.
 */
const PHANTOM_NODE_RENDERER_ID = "nodera.phantom.node-renderer";

/** Edge type of the phantom edge, outside the edge renderer registry. */
const PHANTOM_EDGE_RENDERER_ID = "nodera.phantom.edge-renderer";

/**
 * Distance between the single real node and the phantom that follows it, in
 * flow units.
 *
 * The canvas cannot see `graph.layout.spacing` (the placement rule lives in the
 * SDK, the geometry in `@nodera/graph-layout`), so the adapter owns this
 * documented numeric default — one visual step beside the node, which is all a
 * placeholder needs.
 */
const PHANTOM_NODE_OFFSET = 240;

/**
 * Style of the phantom node.
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
  // Only the controls inside the phantom take the pointer; the placeholder
  // never hit-tests a real element underneath it.
  pointerEvents: "none",
};

/** Style of the phantom edge: dashed and muted, like the node it leads to. */
const PHANTOM_EDGE_STYLE: CSSProperties = {
  stroke: "var(--ndr-phantom-edge-color, #b6c2cf)",
  strokeWidth: "var(--ndr-edge-stroke-width, 1.5)",
  strokeDasharray: "var(--ndr-phantom-edge-dash, 4 4)",
};

/** Data the phantom node and edge hand to their renderers. */
interface PhantomData {
  /** Node the append follows; absent while the graph is still empty. */
  readonly anchorId?: string;
}

/** The presentation-only elements the canvas adds for the phantom state. */
export interface PhantomElements {
  readonly nodes: readonly RfNode[];
  readonly edges: readonly RfEdge[];
}

/**
 * Derives the phantom empty state from the nodes the document holds (S7).
 *
 * At most one node: a phantom node follows it, plus a phantom edge from it to
 * the placeholder, both carrying the `"+"` affordance so a graph can be grown
 * from scratch. Empty graph: the phantom node alone, with the affordance inside
 * it because there is no edge to put it on. Two nodes or more: nothing.
 *
 * Pure and document-free on purpose: the result is what the canvas appends to
 * the React Flow arrays it renders, never what the engine holds, so the
 * phantoms cannot reach `graph.nodes()`, an event or a history entry. Every
 * capability that would let React Flow write one back (select, drag, delete,
 * connect) is refused, and the ids are reserved so nothing else can collide.
 */
export function phantomGraphElements(
  realNodes: ReadonlyArray<{
    readonly id: string;
    readonly position: { readonly x: number; readonly y: number };
  }>,
): PhantomElements {
  if (realNodes.length > 1) {
    return { nodes: [], edges: [] };
  }

  const anchor = realNodes[0];
  const position =
    anchor === undefined
      ? { x: 0, y: 0 }
      : { x: anchor.position.x + PHANTOM_NODE_OFFSET, y: anchor.position.y };
  const data: Record<string, unknown> = {
    definitionId: PHANTOM_NODE_ID,
    label: "",
    ports: [],
    properties: {},
    ...(anchor === undefined ? {} : { anchorId: anchor.id }),
  };

  const node: RfNode = {
    id: PHANTOM_NODE_ID,
    type: PHANTOM_NODE_RENDERER_ID,
    position,
    data,
    selectable: false,
    draggable: false,
    deletable: false,
    connectable: false,
    focusable: false,
  };

  const edges: readonly RfEdge[] =
    anchor === undefined
      ? []
      : [
          {
            id: PHANTOM_EDGE_ID,
            type: PHANTOM_EDGE_RENDERER_ID,
            source: anchor.id,
            target: PHANTOM_NODE_ID,
            data: { anchorId: anchor.id },
            selectable: false,
            deletable: false,
            focusable: false,
          },
        ];

  return { nodes: [node], edges };
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

/**
 * The phantom node: an inactive placeholder, never a node of the document.
 *
 * It renders the `"+"` only while the graph is empty, because a graph with one
 * node carries the affordance on the phantom edge instead — exactly where the
 * real edge insertion puts it (S6). Otherwise the placeholder is decorative and
 * hidden from assistive technology.
 */
export const PhantomNode: FC<NoderaNodeRendererProps> = ({ data }) => {
  const anchorId = (data as NoderaNodeData & PhantomData).anchorId;
  const isEmptyGraph = anchorId === undefined;

  return (
    <div
      data-nodera-phantom-node="inactive"
      className="nodera-phantom-node"
      style={PHANTOM_NODE_STYLE}
      {...(isEmptyGraph ? {} : { "aria-hidden": true })}
    >
      {isEmptyGraph && <PhantomInsertButton anchorId={undefined} />}
    </div>
  );
};

/**
 * The phantom edge: a dashed, muted connector that ends in the phantom node and
 * carries the same `"+"` as a real edge.
 *
 * The anchor is the real node it starts from, so activating the button inserts
 * the chosen definition in the slot that follows it.
 */
export const PhantomEdge: FC<EdgeProps> = ({ sourceX, sourceY, targetX, targetY, data }) => {
  const anchorId = (data as PhantomData | undefined)?.anchorId;

  return (
    <>
      <BaseEdge
        path={`M ${String(sourceX)},${String(sourceY)} L ${String(targetX)},${String(targetY)}`}
        style={PHANTOM_EDGE_STYLE}
      />
      <EdgeLabelRenderer>
        <div
          data-nodera-phantom-insert-for={anchorId ?? ""}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${String(
              (sourceX + targetX) / 2,
            )}px, ${String((sourceY + targetY) / 2)}px)`,
            pointerEvents: "none",
          }}
        >
          <PhantomInsertButton anchorId={anchorId} />
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

/** The empty phantom set, shared so a canvas without the affordance reuses it. */
const EMPTY_PHANTOM: PhantomElements = { nodes: [], edges: [] };

/**
 * Adds the phantom edge type to the edge type map.
 *
 * Only the phantom edge itself uses it: the map React Flow resolves edge types
 * from is the adapter's, so a host renderer registry cannot replace it and the
 * placeholder cannot be mistaken for an edge of the document.
 */
function withPhantomEdgeType(types: EdgeTypes, phantom: boolean): EdgeTypes {
  if (!phantom) {
    return types;
  }
  return {
    ...types,
    [PHANTOM_EDGE_RENDERER_ID]: PhantomEdge as unknown as EdgeTypes[string],
  };
}

/**
 * Minimap node that skips the phantom.
 *
 * The minimap draws every node React Flow knows, phantoms included, so the
 * adapter filters the placeholder out here: presentation-only geometry must not
 * look like a placed node of the graph.
 */
export function MiniMapNodeWithoutPhantom(props: MiniMapNodeProps): ReactNode {
  if (props.id === PHANTOM_NODE_ID) {
    return null;
  }
  return (
    <g data-nodera-minimap-node={props.id}>
      <MiniMapNode {...props} />
    </g>
  );
}

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
   * Render the "+" affordance centred on every edge (S6).
   *
   * Off by default: the canvas adds no control the host did not ask for.
   * Activating it records the edge as the pending insertion in the UI state and
   * opens the registered node-creation dialog, so a canvas that turns it on
   * needs a `<NoderaUiProvider>` (or its own `renderEdgeInsert`). It adds no
   * document state: the affordance is presentation only.
   *
   * The same flag also paints the phantom empty state (S7): with no node at all
   * the canvas draws a placeholder node carrying the `"+"`, and with exactly one
   * node it adds the placeholder beside it plus a phantom edge with the `"+"` at
   * its midpoint. Those elements exist only in the arrays handed to React Flow —
   * never in the document, the history or the events — and their activation
   * records `UiState.pendingAppendAnchorId` instead of a pending edge. Growing a
   * graph that way is **two** history units for the host (add, then connect),
   * which no part of this adapter claims otherwise.
   */
  readonly edgeInsertion?: boolean;
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

  // Build edgeTypes map: registry renderers + default sentinel. When the
  // affordance is enabled every type is wrapped, so a custom renderer keeps its
  // own "+" instead of losing the feature.
  const edgeTypes = useMemo(
    () =>
      withPhantomEdgeType(
        canvasEdgeTypes(
        edgeRenderers,
        edgeInsertion
          ? {
              render:
                renderEdgeInsert ??
                ((edgeId: string) => <DefaultEdgeInsertButton edgeId={edgeId} />),
            }
          : undefined,
      ),
        edgeInsertion,
      ),
    [edgeRenderers, edgeInsertion, renderEdgeInsert],
  );

  // Phantom empty state (S7): with the affordance enabled and at most one node,
  // the canvas appends a presentation-only node (and edge) to what it renders.
  // Derived, never written: the engine keeps holding 0 or 1 node.
  const phantom = useMemo(
    () => (edgeInsertion ? phantomGraphElements(nodesWithTypes) : EMPTY_PHANTOM),
    [edgeInsertion, nodesWithTypes],
  );

  // The phantom node has its own type, so it is added to the map React Flow
  // resolves node types from — never to the host's renderer registry.
  const canvasNodeTypes = useMemo(
    () =>
      edgeInsertion
        ? { ...nodeTypes, [PHANTOM_NODE_RENDERER_ID]: PhantomNode }
        : nodeTypes,
    [nodeTypes, edgeInsertion],
  );

  const renderedNodes = useMemo(
    () => (phantom.nodes.length === 0 ? nodesWithTypes : [...nodesWithTypes, ...phantom.nodes]),
    [nodesWithTypes, phantom],
  );

  const renderedEdges = useMemo(
    () => (phantom.edges.length === 0 ? edges : [...edges, ...phantom.edges]),
    [edges, phantom],
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
        nodes={renderedNodes}
        edges={renderedEdges}
        onInit={handleInit}
        nodeTypes={canvasNodeTypes as unknown as NodeTypes}
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
        {showMinimap && (
          <MiniMap
            nodeColor={minimapNodeColor}
            nodeComponent={MiniMapNodeWithoutPhantom}
            pannable
            zoomable
          />
        )}
        {showControls && <Controls />}
      </ReactFlow>
    </div>
  );
};
