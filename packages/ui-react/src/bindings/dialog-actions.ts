import { useMemo } from "react";

import { useNoderaUi } from "../providers/ui-provider.js";

/**
 * Dialog actions of the nearest provider.
 *
 * Opening and closing is state, so both actions delegate to the
 * framework-agnostic `UiStateStore`: the store validates the id against its
 * `DialogRegistry`, which means a dialog nobody registered never reaches the
 * state (AGENTS.md §4.5 — presentation translates to commands, it does not own
 * the source of truth).
 */
export interface DialogActions {
  /** Opens the registered dialog with the given id. Unknown ids are ignored. */
  open(dialogId: string): void;
  /** Closes the open dialog, if any. */
  close(): void;
}

/** Binds the dialog store actions to a stable object for React consumers. */
export function useDialogActions(): DialogActions {
  const { store } = useNoderaUi();

  return useMemo<DialogActions>(
    () => ({
      open: (dialogId) => {
        store.openDialog(dialogId);
      },
      close: () => {
        store.closeDialog();
      },
    }),
    [store],
  );
}
