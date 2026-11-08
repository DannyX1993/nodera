/**
 * The opaque → React boundary: binding SDK renderer snapshots to concrete
 * React registries.
 *
 * The SDK records renderers as opaque `unknown` values keyed by stable ids
 * (D3). This module is the only place in the framework where those values
 * become React component types, and it is the only place allowed to make that
 * cast: the SDK cannot type a renderer, React needs a component, and the host —
 * not the framework — decides which value crosses.
 *
 * A value that is not a renderable component is a host programming error at the
 * framework boundary, so it fails loudly with {@link InvalidRendererBindingError}
 * naming every offender. Silently skipping a broken binding would leave the
 * host with a renderer that never appears and no diagnostic explaining why; the
 * same policy `ComponentRegistry` in `@nodera/ui-react` already applies.
 */

import type { ComponentType } from "react";

import {
  EdgeRendererRegistry,
  NodeRendererRegistry,
  PortRendererRegistry,
} from "../registries/renderer-registries.js";
import type { NoderaPortRendererProps } from "./node-renderer-props.js";
import { RENDERER_KINDS, type RendererBindings } from "@nodera/sdk";
import {
  ComponentRegistry,
  createDefaultComponentRenderers,
  type ComponentRenderers,
  type MenuRendererProps,
  type PanelRendererProps,
  type PropertyRendererProps,
  type ToolbarRendererProps,
} from "@nodera/ui-react";

/** Raised when a bound renderer value cannot be rendered by React. */
export class InvalidRendererBindingError extends Error {
  override readonly name = "InvalidRendererBindingError";
  /** Every offending binding, as `<kind>:<id>`, in registry order. */
  readonly bindings: readonly string[];

  constructor(bindings: readonly string[]) {
    super(
      `Renderer bindings must be React components; not renderable: ${bindings.join(", ")}`,
    );
    this.bindings = bindings;
  }
}

/**
 * Whether a bound value is something React can render as a component *type*.
 *
 * Accepted: a function (function or class component), a `memo`/`forwardRef`/
 * `lazy` component object (it carries `$$typeof`) and a non-empty string (an
 * intrinsic element type such as `"div"`). Everything else — numbers, plain
 * objects, `null`, `undefined`, arrays — cannot be a component type.
 */
export function isRenderableComponent(value: unknown): boolean {
  if (typeof value === "function") {
    return true;
  }
  if (typeof value === "string") {
    return value.length > 0;
  }
  if (typeof value === "object" && value !== null) {
    return "$$typeof" in value;
  }
  return false;
}

/**
 * Concrete React registries one builder snapshot resolves to.
 *
 * `nodeRenderers`/`edgeRenderers`/`portRenderers` feed the canvas adapter
 * (`GraphCanvas`), and `components` feeds the UI layer (`NoderaUiProvider`).
 */
export interface RendererSet {
  readonly nodeRenderers: NodeRendererRegistry;
  readonly edgeRenderers: EdgeRendererRegistry;
  readonly portRenderers: PortRendererRegistry;
  readonly components: ComponentRenderers;
}

/** Options that shape one renderer set. */
export interface RendererSetOptions {
  /**
   * Component renderers to start from. Defaults to
   * `createDefaultComponentRenderers()`, so the framework panels and property
   * renderers keep working and a host only overrides what it bound.
   */
  readonly base?: ComponentRenderers;
}

/**
 * The single opaque `unknown` → React component type cast of this package.
 *
 * The check in {@link assertRenderableBindings} is what makes it safe: every
 * value that reaches it was proven renderable by React's own acceptance rules.
 */
function asComponent<TProps>(value: unknown): ComponentType<TProps> {
  return value as ComponentType<TProps>;
}

/** Collects every non-renderable binding as `<kind>:<id>`, in registry order. */
function invalidBindings(bindings: RendererBindings): readonly string[] {
  const offenders: string[] = [];
  for (const kind of RENDERER_KINDS) {
    for (const [id, value] of bindings[kind]) {
      if (!isRenderableComponent(value)) {
        offenders.push(`${kind}:${id}`);
      }
    }
  }
  return offenders;
}

/** Throws before anything is built when a binding is not renderable. */
function assertRenderableBindings(bindings: RendererBindings): void {
  const offenders = invalidBindings(bindings);
  if (offenders.length > 0) {
    throw new InvalidRendererBindingError(offenders);
  }
}

/** Copies one component registry so a host-supplied base is never mutated. */
function copyRegistry<TProps>(
  source: ComponentRegistry<TProps>,
): ComponentRegistry<TProps> {
  const copy = new ComponentRegistry<TProps>();
  for (const id of source.listIds()) {
    copy.register(id, source.get(id));
  }
  return copy;
}

/** Copies every replacement slot of a base renderer set. */
function copyComponentRenderers(source: ComponentRenderers): ComponentRenderers {
  return {
    panels: copyRegistry(source.panels),
    properties: copyRegistry(source.properties),
    toolbars: copyRegistry(source.toolbars),
    menus: copyRegistry(source.menus),
  };
}

/**
 * Converts one opaque binding snapshot into the React registries a UI instance
 * consumes.
 *
 * Mapping: `nodes`/`edges`/`ports` go to the canvas adapter registries, and
 * `properties`/`panels`/`toolbars`/`menus` go to the matching
 * `ComponentRenderers` slot. Property components are keyed exactly like the
 * property panel looks them up — `renderers.properties.tryGet(definition.component
 * ?? definition.type)` in `properties-panel.tsx` — so the SDK-derived id
 * (`<ownerType>.<propertyId>` or the explicit component id) is the key, not the
 * property type.
 *
 * Bound ids are *replaced* in the component slots: `base` already owns the
 * framework ids, and a host binding for an existing panel, property renderer,
 * toolbar or menu must win. The canvas registries start empty, so they use
 * `register` and keep their duplicate detection intact.
 */
export function createRendererSet(
  bindings: RendererBindings,
  options: RendererSetOptions = {},
): RendererSet {
  assertRenderableBindings(bindings);

  const nodeRenderers = new NodeRendererRegistry();
  for (const [id, value] of bindings.nodes) {
    nodeRenderers.register(id, asComponent(value));
  }

  const edgeRenderers = new EdgeRendererRegistry();
  for (const [id, value] of bindings.edges) {
    edgeRenderers.register(id, asComponent(value));
  }

  const portRenderers = new PortRendererRegistry();
  for (const [id, value] of bindings.ports) {
    portRenderers.register(id, asComponent<NoderaPortRendererProps>(value));
  }

  const components = copyComponentRenderers(
    options.base ?? createDefaultComponentRenderers(),
  );
  for (const [id, value] of bindings.properties) {
    components.properties.replace(id, asComponent<PropertyRendererProps>(value));
  }
  for (const [id, value] of bindings.panels) {
    components.panels.replace(id, asComponent<PanelRendererProps>(value));
  }
  for (const [id, value] of bindings.toolbars) {
    components.toolbars.replace(id, asComponent<ToolbarRendererProps>(value));
  }
  for (const [id, value] of bindings.menus) {
    components.menus.replace(id, asComponent<MenuRendererProps>(value));
  }

  return { nodeRenderers, edgeRenderers, portRenderers, components };
}
