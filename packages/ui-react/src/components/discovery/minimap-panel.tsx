import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

import { useEditorCommands } from "../../bindings/editor-commands.js";
import { useEditorSnapshot } from "../../bindings/editor-snapshot.js";
import { useEditorEngine } from "../../providers/ui-provider.js";
import { SURFACE_STYLE } from "../shell/styles.js";
import { nodeDisplayLabel } from "./search.js";

/** Node box the projection falls back to when a node declares no size. */
const DEFAULT_NODE_WIDTH = 120;
const DEFAULT_NODE_HEIGHT = 60;

/** Minimal node input of {@link projectNodes}: presentation position only. */
export interface MinimapNodeInput {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
}

/** Panel area the projection has to fit into. */
export interface MinimapArea {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
}

/** One projected node box, in minimap coordinates. */
export interface MinimapBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Result of {@link projectNodes}. */
export interface MinimapProjection {
  readonly nodes: readonly MinimapBox[];
  readonly empty: boolean;
}

/** Props accepted by {@link MinimapPanel}. */
export interface MinimapPanelProps {
  readonly className?: string;
  /** Width of the overview in pixels. Defaults to 220. */
  readonly width?: number;
  /** Height of the overview in pixels. Defaults to 140. */
  readonly height?: number;
  /** Inner margin kept free around the projected graph. Defaults to 12. */
  readonly padding?: number;
}

const SELECTED_CLASS = "nodera-minimap-selected";

const SVG_STYLE: CSSProperties = {
  display: "block",
  borderRadius: "var(--ndr-borders-radius-md, 5px)",
  border: "var(--ndr-borders-width, 1px) solid var(--ndr-colors-border, #d8dee9)",
  ...SURFACE_STYLE,
};

const LABEL_STYLE: CSSProperties = {
  fill: "var(--ndr-colors-text-muted, #5b6472)",
  fontSize: "var(--ndr-typography-font-size-sm, 11px)",
  fontFamily: "var(--ndr-typography-font-family, system-ui)",
};

/**
 * Projects graph positions into the minimap area.
 *
 * The projection is a uniform scale of the graph bounding box, so the overview
 * keeps the shape of the graph (both axes share one factor) and every box stays
 * inside the padded area. Degenerate input (no nodes, a single point, a node
 * without a size, an area smaller than its padding) produces finite,
 * non-negative boxes instead of `NaN` or negative widths.
 */
export function projectNodes(
  nodes: readonly MinimapNodeInput[],
  options: MinimapArea,
): MinimapProjection {
  const boxes = nodes.map((node) => ({
    id: node.id,
    x: finiteOr(node.x, 0),
    y: finiteOr(node.y, 0),
    width: Math.max(0, finiteOr(node.width ?? DEFAULT_NODE_WIDTH, DEFAULT_NODE_WIDTH)),
    height: Math.max(0, finiteOr(node.height ?? DEFAULT_NODE_HEIGHT, DEFAULT_NODE_HEIGHT)),
  }));
  if (boxes.length === 0) {
    return { nodes: [], empty: true };
  }

  const padding = Math.max(0, finiteOr(options.padding, 0));
  const innerWidth = Math.max(0, finiteOr(options.width, 0) - padding * 2);
  const innerHeight = Math.max(0, finiteOr(options.height, 0) - padding * 2);

  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const spanX = right - left;
  const spanY = bottom - top;

  const scale = scaleFor(spanX, spanY, innerWidth, innerHeight);
  const offsetX = padding + (innerWidth - spanX * scale) / 2;
  const offsetY = padding + (innerHeight - spanY * scale) / 2;

  return {
    nodes: boxes.map((box) => ({
      id: box.id,
      x: offsetX + (box.x - left) * scale,
      y: offsetY + (box.y - top) * scale,
      width: box.width * scale,
      height: box.height * scale,
    })),
    empty: false,
  };
}

function scaleFor(
  spanX: number,
  spanY: number,
  innerWidth: number,
  innerHeight: number,
): number {
  const candidates: number[] = [];
  if (spanX > 0) {
    candidates.push(innerWidth / spanX);
  }
  if (spanY > 0) {
    candidates.push(innerHeight / spanY);
  }
  // No extent at all (a single point, or boxes without size): there is nothing
  // to fit, so the projection stays unscaled instead of dividing by zero.
  if (candidates.length === 0) {
    return 1;
  }
  return Math.min(...candidates);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampSize(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.max(1, value);
}

/**
 * Plain SVG overview of the graph positions and selection (D6).
 *
 * It is deliberately not a React Flow `MiniMap`: ui-react must never import the
 * canvas adapter, so the minimap panel reads the portable node positions and
 * projects them itself. Viewport/zoom stays canvas state and is not represented
 * here, because it belongs to the adapter (S5).
 */
export function MinimapPanel(props: MinimapPanelProps): ReactNode {
  const editor = useEditorEngine();
  const executeCommand = useEditorCommands(editor);
  const snapshot = useEditorSnapshot(editor);

  const width = clampSize(props.width, 220);
  const height = clampSize(props.height, 140);
  const padding = props.padding ?? 12;

  const nodes = editor.graph.getNodes();
  const projection = projectNodes(
    nodes.map((node) => ({
      id: node.id,
      x: node.position?.x ?? 0,
      y: node.position?.y ?? 0,
    })),
    { width, height, padding },
  );
  const labels = new Map<string, string>(
    nodes.map((node) => [node.id, nodeDisplayLabel(editor, node)]),
  );

  const select = (nodeId: string): void => {
    executeCommand({ kind: "select-node", nodeId });
  };

  return (
    <svg
      data-nodera-minimap=""
      {...(props.className === undefined ? {} : { className: props.className })}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label="Minimap"
      style={SVG_STYLE}
    >
      {projection.empty ? (
        <text
          data-nodera-minimap-empty=""
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          style={LABEL_STYLE}
        >
          No nodes to show
        </text>
      ) : (
        projection.nodes.map((box) => {
          const selected = snapshot.selectedNodes.includes(box.id);
          const label = labels.get(box.id) ?? box.id;
          return (
            <rect
              key={box.id}
              data-nodera-minimap-node={box.id}
              aria-label={label}
              role="button"
              tabIndex={0}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx={2}
              fill="var(--ndr-colors-surface-alt, #f1f5f9)"
              stroke={
                selected
                  ? "var(--ndr-selection-outline-color, #2563eb)"
                  : "var(--ndr-colors-border, #d8dee9)"
              }
              strokeWidth={selected ? 2 : 1}
              {...(selected ? { className: SELECTED_CLASS } : {})}
              style={{ cursor: "pointer" }}
              onClick={() => {
                select(box.id);
              }}
              onKeyDown={(event: KeyboardEvent<SVGRectElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select(box.id);
                }
              }}
            />
          );
        })
      )}
    </svg>
  );
}
