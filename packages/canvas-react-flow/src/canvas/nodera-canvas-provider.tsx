import { createContext, useContext, type ReactNode } from "react";

import { ReactFlowProvider } from "@xyflow/react";

import type { EditorEngine } from "@nodera/application";

/* ------------------------------------------------------------------ */
/*  NoderaCanvasContext                                                */
/* ------------------------------------------------------------------ */

/**
 * Shared context carrying the editor engine inside the canvas subtree.
 *
 * Design choice: the provider stores the engine reference so child
 * components (GraphCanvas, custom node renderers) can access it without
 * drilling props through the full React tree.  The engine reference is
 * passed directly as a prop to `GraphCanvas` by the host, then forwarded
 * into this context.  This avoids an implicit global singleton while still
 * keeping the component API minimal.
 */
export interface NoderaCanvasContextValue {
  /** The editor engine owning the current graph and editor state. */
  readonly editor: EditorEngine;
}

export const NoderaCanvasContext = createContext<NoderaCanvasContextValue | undefined>(
  undefined,
);

/* ------------------------------------------------------------------ */
/*  NoderaCanvasProvider                                               */
/* ------------------------------------------------------------------ */

/**
 * Context and React Flow provider for the canvas.
 *
 * Wraps children with both the `ReactFlowProvider` (required by all
 * React Flow components) and our own `NoderaCanvasContext` so that the
 * editor engine is available to every node/edge renderer inside the
 * canvas subtree.
 */
export function NoderaCanvasProvider({
  editor,
  children,
}: {
  readonly editor: EditorEngine;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ReactFlowProvider>
      <NoderaCanvasContext.Provider value={{ editor }}>
        {children}
      </NoderaCanvasContext.Provider>
    </ReactFlowProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  useNoderaCanvas hook                                               */
/* ------------------------------------------------------------------ */

/**
 * Read the canvas context: editor engine reference.
 *
 * Throws when called outside a `NoderaCanvasProvider` subtree.
 */
export function useNoderaCanvas(): NoderaCanvasContextValue {
  const value = useContext(NoderaCanvasContext);
  if (value === undefined) {
    throw new Error(
      "useNoderaCanvas must be used inside a <NoderaCanvasProvider>",
    );
  }
  return value;
}