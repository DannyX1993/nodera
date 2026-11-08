import type { DialogDefinition } from "../dialog-definition.js";

/**
 * Stable id of the built-in node-creation dialog.
 *
 * Qualified like every other Nodera id (`vendor.feature`), so a host can open
 * exactly this dialog and a plugin can never collide with it by accident.
 */
export const NODERA_CREATE_NODE_DIALOG_ID = "nodera.dialog.create-node";

/**
 * Dialog a host can open to choose which node definition to add.
 *
 * It is the declarative half of S2: the definition says what the dialog *is*
 * (a titled, dismissible, wide surface for choosing a node), the `ui-react`
 * `NodeCreationDialog` composes the registered node palette inside it and the
 * `CreateNodeButton` "+" affordance opens it by id. Nothing here knows React,
 * the palette or the command bus (AGENTS.md §4.5, §7).
 */
export const CREATE_NODE_DIALOG: DialogDefinition = Object.freeze({
  id: NODERA_CREATE_NODE_DIALOG_ID,
  title: "Create node",
  description: "Pick the node definition to add to the graph.",
  size: "lg",
  dismissible: true,
});

/**
 * Dialogs the framework ships as starting points.
 *
 * A host replaces the whole list by passing its own to `new DialogRegistry({
 * dialogs })`, which is how a host removes a built-in dialog it does not want:
 * the registry seeds exactly this list and nothing else.
 */
export const DEFAULT_DIALOGS: readonly DialogDefinition[] = Object.freeze([
  CREATE_NODE_DIALOG,
]) as readonly DialogDefinition[];
