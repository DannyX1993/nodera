import type { FC } from "react";

import { PortHandle } from "./port-renderer";
import type { NoderaNodeData, NoderaNodeRendererProps } from "./node-renderer-props";

/* ------------------------------------------------------------------ */
/*  DefaultNodeRenderer                                                */
/* ------------------------------------------------------------------ */

/**
 * A presentation-only node renderer that reads the shared data
 * contract.  It renders:
 *   - an icon glyph when `data.visual.icon` is provided,
 *   - the label (always visible),
 *   - one {@link PortHandle} per port entry,
 *   - visual hints (`backgroundColor`, `borderColor`) as inline styles,
 *   - an outline ring when `selected` (accessibility: not colour-only).
 */
export const DefaultNodeRenderer: FC<NoderaNodeRendererProps> = ({
  data,
  selected,
}) => {
  const { label, ports, visual, definitionId } = data;

  const style: React.CSSProperties = {};

  if (visual?.backgroundColor) {
    style.backgroundColor = visual.backgroundColor;
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

      {ports.map((port) => (
        <PortHandle
          key={port.id}
          portId={port.id}
          direction={port.direction}
          {...(port.name !== undefined && { name: port.name })}
        />
      ))}
    </div>
  );
};