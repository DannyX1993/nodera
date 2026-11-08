/**
 * Renderer bindings: the only channel through which a presentation
 * contribution crosses into the SDK.
 *
 * Values are opaque (`unknown`) on purpose. The SDK has no framework, so it
 * cannot and must not type a renderer; it only records which stable id maps to
 * which host value, and hands the map to whichever adapter the host selected.
 */

import { err, ok, type Result } from "@nodera/contracts";
import { sdkError, type SdkError } from "../errors.js";
import type { RendererBinding } from "../authoring/renderer-binding.js";

/** Every kind of renderer a host may bind. */
export const RENDERER_KINDS = [
  "nodes",
  "edges",
  "ports",
  "properties",
  "panels",
  "toolbars",
  "menus",
] as const;

/** One kind of renderer slot. */
export type RendererKind = (typeof RENDERER_KINDS)[number];

/** Opaque renderers, grouped by slot kind and keyed by stable id. */
export type RendererBindings = Readonly<
  Record<RendererKind, ReadonlyMap<string, unknown>>
>;

/** No renderers bound yet. */
export const EMPTY_RENDERER_BINDINGS: RendererBindings = Object.freeze({
  nodes: new Map<string, unknown>(),
  edges: new Map<string, unknown>(),
  ports: new Map<string, unknown>(),
  properties: new Map<string, unknown>(),
  panels: new Map<string, unknown>(),
  toolbars: new Map<string, unknown>(),
  menus: new Map<string, unknown>(),
});

/** A renderer id is a short identifier, optionally dot-qualified. */
const RENDERER_ID_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

/**
 * Adds one binding, returning a new snapshot. Rebinding a live id is a
 * conflict, never a silent overwrite.
 */
export function withRendererBinding(
  bindings: RendererBindings,
  kind: RendererKind,
  binding: RendererBinding,
): Result<RendererBindings, SdkError> {
  const path = ["renderers", kind, binding.id];
  if (!RENDERER_ID_PATTERN.test(binding.id)) {
    return err(
      sdkError(
        "sdk.invalid-id",
        `Renderer id "${binding.id}" must be a non-empty identifier without whitespace`,
        { path },
      ),
    );
  }
  if (bindings[kind].has(binding.id)) {
    return err(
      sdkError(
        "sdk.duplicate-id",
        `A "${kind}" renderer is already bound to "${binding.id}"`,
        { path, metadata: { kind, rendererId: binding.id } },
      ),
    );
  }
  const next = new Map(bindings[kind]);
  next.set(binding.id, binding.value);
  return ok({ ...bindings, [kind]: next });
}
