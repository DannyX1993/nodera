import { createContext, useContext, type FC, type ReactNode } from "react";
import type { EditorEngine } from "@nodera/application";

/**
 * Context that gives the default edge renderer access to the editor so it
 * can push waypoint updates through the application use case.
 *
 * The React Flow edge renderer (`EdgeProps`) never receives the engine; the
 * canvas must provide it through context so the renderer can call
 * `updateEdgeWaypoints` without the host wiring every handler.
 */
export const NoderaEditorContext = createContext<EditorEngine | null>(null);

/** Provider that makes the engine available to child components. */
export const NoderaEditorProvider: FC<{
  readonly editor: EditorEngine;
  readonly children: ReactNode;
}> = ({ editor, children }) => (
  <NoderaEditorContext.Provider value={editor}>{children}</NoderaEditorContext.Provider>
);

/** Read the engine from context inside the canvas tree. */
export function useNoderaEditor(): EditorEngine | null {
  return useContext(NoderaEditorContext);
}