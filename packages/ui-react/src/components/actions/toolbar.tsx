import { Fragment, type CSSProperties, type ReactNode } from "react";

import {
  isToolAvailable,
  type ToolAvailabilityContext,
  type ToolCommand,
  type ToolDefinition,
} from "@nodera/ui-core";

import { useToolAvailability } from "../../bindings/editor-snapshot.js";
import type { CanvasCommandHandlers } from "../../bindings/editor-commands.js";
import {
  useComponentRenderers,
  useToolRegistry,
} from "../../providers/ui-provider.js";
import { BORDER, BUTTON_STYLE, MUTED_TEXT_STYLE, TEXT_STYLE } from "../shell/styles.js";
import { useCommandBinding } from "./command-binding.js";
import { useCommandDispatcher, type CommandDispatch } from "./command-dispatch.js";

/** Renderer id a host replaces to swap the whole toolbar (Level 2, S3). */
export const DEFAULT_TOOLBAR_RENDERER_ID = "nodera.toolbar.default";

/** Class the built-in items put on destructive tools. */
export const TOOLBAR_DANGER_CLASS = "nodera-toolbar-danger";

/** Props accepted by {@link Toolbar}. */
export interface ToolbarProps {
  /** Tools to offer. Defaults to every tool of the host tool registry. */
  readonly tools?: readonly ToolDefinition[];
  readonly className?: string;
  /** Layout axis of the toolbar. Defaults to `horizontal`. */
  readonly orientation?: "horizontal" | "vertical";
  /** Whether each group renders its group name. Defaults to `false`. */
  readonly showGroupLabels?: boolean;
  /** Host hook for commands no editor or layout action handled. */
  readonly onCommand?: (command: ToolCommand) => void;
  /** Host capabilities the canvas-backed commands need. */
  readonly handlers?: CanvasCommandHandlers;
  /** Renderer id resolved in the toolbar renderer registry. */
  readonly rendererId?: string;
}

const TOOLBAR_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-xs, 2px)",
  minWidth: 0,
  padding: "var(--ndr-spacing-xs, 2px)",
  ...TEXT_STYLE,
};

const VERTICAL_STYLE: CSSProperties = {
  flexDirection: "column",
  alignItems: "stretch",
};

const GROUP_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--ndr-spacing-xs, 2px)",
  minWidth: 0,
};

const VERTICAL_GROUP_STYLE: CSSProperties = {
  flexDirection: "column",
  alignItems: "stretch",
};

const SEPARATOR_STYLE: CSSProperties = {
  flexShrink: 0,
  alignSelf: "stretch",
  borderLeft: BORDER,
  margin: "0 var(--ndr-spacing-xs, 2px)",
};

const VERTICAL_SEPARATOR_STYLE: CSSProperties = {
  ...SEPARATOR_STYLE,
  borderLeft: "none",
  borderTop: BORDER,
  margin: "var(--ndr-spacing-xs, 2px) 0",
};

const GROUP_LABEL_STYLE: CSSProperties = {
  ...MUTED_TEXT_STYLE,
  padding: "0 var(--ndr-spacing-xs, 2px)",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const TOOL_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  gap: "var(--ndr-spacing-xs, 2px)",
  color: "var(--ndr-colors-text, #111827)",
};

const DANGER_STYLE: CSSProperties = {
  color: "var(--ndr-colors-danger, #b91c1c)",
};

const ICON_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "var(--ndr-icons-size-md, 16px)",
  lineHeight: 1,
};

interface ToolGroup {
  /** Group id; `undefined` is the bucket of tools that declare none. */
  readonly group: string | undefined;
  readonly tools: readonly ToolDefinition[];
}

/**
 * Groups tools by their declared group, in order of first appearance.
 *
 * Registration order is preserved inside a group and the ungrouped bucket is
 * always last, so two hosts that register the same tools in the same order get
 * the same toolbar (AGENTS.md §12: stable, predictable surfaces).
 */
function groupTools(tools: readonly ToolDefinition[]): readonly ToolGroup[] {
  const groups = new Map<string, ToolDefinition[]>();
  const ungrouped: ToolDefinition[] = [];
  for (const tool of tools) {
    if (tool.group === undefined) {
      ungrouped.push(tool);
      continue;
    }
    const bucket = groups.get(tool.group);
    if (bucket === undefined) {
      groups.set(tool.group, [tool]);
    } else {
      bucket.push(tool);
    }
  }
  const sections: ToolGroup[] = [...groups.entries()].map(([group, grouped]) => ({
    group,
    tools: grouped,
  }));
  if (ungrouped.length > 0) {
    sections.push({ group: undefined, tools: ungrouped });
  }
  return sections;
}

/**
 * Toolbar of the editor.
 *
 * Every item is a declarative `ToolDefinition` from the registry (D4): the
 * toolbar owns presentation only, and activation goes through the shared
 * command dispatcher, so undo, clipboard or layout semantics exist exactly
 * once. A host may replace the whole built-in rendering by registering a
 * component under {@link DEFAULT_TOOLBAR_RENDERER_ID} (S3 Level 2).
 */
export function Toolbar(props: ToolbarProps): ReactNode {
  const registry = useToolRegistry();
  const toolbars = useComponentRenderers().toolbars;
  const { engine } = useCommandBinding();
  const availability = useToolAvailability(engine);
  const dispatch = useCommandDispatcher(props.handlers, props.onCommand);

  const orientation = props.orientation ?? "horizontal";
  const rendererId = props.rendererId ?? DEFAULT_TOOLBAR_RENDERER_ID;
  const tools = props.tools ?? registry.all();
  const Renderer = toolbars.tryGet(rendererId);

  return (
    <div
      data-nodera-toolbar=""
      data-nodera-toolbar-orientation={orientation}
      role="toolbar"
      aria-orientation={orientation}
      {...(props.className === undefined ? {} : { className: props.className })}
      style={orientation === "vertical" ? { ...TOOLBAR_STYLE, ...VERTICAL_STYLE } : TOOLBAR_STYLE}
    >
      {Renderer === undefined ? (
        <ToolbarItems
          tools={tools}
          availability={availability}
          orientation={orientation}
          showGroupLabels={props.showGroupLabels === true}
          onCommand={dispatch}
        />
      ) : (
        <Renderer tools={tools} availability={availability} onCommand={dispatch} />
      )}
    </div>
  );
}

interface ToolbarItemsProps {
  readonly tools: readonly ToolDefinition[];
  readonly availability: ToolAvailabilityContext;
  readonly orientation: "horizontal" | "vertical";
  readonly showGroupLabels: boolean;
  readonly onCommand: CommandDispatch;
}

/** Built-in items: groups, separators and one button per tool. */
function ToolbarItems(props: ToolbarItemsProps): ReactNode {
  const sections = groupTools(props.tools);
  const vertical = props.orientation === "vertical";
  const itemStyle = vertical ? { ...GROUP_STYLE, ...VERTICAL_GROUP_STYLE } : GROUP_STYLE;

  if (!sections.some((section) => section.group !== undefined)) {
    return (
      <>
        {props.tools.map((tool) => (
          <ToolButton
            key={tool.id}
            tool={tool}
            availability={props.availability}
            onCommand={props.onCommand}
          />
        ))}
      </>
    );
  }

  return (
    <>
      {sections.map((section, index) => (
        <Fragment key={section.group ?? "ungrouped"}>
          {index === 0 ? null : (
            <span
              data-nodera-toolbar-separator=""
              aria-hidden="true"
              style={vertical ? VERTICAL_SEPARATOR_STYLE : SEPARATOR_STYLE}
            />
          )}
          <div
            {...(section.group === undefined
              ? { "data-nodera-toolbar-ungrouped": "" }
              : { "data-nodera-toolbar-group": section.group })}
            role="group"
            {...(section.group === undefined ? {} : { "aria-label": section.group })}
            style={itemStyle}
          >
            {props.showGroupLabels && section.group !== undefined ? (
              <span data-nodera-toolbar-group-label="" style={GROUP_LABEL_STYLE}>
                {section.group}
              </span>
            ) : null}
            {section.tools.map((tool) => (
              <ToolButton
                key={tool.id}
                tool={tool}
                availability={props.availability}
                onCommand={props.onCommand}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </>
  );
}

interface ToolButtonProps {
  readonly tool: ToolDefinition;
  readonly availability: ToolAvailabilityContext;
  readonly onCommand: CommandDispatch;
}

/** One toolbar item: a labelled button the dispatcher runs on activation. */
function ToolButton(props: ToolButtonProps): ReactNode {
  const danger = props.tool.danger === true;
  return (
    <button
      type="button"
      data-nodera-tool={props.tool.id}
      aria-label={props.tool.label}
      title={props.tool.description ?? props.tool.label}
      disabled={!isToolAvailable(props.tool, props.availability)}
      className={danger ? TOOLBAR_DANGER_CLASS : undefined}
      onClick={() => {
        props.onCommand(props.tool.command);
      }}
      style={danger ? { ...TOOL_STYLE, ...DANGER_STYLE } : TOOL_STYLE}
    >
      {props.tool.icon === undefined ? null : (
        <span data-nodera-tool-icon="" aria-hidden="true" style={ICON_STYLE}>
          {props.tool.icon}
        </span>
      )}
      <span data-nodera-tool-label="">{props.tool.label}</span>
    </button>
  );
}
