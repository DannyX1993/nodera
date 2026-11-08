import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import {
  resolveDialogDefaults,
  type DialogDefinition,
  type DialogSize,
} from "@nodera/ui-core";

import {
  BORDER,
  MUTED_TEXT_STYLE,
  RADIUS,
  SHADOW_SM,
  SURFACE_STYLE,
  TEXT_STYLE,
} from "../shell/styles.js";

/** Base class of the rendered dialog panel. */
export const DIALOG_BASE_CLASS = "nodera-dialog";

/** Class the renderer adds for a size token, e.g. `nodera-dialog-size-lg`. */
export function dialogSizeClass(size: DialogSize): string {
  return `nodera-dialog-size-${size}`;
}

/**
 * Elements the focus trap cycles through.
 *
 * Disabled controls are excluded because they are not focusable; the dialog
 * root itself is excluded too (`tabindex="-1"`) since it is only the fallback
 * target of a dialog that holds no control at all.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(root: HTMLElement): readonly HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
}

const BACKDROP_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--ndr-spacing-lg, 16px)",
  background: "var(--ndr-colors-backdrop, rgba(15, 23, 42, 0.45))",
  zIndex: 2,
};

/** Width of each size token; a host overrides them with its own custom properties. */
const SIZE_WIDTHS: Readonly<Record<DialogSize, string>> = {
  sm: "var(--ndr-dialog-size-sm, 20rem)",
  md: "var(--ndr-dialog-size-md, 28rem)",
  lg: "var(--ndr-dialog-size-lg, 40rem)",
};

function panelStyle(size: DialogSize): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: "var(--ndr-spacing-sm, 4px)",
    width: "100%",
    maxWidth: SIZE_WIDTHS[size],
    maxHeight: "100%",
    overflowY: "auto",
    padding: "var(--ndr-spacing-md, 8px)",
    border: BORDER,
    borderRadius: RADIUS,
    boxShadow: SHADOW_SM,
    ...SURFACE_STYLE,
    ...TEXT_STYLE,
  };
}

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "var(--ndr-typography-font-size-lg, 15px)",
  fontWeight: 600,
};

/** Props accepted by {@link Dialog}. */
export interface DialogProps {
  /** Definition the renderer presents. Resolved by the host from the registry. */
  readonly definition: DialogDefinition;
  /**
   * Whether the dialog is open. The dialog is fully controlled: opening and
   * closing belong to the host through `UiStateStore` (`openDialog` /
   * `closeDialog`), never to internal state.
   */
  readonly open: boolean;
  /** Called when the user dismisses the dialog. Ignored when not dismissible. */
  readonly onClose: () => void;
  /** Dialog content. The controls it renders are what keyboard users traverse. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * Accessible dialog primitive for one {@link DialogDefinition}.
 *
 * Accessibility is built in, not delegated to the host (AGENTS.md §15): the
 * surface is `role="dialog"` + `aria-modal`, its accessible name is the
 * definition title, the description is wired with `aria-describedby` when the
 * definition declares one, focus moves to the first control on open, `Tab` and
 * `Shift+Tab` wrap inside the panel, and focus returns to the element that had
 * it before opening. `Escape` and a backdrop click close the dialog **only**
 * when the definition is dismissible.
 *
 * The component owns no state: it renders what the host tells it to render and
 * reports dismissal through `onClose`, so the UI store stays the single source
 * of truth (AGENTS.md §4.5) and the same definition renders in any adapter.
 *
 * Visuals come from the theme tokens every other component uses; nothing here
 * hard-codes a colour.
 */
export function Dialog(props: DialogProps): ReactNode {
  const defaults = resolveDialogDefaults(props.definition);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const open = props.open;

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement;
    restoreRef.current = previous instanceof HTMLElement ? previous : null;
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const [first] = focusableElements(root);
    (first ?? root).focus();
    return () => {
      const restore = restoreRef.current;
      restoreRef.current = null;
      if (restore !== null && restore.isConnected) {
        restore.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const definition = props.definition;
  const description = definition.description;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      if (defaults.dismissible) {
        props.onClose();
      }
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const focusable = focusableElements(root);
    if (focusable.length === 0) {
      event.preventDefault();
      root.focus();
      return;
    }
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    const active = document.activeElement;
    const outside = active === null || !root.contains(active);
    if (event.shiftKey) {
      if (outside || active === first) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (outside || active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget || !defaults.dismissible) {
      return;
    }
    props.onClose();
  };

  const className = [DIALOG_BASE_CLASS, dialogSizeClass(defaults.size), props.className]
    .filter((name): name is string => name !== undefined && name !== "")
    .join(" ");

  return (
    <div
      data-nodera-dialog-backdrop=""
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      style={BACKDROP_STYLE}
    >
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(description === undefined ? {} : { "aria-describedby": descriptionId })}
        data-nodera-dialog={definition.id}
        data-nodera-dialog-size={defaults.size}
        className={className}
        tabIndex={-1}
        style={panelStyle(defaults.size)}
      >
        <h2 id={titleId} data-nodera-dialog-title="" style={TITLE_STYLE}>
          {definition.title}
        </h2>
        {description === undefined ? null : (
          <p id={descriptionId} data-nodera-dialog-description="" style={{ margin: 0, ...MUTED_TEXT_STYLE }}>
            {description}
          </p>
        )}
        {props.children}
      </div>
    </div>
  );
}
