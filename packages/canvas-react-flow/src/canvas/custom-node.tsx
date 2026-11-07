import { type FC, type ComponentType, type ReactNode, useMemo } from "react";

import { PortHandle } from "../renderers/port-renderer.js";
import { DefaultNodeRenderer } from "../renderers/default-node-renderer.js";
import type { NoderaNodeData, NoderaNodeRendererProps } from "../renderers/node-renderer-props.js";
import type { NodeRendererRegistry } from "../registries/renderer-registries.js";
import { DEFAULT_NODE_RENDERER_ID } from "../registries/renderer-registries.js";

/* ------------------------------------------------------------------ */
/*  Extended data type                                                 */
/* ------------------------------------------------------------------ */

/**
 * Node data carrying the renderer id for resolution.
 *
 * This extends the base NoderaNodeData with the rendererId field
 * used by the factory to look up custom renderers.
 */
export interface NoderaNodeDataWithRenderer extends NoderaNodeData {
  /** Renderer id from the node definition, used to look up custom renderers. */
  readonly rendererId?: string;
}

/* ------------------------------------------------------------------ */
/*  Node type factory                                                  */
/* ------------------------------------------------------------------ */

/**
 * Creates a React Flow node type component that:
 * 1. Resolves the renderer id from data.
 * 2. Looks up a custom renderer in the provided registry.
 * 3. Falls back to DefaultNodeRenderer when not found.
 * 4. Always renders PortHandle rows for data.ports.
 *
 * The wrapper renders port handles AND the renderer body. The
 * DefaultNodeRenderer also renders ports from data.ports, so the
 * wrapper renders its own port handles in addition to the renderer's.
 *
 * @param registry - the node renderer registry (may be undefined)
 * @returns a React Flow node type component
 */
export function createNodeType(
  registry?: NodeRendererRegistry,
): ComponentType<NoderaNodeRendererProps> {
  return function NoderaNodeRendererComponent({
    data,
    selected,
  }: NoderaNodeRendererProps): ReactNode {
    // Determine the renderer id from extended data.
    const rendererId = (data as NoderaNodeDataWithRenderer).rendererId;

    // Look up a custom renderer, falling back to default.
    let RendererComponent: ComponentType<NoderaNodeRendererProps>;
    if (registry && rendererId) {
      if (registry.has(rendererId)) {
        RendererComponent = registry.get(rendererId) as ComponentType<NoderaNodeRendererProps>;
      } else {
        // Unregistered renderer id → fall back to sentinel.
        RendererComponent = DefaultNodeRenderer;
      }
    } else {
      RendererComponent = DefaultNodeRenderer;
    }

    // Port handles are rendered by the wrapper for ALL renderers,
    // ensuring hosts can always see ports even when supplying
    // custom renderers that don't include them.
    const portHandles = data.ports.map((port) => {
      const props: { portId: string; direction: typeof port.direction; name?: string } = {
        portId: port.id,
        direction: port.direction,
      };
      if (port.name !== undefined) {
        props.name = port.name;
      }
      return <PortHandle key={port.id} {...props} />;
    });

    return (
      <>
        {portHandles}
        <RendererComponent data={data} selected={selected} />
      </>
    );
  };
}

/* ------------------------------------------------------------------ */
/*  NoderaNodeRenderer (direct use, no factory)                        */
/* ------------------------------------------------------------------ */

/**
 * Standalone node renderer that resolves a custom renderer from
 * a passed-in registry and falls back to the default.
 *
 * This component is intended for direct use in tests or in host
 * applications that do not use the factory pattern.
 */
export const NoderaNodeRenderer: FC<
  NoderaNodeRendererProps & { nodeRendererRegistry?: NodeRendererRegistry }
> = ({ data, selected, nodeRendererRegistry }) => {
  // Determine the renderer id from extended data.
  const rendererId = (data as NoderaNodeDataWithRenderer).rendererId;

  // Resolve renderer.
  let RendererComponent: ComponentType<NoderaNodeRendererProps>;
  if (nodeRendererRegistry && rendererId) {
    if (nodeRendererRegistry.has(rendererId)) {
      RendererComponent = nodeRendererRegistry.get(rendererId) as ComponentType<NoderaNodeRendererProps>;
    } else {
      RendererComponent = DefaultNodeRenderer;
    }
  } else {
    RendererComponent = DefaultNodeRenderer;
  }

  const portHandles = data.ports.map((port) => {
    const props: { portId: string; direction: typeof port.direction; name?: string } = {
      portId: port.id,
      direction: port.direction,
    };
    if (port.name !== undefined) {
      props.name = port.name;
    }
    return <PortHandle key={port.id} {...props} />;
  });

  return (
    <>
      {portHandles}
      <RendererComponent data={data} selected={selected} />
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Hook: build nodeTypes from registry                                */
/* ------------------------------------------------------------------ */

/**
 * Build a nodeTypes map for React Flow from a registry.
 *
 * Registers:
 * - Every registered renderer id from the registry.
 * - The default sentinel (`nodera-default-node`) always.
 *
 * Each component is a factory-created wrapper that renders port handles.
 */
export function useNodeTypes(
  registry?: NodeRendererRegistry,
): Record<string, ComponentType<NoderaNodeRendererProps>> {
  return useMemo(() => {
    const types: Record<string, ComponentType<NoderaNodeRendererProps>> = {};

    if (registry) {
      for (const id of registry.listIds()) {
        try {
          types[id] = createNodeType(registry);
        } catch {
          // Skip unresolvable registrations.
        }
      }
    }

    // Default sentinel always available.
    types[DEFAULT_NODE_RENDERER_ID] = createNodeType(registry);

    return types;
  }, [registry]);
}