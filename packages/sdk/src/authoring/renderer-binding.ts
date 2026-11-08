/**
 * Renderer bindings: how a presentation contribution crosses the SDK boundary.
 *
 * The SDK is framework- and engine-agnostic, so it can never type a renderer.
 * A renderer is an opaque value the host supplies; the SDK only derives a
 * stable id for it so a later presentation adapter can resolve it. Nothing in
 * the core, the document or the domain ever sees the value itself.
 */

/** One opaque renderer, keyed by a stable id. */
export interface RendererBinding {
  /** Stable renderer id referenced by a definition, port or panel. */
  readonly id: string;
  /** The host's renderer, whatever framework it belongs to. */
  readonly value: unknown;
}

/** Renderer bindings of one kind, keyed by id. */
export type RendererBindingMap = ReadonlyMap<string, unknown>;
