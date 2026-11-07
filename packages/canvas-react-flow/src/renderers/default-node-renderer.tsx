import type { FC } from "react";

import type { NoderaNodeData, NoderaNodeRendererProps } from "./node-renderer-props.js";

/* ------------------------------------------------------------------ */
/*  DefaultNodeRenderer                                                */
/* ------------------------------------------------------------------ */

/**
 * A presentation-only node renderer that reads the shared data
 * contract. It renders:
 *   - an icon glyph when `data.visual.icon` is provided,
 *   - the label (always visible),
 *   - visual hints (`color`, `metadata.backgroundColor`) as inline styles,
 *   - an outline ring when `selected` (accessibility: not colour-only).
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

  const style: React.CSSProperties = {};

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
