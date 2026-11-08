/**
 * Palette → canvas drag & drop contract (D7).
 *
 * The host owns the palette and writes the dragged data; the canvas only
 * understands one stable MIME payload (the node definition id), so no
 * function, component or React Flow object ever travels through the drop.
 */

import { NODE_DEFINITION_MIME_TYPE as SHARED_NODE_DEFINITION_MIME_TYPE } from "@nodera/ui-core";

/** MIME type carrying a node definition id from a palette drag (shared ui contract). */
export const NODE_DEFINITION_MIME_TYPE = SHARED_NODE_DEFINITION_MIME_TYPE;

/** Narrow structural view of the drag payload the canvas reads. */
interface DataTransferReader {
  getData(type: string): string;
}

/** Narrow structural view of the drag payload type announcement. */
interface DataTransferTypes {
  readonly types?: readonly string[];
}

/**
 * Read the node definition id from a drop payload.
 *
 * Returns undefined when there is no payload or the payload is blank, so
 * the caller never forwards an unusable id to the host.
 */
export function nodeDefinitionFromDataTransfer(
  dataTransfer: DataTransferReader | null | undefined,
): string | undefined {
  if (dataTransfer === null || dataTransfer === undefined) {
    return undefined;
  }
  if (typeof dataTransfer.getData !== "function") {
    return undefined;
  }
  const raw = dataTransfer.getData(NODE_DEFINITION_MIME_TYPE);
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Whether a drag announces the node definition MIME type.
 *
 * Used by `onDragOver` to accept only payloads the canvas can actually
 * place, so dragging text or files over the canvas behaves normally.
 */
export function isNodeDefinitionDrag(
  dataTransfer: DataTransferTypes | null | undefined,
): boolean {
  if (dataTransfer === null || dataTransfer === undefined) {
    return false;
  }
  return dataTransfer.types?.includes(NODE_DEFINITION_MIME_TYPE) ?? false;
}
