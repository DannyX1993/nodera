/**
 * Visual metadata passed from a node definition through the mapper
 * to renderer components.  Mirrors {@link NodeVisual} so renderers
 * can read presentation hints without importing the domain layer.
 */
export interface NodeVisual {
  readonly color?: string;
  readonly icon?: string;
  readonly backgroundColor?: string;
  readonly borderColor?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Port entry carried in {@link NoderaNodeData.ports}.
 *
 * Mirrors `PortDeclaration` (id, name, direction, dataType, visual) so a
 * renderer can decide how to draw a single port without importing the
 * graph-model package.
 */
export interface NoderaNodePort {
  readonly id: string;
  readonly name?: string;
  readonly direction: "input" | "output" | "bidirectional";
  readonly dataType?: string;
  /** Presentation hints declared by the port (renderer id + metadata). */
  readonly visual?: {
    readonly renderer?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
  };
}

/**
 * Shared data contract between the mapper layer and renderer
 * components.  Every renderer receives exactly one `NoderaNodeRendererProps`
 * value; renderers must only read fields defined here.
 */
export interface NoderaNodeData {
  readonly definitionId: string;
  readonly label: string;
  readonly ports: ReadonlyArray<NoderaNodePort>;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly visual?: NodeVisual;
}

export interface NoderaNodeRendererProps {
  readonly data: NoderaNodeData;
  readonly selected: boolean;
}

/**
 * Props every port renderer receives.
 *
 * A port renderer draws one port of a node. Hosts register their own
 * components in a `PortRendererRegistry` and select them through
 * `PortDeclaration.visual.renderer`, exactly like a node renderer id
 * selects a node renderer.
 */
export interface NoderaPortRendererProps {
  readonly portId: string;
  readonly direction: NoderaNodePort["direction"];
  readonly name?: string;
  readonly visual?: NoderaNodePort["visual"];
}
