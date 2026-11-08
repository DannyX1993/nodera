import type { ReactNode } from "react";

import type { NodeDefinition } from "@nodera/node-registry";
import { CREATE_NODE_DIALOG, type DialogDefinition } from "@nodera/ui-core";

import { useEditorCommands } from "../../bindings/editor-commands.js";
import { useEditorEngine } from "../../providers/ui-provider.js";
import { NodePalette } from "../discovery/node-palette.js";
import { Dialog } from "./dialog.js";

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
   * `{ kind: "add-node", definitionId }` command through the editor command bus,
   * exactly like the palette does. A host that needs placement or confirmation
   * supplies its own handler (S2).
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
 * same `add-node` command (or the host's `onAddNode` override), and the surface
 * is the accessible `Dialog`. The dialog closes on a selection the graph
 * accepted; a refused add leaves it open so the user can pick another
 * definition.
 *
 * Visual composition only: no state, no layout and no focus handling of its
 * own. Focus lands on the palette search field because that is the first
 * control inside `Dialog`, and `Escape` closes it because the built-in
 * definition is dismissible.
 */
export function NodeCreationDialog(props: NodeCreationDialogProps): ReactNode {
  const editor = useEditorEngine();
  const executeCommand = useEditorCommands(editor);
  const close = props.onClose;

  const select = (definitionId: string): void => {
    let accepted = true;
    if (props.onAddNode !== undefined) {
      props.onAddNode(definitionId);
    } else {
      accepted = executeCommand({ kind: "add-node", definitionId });
    }
    if (accepted) {
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
