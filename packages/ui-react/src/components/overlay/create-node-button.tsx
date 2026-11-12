import type { CSSProperties, ReactNode } from "react";

import { NODERA_CREATE_NODE_DIALOG_ID } from "@nodera/ui-core";

import { useDialogActions } from "../../bindings/dialog-actions.js";
import { useTranslate } from "../../providers/locale-provider.js";
import { BUTTON_STYLE } from "../shell/styles.js";

/** Props accepted by {@link CreateNodeButton}. */
export interface CreateNodeButtonProps {
  /**
   * Accessible name of the button. Defaults to the catalog's `actions.addNode`;
   * the visible glyph stays "+" unless the host supplies its own content.
   */
  readonly label?: string;
  /** Content the host renders inside the button. Defaults to the "+" glyph. */
  readonly children?: ReactNode;
  /** Host class. The button imposes no width, position or margin of its own. */
  readonly className?: string;
  readonly disabled?: boolean;
}

const CREATE_NODE_BUTTON_STYLE: CSSProperties = BUTTON_STYLE;

/**
 * "+" affordance that opens the node-creation dialog.
 *
 * It is deliberately thin: a native `button` (so `Enter` and `Space` activate it
 * without a key handler of its own), `aria-haspopup="dialog"`, an accessible
 * label, and one call to `useDialogActions().open` with the built-in
 * {@link NODERA_CREATE_NODE_DIALOG_ID}. It owns no state, no focus and no
 * layout, and it does not render the dialog: the host composes
 * `NodeCreationDialog` and decides where both live (S2, S4).
 *
 * The open goes through the UI store, which validates the id against its
 * `DialogRegistry`, so a store without a registry opens nothing instead of
 * rendering a dialog nobody registered.
 */
export function CreateNodeButton(props: CreateNodeButtonProps): ReactNode {
  const dialogs = useDialogActions();
  const t = useTranslate();

  return (
    <button
      type="button"
      data-nodera-create-node=""
      aria-haspopup="dialog"
      aria-label={props.label ?? t("actions.addNode")}
      {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
      {...(props.className === undefined ? {} : { className: props.className })}
      onClick={() => {
        dialogs.open(NODERA_CREATE_NODE_DIALOG_ID);
      }}
      style={CREATE_NODE_BUTTON_STYLE}
    >
      {props.children ?? "+"}
    </button>
  );
}
