/**
 * Edge definitions: how connections are presented and what semantic
 * connection types they model.
 *
 * The definition of a connection's visual presentation is deliberately
 * separate from the semantics of the relation stored in the document: an
 * edge instance stores endpoints, a definition id, a label and metadata;
 * line styles, geometry, arrows, colors and animations live here and are
 * renderer hints, never document state.
 */

/** Line styles a renderer may draw. */
export type EdgeLineStyle = "solid" | "dashed" | "dotted";
/** Geometries a renderer may route. */
export type EdgeGeometry = "straight" | "bezier" | "step" | "smooth";
/** Animations a renderer may apply. */
export type EdgeAnimation = "none" | "flow" | "dash" | "pulse";

/** Visual presentation configuration of an edge definition. */
export interface EdgeVisual {
  readonly lineStyle?: EdgeLineStyle;
  readonly geometry?: EdgeGeometry;
  readonly arrowStart?: boolean;
  readonly arrowEnd?: boolean;
  readonly color?: string;
  readonly animation?: EdgeAnimation;
  /**
   * State indicator ids the renderer may resolve (e.g. success, error
   * badges). The domain never interprets them.
   */
  readonly stateIndicatorIds?: readonly string[];
  /** Additional presentation metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** A contextual action the presentation layer may offer on edges of this type. */
export interface EdgeContextualAction {
  /** Stable action id, e.g. `vendor.edge.delete`. */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
}

/**
 * A declarative edge definition.
 */
export interface EdgeDefinition {
  /** Globally qualified, stable identifier, e.g. `vendor.data-flow`. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Human-readable description. */
  readonly description?: string;
  /** Definition version, semver-shaped. */
  readonly version: string;
  /** Renderer id resolved by the presentation layer. */
  readonly renderer?: string;
  /** Default label instances may inherit. */
  readonly label?: string;
  /**
   * Semantic connection types this definition models, e.g. `data-flow`,
   * `control-flow`. The document stores the type; presentation stays here.
   */
  readonly connectionTypes?: readonly string[];
  /** Node definition ids allowed as sources, when restricted. */
  readonly allowedSourceNodeDefinitionIds?: readonly string[];
  /** Node definition ids allowed as targets, when restricted. */
  readonly allowedTargetNodeDefinitionIds?: readonly string[];
  /**
   * Conditional connections: id of a custom condition, resolved by
   * validators, that a connection must satisfy.
   */
  readonly conditionId?: string;
  /** Visual presentation configuration. */
  readonly visual?: EdgeVisual;
  /** Contextual actions offered on edges of this definition. */
  readonly contextualActions?: readonly EdgeContextualAction[];
  /** Additional definition metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
