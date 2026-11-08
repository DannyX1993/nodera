import { type FC, type ComponentType, type ReactNode, useMemo } from "react";

import { PortHandle } from "../renderers/port-renderer.js";
import { DefaultNodeRenderer } from "../renderers/default-node-renderer.js";
import type {
  NoderaNodeData,
  NoderaNodePort,
  NoderaNodeRendererProps,
  NoderaPortRendererProps,
} from "../renderers/node-renderer-props.js";
import type { NodeRendererRegistry, PortRendererRegistry } from "../registries/renderer-registries.js";
import {
  DEFAULT_NODE_RENDERER_ID,
  DEFAULT_PORT_RENDERER_ID,
  resolvePortRenderer,
} from "../registries/renderer-registries.js";

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
/*  Port rendering                                                     */
/* ------------------------------------------------------------------ */

/** Builds the props a port renderer receives from a port data entry. */
function portRendererProps(port: NoderaNodePort): NoderaPortRendererProps {
  return {
    portId: port.id,
    direction: port.direction,
    ...(port.name !== undefined ? { name: port.name } : {}),
    ...(port.visual !== undefined ? { visual: port.visual } : {}),
  };
}

/**
 * Resolve the component that draws one port.
 *
 * A port renderer id declared in `visual.renderer` is resolved through the
 * registry (D8); an unknown id falls back to the registered default port
 * renderer, and when no port registry is supplied (or nothing resolves)
 * the built-in {@link PortHandle} draws the port. Resolution never throws
 * here: a missing port renderer must not break a whole node.
 */
function resolvePortComponent(
  port: NoderaNodePort,
  registry?: PortRendererRegistry,
): ComponentType<NoderaPortRendererProps> {
  if (registry === undefined) {
    return PortHandle;
  }
  const rendererId = port.visual?.renderer ?? DEFAULT_PORT_RENDERER_ID;
  try {
    return resolvePortRenderer(rendererId, registry);
  } catch {
    return PortHandle;
  }
}

/**
 * Renders one component per port of a node.
 *
 * The wrapper owns port rendering for EVERY node renderer, so a custom
 * node renderer gets ports for free and ports are never duplicated.
 */
function renderPorts(
  ports: NoderaNodeData["ports"],
  registry?: PortRendererRegistry,
): ReactNode[] {
  return ports.map((port) => {
    const PortComponent = resolvePortComponent(port, registry);
    return <PortComponent key={port.id} {...portRendererProps(port)} />;
  });
}

/* ------------------------------------------------------------------ */
/*  Node type factory                                                  */
/* ------------------------------------------------------------------ */

/**
 * Creates a React Flow node type component that:
 * 1. Resolves the renderer id from data.
 * 2. Looks up a custom renderer in the provided registry.
 * 3. Falls back to DefaultNodeRenderer when not found.
 * 4. Always renders the node ports through the port renderer registry
 *    (registered port renderer or the built-in PortHandle).
 *
 * The wrapper renders ports AND the renderer body. DefaultNodeRenderer
 * renders no ports itself, so the wrapper is the single owner of port
 * rendering: a custom node renderer gets ports for free and ports are
 * never duplicated.
 *
 * @param registry - the node renderer registry (may be undefined)
 * @param portRendererRegistry - the port renderer registry (may be undefined)
 * @returns a React Flow node type component
 */
export function createNodeType(
  registry?: NodeRendererRegistry,
  portRendererRegistry?: PortRendererRegistry,
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
    const portHandles = renderPorts(data.ports, portRendererRegistry);

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
  NoderaNodeRendererProps & {
    nodeRendererRegistry?: NodeRendererRegistry;
    portRendererRegistry?: PortRendererRegistry;
  }
> = ({ data, selected, nodeRendererRegistry, portRendererRegistry }) => {
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

  const portHandles = renderPorts(data.ports, portRendererRegistry);

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
 * Each component is a factory-created wrapper that resolves the node
 * renderer and renders the node ports through the port renderer registry.
 */
export function useNodeTypes(
  registry?: NodeRendererRegistry,
  portRendererRegistry?: PortRendererRegistry,
): Record<string, ComponentType<NoderaNodeRendererProps>> {
  return useMemo(() => {
    const types: Record<string, ComponentType<NoderaNodeRendererProps>> = {};

    if (registry) {
      for (const id of registry.listIds()) {
        try {
          types[id] = createNodeType(registry, portRendererRegistry);
        } catch {
          // Skip unresolvable registrations.
        }
      }
    }

    // Default sentinel always available.
    types[DEFAULT_NODE_RENDERER_ID] = createNodeType(registry, portRendererRegistry);

    return types;
  }, [registry, portRendererRegistry]);
}