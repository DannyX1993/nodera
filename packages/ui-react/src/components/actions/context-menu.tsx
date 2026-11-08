import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import {
  isToolAvailable,
  type MenuTargetKind,
  type ToolAvailabilityContext,
  type ToolCommand,
  type ToolDefinition,
} from "@nodera/ui-core";

import { useToolAvailability } from "../../bindings/editor-snapshot.js";
import type { CanvasCommandHandlers } from "../../bindings/editor-commands.js";
import { useUiStateActions } from "../../bindings/ui-state-actions.js";
import {
  useToolRegistry,
  useUiState,
} from "../../providers/ui-provider.js";
import {
  BUTTON_STYLE,
  MUTED_TEXT_STYLE,
  RADIUS,
  SHADOW_SM,
  SURFACE_STYLE,
  TEXT_STYLE,
} from "../shell/styles.js";
import { useCommandBinding } from "./command-binding.js";
import { useCommandDispatcher } from "./command-dispatch.js";

/** Props accepted by {@link ContextMenu}. */
export interface ContextMenuProps {
  /** Items to offer. Defaults to the registry tools the target kind accepts. */
  readonly items?: readonly ToolDefinition[];
  readonly className?: string;
  /** Host hook for commands no editor or layout action handled. */
  readonly onCommand?: (command: ToolCommand) => void;
  /** Host capabilities the canvas-backed commands need. */
  readonly handlers?: CanvasCommandHandlers;
}

/** Class the built-in items put on destructive tools. */
export const CONTEXT_MENU_DANGER_CLASS = "nodera-context-menu-danger";

const MENU_STYLE: CSSProperties = {
  position: "fixed",
  display: "flex",
  flexDirection: "column",
  gap: "var(--ndr-spacing-xs, 2px)",
  minWidth: 160,
  padding: "var(--ndr-spacing-xs, 2px)",
  border: "var(--ndr-borders-width, 1px) solid var(--ndr-colors-border, #d8dee9)",
  borderRadius: RADIUS,
  boxShadow: SHADOW_SM,
  zIndex: 1,
  ...SURFACE_STYLE,
  ...TEXT_STYLE,
};

const ITEM_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  justifyContent: "flex-start",
  width: "100%",
  color: "var(--ndr-colors-text, #111827)",
  textAlign: "start",
};

const DANGER_STYLE: CSSProperties = {
  color: "var(--ndr-colors-danger, #b91c1c)",
};

const DISABLED_STYLE: CSSProperties = {
  ...MUTED_TEXT_STYLE,
  cursor: "default",
};

const EMPTY_STYLE: CSSProperties = {
  margin: 0,
  padding: "var(--ndr-spacing-sm, 4px)",
  ...MUTED_TEXT_STYLE,
};

/**
 * Whether a target kind may offer a tool at all.
 *
 * This is a *shape* rule, not an evaluation: a node menu can never usefully
 * offer a clipboard action, while a pane menu only offers unconditional tools.
 * Whether the offered tool is enabled is decided afterwards by
 * `isToolAvailable` against the live editor facts, so a tool that does not
 * apply right now is shown disabled instead of disappearing from one menu to
 * the next.
 */
function offersTarget(tool: ToolDefinition, target: MenuTargetKind): boolean {
  const rule = tool.availability ?? "always";
  switch (target) {
    case "node":
      return rule === "always" || rule === "selection" || rule === "node-selection";
    case "edge":
      return rule === "always" || rule === "selection" || rule === "edge-selection";
    case "pane":
    case "canvas":
      return rule === "always";
  }
}

/**
 * Context menu of the current UI state.
 *
 * The open menu (target kind, target id and pointer position) lives in the UI
 * store (S5: "Menús abiertos" is presentation state and never enters the
 * document), so any host surface can open it and this component only renders
 * what the store says. Escape and a pointerdown outside close it through the
 * same store action every other closer uses.
 */
export function ContextMenu(props: ContextMenuProps): ReactNode {
  const state = useUiState();
  const registry = useToolRegistry();
  const actions = useUiStateActions();
  const { engine } = useCommandBinding();
  const availability = useToolAvailability(engine);
  const dispatch = useCommandDispatcher(props.handlers, props.onCommand);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menu = state.menu;

  useEffect(() => {
    if (menu === undefined) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        actions.closeMenu();
      }
    };
    const onPointerDown = (event: Event): void => {
      const root = menuRef.current;
      const target = event.target;
      if (root !== null && target instanceof globalThis.Node && root.contains(target)) {
        return;
      }
      actions.closeMenu();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menu, actions]);

  useEffect(() => {
    if (menu === undefined) {
      return;
    }
    const root = menuRef.current;
    if (root === null) {
      return;
    }
    const first = root.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
    first?.focus();
  }, [menu]);

  if (menu === undefined) {
    return null;
  }

  const tools = props.items ?? registry.all().filter((tool) => offersTarget(tool, menu.targetKind));

  return (
    <div
      ref={menuRef}
      role="menu"
      data-nodera-context-menu=""
      data-nodera-context-target={menu.targetKind}
      {...(menu.targetId === "" ? {} : { "data-nodera-context-id": menu.targetId })}
      {...(props.className === undefined ? {} : { className: props.className })}
      style={{
        ...MENU_STYLE,
        left: menu.position.x,
        top: menu.position.y,
      }}
    >
      {tools.length === 0 ? (
        <p data-nodera-context-menu-empty="" style={EMPTY_STYLE}>
          No actions
        </p>
      ) : (
        tools.map((tool) => (
          <MenuButton
            key={tool.id}
            tool={tool}
            availability={availability}
            onActivate={() => {
              dispatch(tool.command);
              actions.closeMenu();
            }}
          />
        ))
      )}
    </div>
  );
}

interface MenuButtonProps {
  readonly tool: ToolDefinition;
  readonly availability: ToolAvailabilityContext;
  readonly onActivate: () => void;
}

/** One menu entry: a `menuitem` button, disabled when the tool does not apply. */
function MenuButton(props: MenuButtonProps): ReactNode {
  const danger = props.tool.danger === true;
  const enabled = isToolAvailable(props.tool, props.availability);
  const style = !enabled
    ? { ...ITEM_STYLE, ...DISABLED_STYLE }
    : danger
      ? { ...ITEM_STYLE, ...DANGER_STYLE }
      : ITEM_STYLE;
  return (
    <button
      type="button"
      role="menuitem"
      data-nodera-menu-item={props.tool.id}
      aria-label={props.tool.label}
      title={props.tool.description ?? props.tool.label}
      disabled={!enabled}
      className={danger ? CONTEXT_MENU_DANGER_CLASS : undefined}
      onClick={props.onActivate}
      style={style}
    >
      {props.tool.icon === undefined ? null : (
        <span data-nodera-menu-item-icon="" aria-hidden="true">
          {props.tool.icon}
        </span>
      )}
      <span>{props.tool.label}</span>
    </button>
  );
}
