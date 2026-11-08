import { useState, type CSSProperties, type DragEvent, type ReactNode } from "react";

import type { NodeDefinition } from "@nodera/node-registry";
import { NODE_DEFINITION_MIME_TYPE } from "@nodera/ui-core";

import { useEditorCommands } from "../../bindings/editor-commands.js";
import { useEditorEngine } from "../../providers/ui-provider.js";
import {
  BUTTON_STYLE,
  MUTED_TEXT_STYLE,
  SURFACE_STYLE,
  TEXT_STYLE,
} from "../shell/styles.js";
import {
  groupDefinitions,
  groupDefinitionsByCategory,
  type DefinitionCategoryGroup,
} from "./search.js";

/** Props accepted by {@link NodePalette}. */
export interface NodePaletteProps {
  readonly className?: string;
  /**
   * Host handler for a palette activation. When omitted the palette adds the
   * node itself through the `add-node` command, which is what a host that only
   * wants a default behaviour relies on. A host that needs placement, defaults
   * or confirmation supplies its own handler (S2: the host decides).
   */
  readonly onAddNode?: (definitionId: string) => void;
  /** Copy shown when no definition matches. Defaults to `No node definitions`. */
  readonly emptyMessage?: string;
  /**
   * Definitions to offer. Defaults to the live editor registry, which is what a
   * panel rendered by the shell wants; a surface that offers a narrowed palette
   * (the node-creation dialog, a host-specific picker) passes its own list and
   * still gets the same grouping, filtering and drag payload.
   */
  readonly definitions?: readonly NodeDefinition[];
}

const PALETTE_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
  padding: "var(--ndr-spacing-sm, 4px)",
  gap: "var(--ndr-spacing-sm, 4px)",
  ...SURFACE_STYLE,
  ...TEXT_STYLE,
};

const FILTER_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  justifyContent: "flex-start",
  width: "100%",
  cursor: "text",
  color: "var(--ndr-colors-text, #111827)",
};

const SECTION_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
};

const HEADING_STYLE: CSSProperties = {
  margin: 0,
  padding: "0 var(--ndr-spacing-xs, 2px)",
  ...MUTED_TEXT_STYLE,
  textTransform: "uppercase",
  fontWeight: "var(--ndr-typography-font-weight-bold, 600)",
};

const LIST_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const ITEM_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  justifyContent: "flex-start",
  width: "100%",
  gap: "var(--ndr-spacing-sm, 4px)",
  color: "var(--ndr-colors-text, #111827)",
  textAlign: "start",
};

const ITEM_DESCRIPTION_STYLE: CSSProperties = {
  ...MUTED_TEXT_STYLE,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const EMPTY_STYLE: CSSProperties = {
  margin: 0,
  padding: "var(--ndr-spacing-sm, 4px)",
  ...MUTED_TEXT_STYLE,
};

/**
 * Writes the palette drag payload.
 *
 * The payload is the stable `NODE_DEFINITION_MIME_TYPE` contract from ui-core, so
 * the canvas adapter (Phase 4 `onDropNodeDefinition`) reads it without either
 * side depending on the other (D7). A drag without a `dataTransfer` (keyboard,
 * tests, exotic environments) is tolerated instead of throwing: dragging is a
 * convenience, clicking is the guaranteed path.
 */
function writeDefinitionPayload(
  event: DragEvent<HTMLButtonElement>,
  definitionId: string,
): void {
  const dataTransfer: DataTransfer | null | undefined = event.dataTransfer;
  if (dataTransfer == null) {
    return;
  }
  dataTransfer.setData(NODE_DEFINITION_MIME_TYPE, definitionId);
  dataTransfer.effectAllowed = "copy";
}

function matchesFilter(definition: NodeDefinition, needle: string): boolean {
  if (needle.length === 0) {
    return true;
  }
  return `${definition.name}\n${definition.id}\n${definition.description ?? ""}`
    .toLowerCase()
    .includes(needle);
}

function visibleGroups(
  groups: readonly DefinitionCategoryGroup[],
  needle: string,
): readonly DefinitionCategoryGroup[] {
  const visible: DefinitionCategoryGroup[] = [];
  for (const group of groups) {
    const definitions = group.definitions.filter((definition) =>
      matchesFilter(definition, needle),
    );
    if (definitions.length > 0) {
      visible.push({ category: group.category, definitions });
    }
  }
  return visible;
}

/**
 * Discovery surface of the node definitions the editor registers.
 *
 * It reads the registry of the live editor (never a copy), groups it by
 * category and lets the host either place nodes itself (`onAddNode`) or accept
 * the framework default (`add-node`). It imposes no width, position or layout:
 * the host puts it wherever it wants (S2).
 */
export function NodePalette(props: NodePaletteProps): ReactNode {
  const editor = useEditorEngine();
  const executeCommand = useEditorCommands(editor);
  const [filter, setFilter] = useState("");

  const definitions = props.definitions;
  const needle = filter.trim().toLowerCase();
  const offersDefinitions =
    definitions === undefined ? editor.domain.nodes.size > 0 : definitions.length > 0;
  const groups = visibleGroups(
    definitions === undefined
      ? groupDefinitionsByCategory(editor.domain.nodes)
      : groupDefinitions(definitions),
    needle,
  );

  const activate = (definitionId: string): void => {
    if (props.onAddNode !== undefined) {
      props.onAddNode(definitionId);
      return;
    }
    executeCommand({ kind: "add-node", definitionId });
  };

  return (
    <div
      data-nodera-palette=""
      {...(props.className === undefined ? {} : { className: props.className })}
      style={PALETTE_STYLE}
    >
      {offersDefinitions ? (
        <input
          type="search"
          aria-label="Search nodes"
          placeholder="Search nodes"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
          }}
          style={FILTER_STYLE}
        />
      ) : null}
      {groups.map((group) => (
        <section
          key={group.category}
          data-nodera-palette-category={group.category}
          style={SECTION_STYLE}
        >
          <h3 data-nodera-palette-category-title="" style={HEADING_STYLE}>
            {group.category}
          </h3>
          <ul style={LIST_STYLE}>
            {group.definitions.map((definition) => (
              <li key={definition.id}>
                <button
                  type="button"
                  data-nodera-palette-item={definition.id}
                  aria-label={`Add ${definition.name}`}
                  draggable
                  onDragStart={(event) => {
                    writeDefinitionPayload(event, definition.id);
                  }}
                  onClick={() => {
                    activate(definition.id);
                  }}
                  style={ITEM_STYLE}
                >
                  <span data-nodera-palette-item-name="">{definition.name}</span>
                  {definition.description === undefined ? null : (
                    <span
                      data-nodera-palette-item-description=""
                      style={ITEM_DESCRIPTION_STYLE}
                    >
                      {definition.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {groups.length === 0 ? (
        <p data-nodera-palette-empty="" style={EMPTY_STYLE}>
          {props.emptyMessage ?? "No node definitions"}
        </p>
      ) : null}
    </div>
  );
}
