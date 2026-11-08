import type { ComponentType } from "react";

import type { ValidationIssue } from "@nodera/contracts";
import type { PropertyDefinition } from "@nodera/property-system";
import type {
  PanelDefinition,
  ToolAvailabilityContext,
  ToolCommand,
  ToolDefinition,
} from "@nodera/ui-core";

/** Raised when the same renderer id is registered twice. */
export class DuplicateComponentError extends Error {
  constructor(id: string) {
    super(`Duplicate component registration for id '${id}'`);
    this.name = "DuplicateComponentError";
  }
}

/** Raised when a renderer id has no registered component. */
export class MissingComponentError extends Error {
  constructor(id: string) {
    super(`No component registered for id '${id}'`);
    this.name = "MissingComponentError";
  }
}

/** Props of a panel renderer (Level 2 replacement: "Panel Renderer"). */
export interface PanelRendererProps {
  readonly panel: PanelDefinition;
}

/** Props of a property renderer (Level 2 replacement: "Property Renderer"). */
export interface PropertyRendererProps {
  readonly definition: PropertyDefinition;
  readonly value: unknown;
  readonly issues: readonly ValidationIssue[];
  readonly disabled: boolean;
  readonly onChange: (value: unknown) => void;
}

/** Props of a toolbar renderer (Level 2 replacement: "Toolbar Renderer"). */
export interface ToolbarRendererProps {
  readonly tools: readonly ToolDefinition[];
  readonly availability: ToolAvailabilityContext;
  readonly onCommand: (command: ToolCommand) => void;
}

/**
 * Registry of replaceable React components, keyed by a stable renderer id.
 *
 * It holds components only, never in serializable data: definitions keep a
 * renderer *id*, and the host decides which component (framework-provided or
 * its own) one id resolves to. That separation is what makes Level 2
 * customization possible without touching the definitions or the domain
 * (AGENTS.md §5: "No almacenes componentes ni funciones dentro de definiciones
 * serializables").
 *
 * Registration never overwrites silently: a duplicate id is an explicit error
 * and an unknown id is an explicit error, like every other Nodera registry.
 */
export class ComponentRegistry<TProps> {
  private readonly components = new Map<string, ComponentType<TProps>>();

  /** Registers a component under a renderer id. Throws on a duplicate id. */
  register(id: string, component: ComponentType<TProps>): void {
    if (this.components.has(id)) {
      throw new DuplicateComponentError(id);
    }
    this.components.set(id, component);
  }

  /** True when a component is registered for the id. */
  has(id: string): boolean {
    return this.components.has(id);
  }

  /** Component registered for the id. Throws when it is missing. */
  get(id: string): ComponentType<TProps> {
    const component = this.components.get(id);
    if (component === undefined) {
      throw new MissingComponentError(id);
    }
    return component;
  }

  /** Component registered for the id, or `undefined` when it is missing. */
  tryGet(id: string): ComponentType<TProps> | undefined {
    return this.components.get(id);
  }

  /** Removes the component of the id; unknown ids are ignored. */
  unregister(id: string): void {
    this.components.delete(id);
  }

  /** Registered renderer ids, in registration order. */
  listIds(): readonly string[] {
    return [...this.components.keys()];
  }

  /** Number of registered components. */
  get size(): number {
    return this.components.size;
  }
}

/** The three replacement levels of the presentation layer (D3, S3). */
export interface ComponentRenderers {
  readonly panels: ComponentRegistry<PanelRendererProps>;
  readonly properties: ComponentRegistry<PropertyRendererProps>;
  readonly toolbars: ComponentRegistry<ToolbarRendererProps>;
}

/**
 * Creates the renderer registries of one UI instance.
 *
 * They start empty on purpose: the framework ships default components, and the
 * host registers whatever it wants to replace. Registering a component for an
 * id replaces the default one for that id only.
 */
export function createComponentRenderers(): ComponentRenderers {
  return {
    panels: new ComponentRegistry<PanelRendererProps>(),
    properties: new ComponentRegistry<PropertyRendererProps>(),
    toolbars: new ComponentRegistry<ToolbarRendererProps>(),
  };
}
