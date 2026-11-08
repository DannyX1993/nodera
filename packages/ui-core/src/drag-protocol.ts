/**
 * Stable drag-and-drop payload contract between a node palette and a canvas.
 *
 * The palette writes the definition id under this mime type and the canvas
 * adapter reads it; keeping the constant framework-agnostic lets both sides
 * agree without the UI layer depending on the canvas adapter.
 */
export const NODE_DEFINITION_MIME_TYPE = "application/nodera-node-definition";
