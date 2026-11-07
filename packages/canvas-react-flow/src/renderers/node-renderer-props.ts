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
 * Shared data contract between the mapper layer and renderer
 * components.  Every renderer receives exactly one `NoderaNodeRendererProps`
 * value; renderers must only read fields defined here.
 */
export interface NoderaNodeData {
  readonly definitionId: string;
  readonly label: string;
  readonly ports: ReadonlyArray<{
    readonly id: string;
    readonly name?: string;
    readonly direction: "input" | "output" | "bidirectional";
    readonly dataType?: string;
  }>;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly visual?: NodeVisual;
}

export interface NoderaNodeRendererProps {
  readonly data: NoderaNodeData;
  readonly selected: boolean;
}