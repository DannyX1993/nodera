import type { ComponentType } from "react";

/* ------------------------------------------------------------------ */
/*  Sentinel identifiers                                               */
/* ------------------------------------------------------------------ */

/** Default node renderer id when nothing is registered. */
export const DEFAULT_NODE_RENDERER_ID = "nodera-default-node";

/** Default edge renderer id when nothing is registered. */
export const DEFAULT_EDGE_RENDERER_ID = "nodera-default-edge";

/* ------------------------------------------------------------------ */
/*  Error types                                                        */
/* ------------------------------------------------------------------ */

export class DuplicateRegistrationError extends Error {
  override name = "DuplicateRegistrationError";
  constructor(rendererId: string, type: "node" | "edge") {
    super(`Duplicate renderer registration for id '${rendererId}'`);
  }
}

export class MissingRendererError extends Error {
  override name = "MissingRendererError";
  constructor(rendererId: string, type: "node" | "edge") {
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