import type { FC } from "react";

import type { NoderaNodeRendererProps } from "./node-renderer-props.js";

/* ------------------------------------------------------------------ */
/*  Token-driven base styles (D2/D8)                                   */
/* ------------------------------------------------------------------ */

/**
 * Base node style.
 *
 * Every value is a CSS custom property with a literal fallback, so the
 * default renderer is themed by the theme engine (`--ndr-node-*`) and
 * still looks correct with no theme installed. No stylesheet is needed.
 */
const BASE_NODE_STYLE = {
  backgroundColor: "var(--ndr-node-background, #ffffff)",
  borderWidth: "var(--ndr-node-border-width, 1px)",
  borderStyle: "solid",
  borderColor: "var(--ndr-node-border-color, #c7d2e0)",
  borderRadius: "var(--ndr-node-radius, 5px)",
  padding: "var(--ndr-node-padding, 8px)",
  color: "var(--ndr-node-text-color, #111827)",
  fontSize: "var(--ndr-node-font-size, 13px)",
  minWidth: "var(--ndr-node-min-width, 140px)",
} as const;

/** Background used while the node is selected. */
const SELECTED_NODE_BACKGROUND = "var(--ndr-node-background-selected, #eff6ff)";

/**
 * Selection ring. Not colour-only: it is an outline (width + colour) and
 * the renderer additionally exposes a `nodera-node-selected` class and an
 * indicator element for assistive technology.
 */
const SELECTED_NODE_OUTLINE =
  "var(--ndr-selection-outline-width, 2px) solid var(--ndr-selection-outline-color, #2563eb)";

/* ------------------------------------------------------------------ */
/*  DefaultNodeRenderer                                                */
/* ------------------------------------------------------------------ */

/**
 * A presentation-only node renderer that reads the shared data
 * contract. It renders:
 *   - an icon glyph when `data.visual.icon` is provided,
 *   - the label (always visible),
 *   - theme tokens for background/border/spacing/typography,
 *   - an outline ring when `selected` (accessibility: not colour-only),
 *   - definition `visual` hints (colour, background, border) LAST, so an
 *     explicit per-definition style always wins over the theme tokens.
 *
 * It intentionally renders NO port handles: the node-type wrapper
 * (`createNodeType`) owns port rendering for every renderer, so custom
 * renderers get ports for free and ports are never duplicated.
 */
export const DefaultNodeRenderer: FC<NoderaNodeRendererProps> = ({
  data,
  selected,
}) => {
  const { label, visual, definitionId } = data;

  const style: React.CSSProperties = { ...BASE_NODE_STYLE };

  if (selected) {
    style.backgroundColor = SELECTED_NODE_BACKGROUND;
    style.outline = SELECTED_NODE_OUTLINE;
  }

  // Definition visual hints win over the theme tokens.
  const backgroundColor =
    visual?.backgroundColor ??
    (typeof visual?.color === "string" ? visual.color : undefined);
  if (backgroundColor !== undefined) {
    style.backgroundColor = backgroundColor;
  }

  if (visual?.borderColor) {
    style.borderColor = visual.borderColor;
  }

  return (
    <div
      data-nodera-node
      data-nodera-node-definition-id={definitionId}
      style={style}
      className={`nodera-node ${selected ? "nodera-node-selected" : ""}`}
      aria-label={label}
    >
      {/* Accessible selected indicator: outline + pseudo-label. */}
      {selected && (
        <span className="nodera-node-selected-indicator" aria-hidden="true" />
      )}

      {visual?.icon && (
        <span className="nodera-node-icon" aria-label={visual.icon}>
          {visual.icon}
        </span>
      )}

      <span className="nodera-node-label">{label}</span>
    </div>
  );
};
