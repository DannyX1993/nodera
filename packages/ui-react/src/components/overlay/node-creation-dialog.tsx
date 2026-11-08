import type { ReactNode } from "react";

import type { NodeDefinition } from "@nodera/node-registry";
import {
  CREATE_NODE_DIALOG,
  NODERA_CREATE_NODE_DIALOG_ID,
  type DialogDefinition,
} from "@nodera/ui-core";

import { useEditorCommands } from "../../bindings/editor-commands.js";
import { useDialogActions } from "../../bindings/dialog-actions.js";
import { useEditorEngine, useNoderaUi, useUiState } from "../../providers/ui-provider.js";
import { NodePalette } from "../discovery/node-palette.js";
import { Dialog } from "./dialog.js";

/**
 * Starts an edge insertion and opens the node-creation dialog for it.
 *
 * The edge is *presentation* state: it is written to the UI store so the dialog
 * knows which edge the chosen definition belongs to, and it is cleared when the
 * dialog closes. A canvas affordance — the framework's `+` or the component a
 * host renders instead — calls `begin`; nothing here knows where the edge is
 * drawn.
 */
export interface EdgeInsertActions {
  /** Records the edge as the pending insertion and opens the creation dialog. */
  begin(edgeId: string): void;
}

/** Binds the pending edge insertion to the UI store and the dialog actions. */
export function useEdgeInsertActions(): EdgeInsertActions {
  const { store } = useNoderaUi();
  const dialogs = useDialogActions();

  return {
    begin: (edgeId) => {
      store.setPendingEdgeInsertId(edgeId);
      dialogs.open(NODERA_CREATE_NODE_DIALOG_ID);
    },
  };
}

/** Props accepted by {@link NodeCreationDialog}. */
export interface NodeCreationDialogProps {
  /**
   * Whether the dialog is open. Fully controlled: the host opens and closes it,
   * normally through `UiStateStore.activeDialogId` / `useDialogActions` (S14).
   */
  readonly open: boolean;
  /** Called when the dialog is dismissed or a definition was selected. */
  readonly onClose: () => void;
  /**
   * Definition the renderer presents. Defaults to the built-in
   * `CREATE_NODE_DIALOG`; a host replaces it to reword or resize the surface,
   * and the accessible name always comes from the definition title.
   */
  readonly definition?: DialogDefinition;
  /**
   * Definitions the surface offers. Defaults to the live editor registry — the
   * same vocabulary the node palette panel shows.
   */
  readonly definitions?: readonly NodeDefinition[];
  /**
   * Host handler for a selection. When omitted the dialog dispatches the
   * `{ kind: "insert-node", edgeId, definitionId }` command while an edge
   * insertion is pending and `{ kind: "add-node", definitionId }` otherwise,
   * through the editor command bus, exactly like the palette does. A host that
   * needs placement or confirmation supplies its own handler (S2).
   */
  readonly onAddNode?: (definitionId: string) => void;
  /** Copy shown when no definition matches. Defaults to the palette copy. */
  readonly emptyMessage?: string;
}

/**
 * Node-creation dialog: the registered node palette inside the dialog primitive.
 *
 * It is a composition, not a second creation path (S15): the definitions come
 * from the editor registry the palette already reads, the selection runs the
 * same `add-node` / `insert-node` command (or the host's `onAddNode` override),
 * and the surface is the accessible `Dialog`. The dialog closes on a selection
 * the graph accepted; a refused add leaves it open so the user can pick another
 * definition.
 *
 * Two creation paths, one dialog: a selection inserts into the edge an affordance
 * recorded (`UiState.pendingEdgeInsertId`) and adds a node otherwise, so an edge
 * `+` and the toolbar `+` never need two surfaces. The pending edge is cleared as
 * soon as the insertion is accepted, and the store clears it on close, so a
 * closed dialog can never make the next add insert somewhere unexpected.
 *
 * Visual composition only: no state, no layout and no focus handling of its
 * own. Focus lands on the palette search field because that is the first
 * control inside `Dialog`, and `Escape` closes it because the built-in
 * definition is dismissible.
 */
export function NodeCreationDialog(props: NodeCreationDialogProps): ReactNode {
  const editor = useEditorEngine();
  const { store } = useNoderaUi();
  const executeCommand = useEditorCommands(editor);
  const pendingEdgeInsertId = useUiState().pendingEdgeInsertId;
  const close = props.onClose;

  const select = (definitionId: string): void => {
    let accepted = true;
    if (props.onAddNode !== undefined) {
      props.onAddNode(definitionId);
    } else if (pendingEdgeInsertId !== undefined) {
      accepted = executeCommand({
        kind: "insert-node",
        edgeId: pendingEdgeInsertId,
        definitionId,
      });
    } else {
      accepted = executeCommand({ kind: "add-node", definitionId });
    }
    if (accepted) {
      // The insertion is done, so its pending edge must not outlive it: a later
      // `add-node` from the palette would otherwise insert into that edge.
      store.setPendingEdgeInsertId(undefined);
      close();
    }
  };

  return (
    <Dialog definition={props.definition ?? CREATE_NODE_DIALOG} open={props.open} onClose={close}>
      <NodePalette
        onAddNode={select}
        {...(props.definitions === undefined ? {} : { definitions: props.definitions })}
        {...(props.emptyMessage === undefined ? {} : { emptyMessage: props.emptyMessage })}
      />
    </Dialog>
  );
}
