import type { ComponentType } from "react";

import type { NoderaPortRendererProps } from "../renderers/node-renderer-props.js";

/* ------------------------------------------------------------------ */
/*  Sentinel identifiers                                               */
/* ------------------------------------------------------------------ */

/** Default node renderer id when nothing is registered. */
export const DEFAULT_NODE_RENDERER_ID = "nodera-default-node";

/** Default edge renderer id when nothing is registered. */
export const DEFAULT_EDGE_RENDERER_ID = "nodera-default-edge";

/** Default port renderer id when nothing is registered. */
export const DEFAULT_PORT_RENDERER_ID = "nodera-default-port";

/* ------------------------------------------------------------------ */
/*  Error types                                                        */
/* ------------------------------------------------------------------ */

export class DuplicateRegistrationError extends Error {
  override name = "DuplicateRegistrationError";
  constructor(rendererId: string, type: "node" | "edge" | "port") {
    super(`Duplicate renderer registration for id '${rendererId}'`);
  }
}

export class MissingRendererError extends Error {
  override name = "MissingRendererError";
  constructor(rendererId: string, type: "node" | "edge" | "port") {
    super(`No ${type} renderer registered for id '${rendererId}'`);
  }
}

/* ------------------------------------------------------------------ */
/*  NodeRendererRegistry                                               */
/* ------------------------------------------------------------------ */

export class NodeRendererRegistry {
  private readonly map = new Map<string, ComponentType>();

  /**
   * Register a renderer component.  Throws on duplicate id.
   */
  register(rendererId: string, component: ComponentType): void {
    if (this.map.has(rendererId)) {
      throw new DuplicateRegistrationError(rendererId, "node");
    }
    this.map.set(rendererId, component);
  }

  has(rendererId: string): boolean {
    return this.map.has(rendererId);
  }

  get(rendererId: string): ComponentType {
    if (!this.map.has(rendererId)) {
      throw new MissingRendererError(rendererId, "node");
    }
    return this.map.get(rendererId)!;
  }

  unregister(rendererId: string): void {
    this.map.delete(rendererId);
  }

  listIds(): readonly string[] {
    return Array.from(this.map.keys());
  }
}

/* ------------------------------------------------------------------ */
/*  EdgeRendererRegistry                                               */
/* ------------------------------------------------------------------ */

export class EdgeRendererRegistry {
  private readonly map = new Map<string, ComponentType>();

  /**
   * Register a renderer component.  Throws on duplicate id.
   */
  register(rendererId: string, component: ComponentType): void {
    if (this.map.has(rendererId)) {
      throw new DuplicateRegistrationError(rendererId, "edge");
    }
    this.map.set(rendererId, component);
  }

  has(rendererId: string): boolean {
    return this.map.has(rendererId);
  }

  get(rendererId: string): ComponentType {
    if (!this.map.has(rendererId)) {
      throw new MissingRendererError(rendererId, "edge");
    }
    return this.map.get(rendererId)!;
  }

  unregister(rendererId: string): void {
    this.map.delete(rendererId);
  }

  listIds(): readonly string[] {
    return Array.from(this.map.keys());
  }
}

/* ------------------------------------------------------------------ */
/*  PortRendererRegistry                                               */
/* ------------------------------------------------------------------ */

/**
 * Registry of port renderers (S3 level 2: replace the port renderer).
 *
 * Shape-identical to the node/edge registries so hosts can treat all
 * three uniformly. Duplicate ids throw and unknown ids throw instead of
 * silently falling back.
 */
export class PortRendererRegistry {
  private readonly map = new Map<string, ComponentType<NoderaPortRendererProps>>();

  /**
   * Register a port renderer component.  Throws on duplicate id.
   */
  register(rendererId: string, component: ComponentType<NoderaPortRendererProps>): void {
    if (this.map.has(rendererId)) {
      throw new DuplicateRegistrationError(rendererId, "port");
    }
    this.map.set(rendererId, component);
  }

  has(rendererId: string): boolean {
    return this.map.has(rendererId);
  }

  get(rendererId: string): ComponentType<NoderaPortRendererProps> {
    if (!this.map.has(rendererId)) {
      throw new MissingRendererError(rendererId, "port");
    }
    return this.map.get(rendererId)!;
  }

  unregister(rendererId: string): void {
    this.map.delete(rendererId);
  }

  listIds(): readonly string[] {
    return Array.from(this.map.keys());
  }
}

/* ------------------------------------------------------------------ */
/*  Resolve helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Resolve a node renderer by id.
 *
 * When `registry` is provided and the id is not found inside it, the
 * sentinel `DEFAULT_NODE_RENDERER_ID` is resolved instead so that
 * callers receive a fallback component rather than throwing.
 *
 * Without a registry, throws {@link MissingRendererError}.
 */
export function resolveNodeRenderer(
  rendererId: string,
  registry?: NodeRendererRegistry
): ComponentType {
  if (registry) {
    if (registry.has(rendererId)) {
      return registry.get(rendererId);
    }
    if (registry.has(DEFAULT_NODE_RENDERER_ID)) {
      return registry.get(DEFAULT_NODE_RENDERER_ID);
    }
  }
  throw new MissingRendererError(rendererId, "node");
}

/**
 * Resolve a port renderer by id.
 *
 * Mirrors {@link resolveNodeRenderer}: a registry hit wins, an unknown id
 * falls back to the registered `DEFAULT_PORT_RENDERER_ID`, and anything
 * else throws {@link MissingRendererError} with `port` as the type so the
 * message names what is actually missing.
 */
export function resolvePortRenderer(
  rendererId: string,
  registry?: PortRendererRegistry
): ComponentType<NoderaPortRendererProps> {
  if (registry) {
    if (registry.has(rendererId)) {
      return registry.get(rendererId);
    }
    if (registry.has(DEFAULT_PORT_RENDERER_ID)) {
      return registry.get(DEFAULT_PORT_RENDERER_ID);
    }
  }
  throw new MissingRendererError(rendererId, "port");
}