import {
  createContext,
  useContext,
  type FC,
  type ReactNode,
  type PropsWithChildren,
} from "react";
import type { EditorEngine } from "@nodera/application";

import type { PortAxis } from "../renderers/port-placement.js";

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

/**
 * Context that gates whether the canvas accepts waypoint editing gestures.
 *
 * The adapter composes this value from the SDK feature flag, connections
 * policy and active strategy; the default edge renderer reads it to decide
 * whether to paint handles and run gesture handlers. When false (the
 * default), the edge still routes through existing waypoints — only
 * interaction is gated.
 */
export const NoderaWaypointEditingContext = createContext<boolean>(false);

/** Provider that exposes waypoint editing to the canvas tree. */
export const NoderaWaypointEditingProvider: FC<PropsWithChildren<{
  readonly enabled: boolean;
}>> = ({ enabled, children }) => (
  <NoderaWaypointEditingContext.Provider value={enabled}>
    {children}
  </NoderaWaypointEditingContext.Provider>
);

/** Read the waypoint editing gate from context inside the canvas tree. */
export function useNoderaWaypointEditing(): boolean {
  return useContext(NoderaWaypointEditingContext);
}

/**
 * Context carrying the axis the active layout grows along.
 *
 * The canvas knows it (it is the `layoutDirection` the host declares, the same
 * value the insertion placeholders use); port handles need it too, because the
 * default side of a port follows the axis: an input faces left in a horizontal
 * graph and top in a vertical one. Defaults to `horizontal`, so a handle
 * rendered outside the canvas keeps the side Nodera has always drawn.
 */
export const NoderaPortAxisContext = createContext<PortAxis>("horizontal");

/** Provider that exposes the layout axis to the canvas tree. */
export const NoderaPortAxisProvider: FC<PropsWithChildren<{
  readonly axis: PortAxis;
}>> = ({ axis, children }) => (
  <NoderaPortAxisContext.Provider value={axis}>
    {children}
  </NoderaPortAxisContext.Provider>
);

/** Read the layout axis from context inside the canvas tree. */
export function useNoderaPortAxis(): PortAxis {
  return useContext(NoderaPortAxisContext);
}