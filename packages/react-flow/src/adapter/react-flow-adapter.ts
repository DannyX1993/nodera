/**
 * The React Flow adapter: the first presentation engine binding of the SDK.
 *
 * Why the engine lives in this package and not in the SDK
 * ------------------------------------------------------
 * The SDK is engine-agnostic by contract (AGENTS.md §4.1: "No hagas que el
 * consumidor tenga que importar React Flow para utilizar el core o el SDK
 * agnóstico"). An engine is a *dependency*, and the SDK may not have one: it
 * composes the framework-free core and validates authored definitions against
 * whatever engine the host declared, as data only.
 *
 * Selecting React Flow therefore needs a package that is allowed to depend on
 * React and on `@xyflow/react`, and that package is this one: it also owns the
 * canvas adapter this declaration describes (`../canvas`, `../map`,
 * `../registries`, `../renderers`), which is why both layers ship together. A
 * future graph engine (or a Vue/Angular binding) is a *different* package
 * exporting its own `create<Engine>Adapter` plus its own provider/editor; the
 * SDK, its public types and every host that only uses the SDK stay untouched.
 * That is the whole point of the `BuilderAdapter` port: the engine is chosen by
 * the host at composition time, never by an import inside the SDK.
 *
 * This adapter only *declares* capabilities. It does not mount anything —
 * mounting is framework code and lives in `<NoderaEditor>`.
 */

import type { AdapterCapabilities, BuilderAdapter } from "@nodera/sdk";
import { DEFAULT_LOCALE, translate } from "@nodera/ui-core";

/** Stable id of the React Flow engine adapter. */
export const REACT_FLOW_ADAPTER_ID = "nodera.react-flow";

/**
 * Human-readable name of the React Flow engine adapter.
 *
 * The engine name is catalog data (`adapter.reactFlow`, S8 "Textos
 * traducibles") rather than a literal in this file, so a host that presents a
 * different engine renames it in its own locale catalog instead of forking the
 * adapter declaration.
 */
export const REACT_FLOW_ADAPTER_LABEL = translate(DEFAULT_LOCALE, "adapter.reactFlow");

/** What a host may narrow when it selects the React Flow adapter. */
export interface ReactFlowAdapterOptions {
  /**
   * Capabilities the host wants to withdraw from the declaration.
   *
   * Omitted capabilities keep their default (`true`): the adapter declares
   * everything the canvas adapter, the UI layer and this binding can present.
   * Narrow one only when the host deliberately replaces that surface.
   */
  readonly capabilities?: Partial<AdapterCapabilities>;
}

/**
 * Creates the React Flow engine adapter for `createBuilder({ adapter })`.
 *
 * The capability record is written out explicitly instead of spread over a
 * default object, so adding a capability to `AdapterCapabilities` makes this
 * file fail to type-check: a new engine surface must be decided here, not
 * silently defaulted to "supported".
 */
export function createReactFlowAdapter(
  options: ReactFlowAdapterOptions = {},
): BuilderAdapter {
  const declared = options.capabilities;
  const capabilities: AdapterCapabilities = {
    canvas: declared?.canvas ?? true,
    minimap: declared?.minimap ?? true,
    controls: declared?.controls ?? true,
    zoomPan: declared?.zoomPan ?? true,
    dragAndDrop: declared?.dragAndDrop ?? true,
    nodeRenderers: declared?.nodeRenderers ?? true,
    edgeRenderers: declared?.edgeRenderers ?? true,
    portRenderers: declared?.portRenderers ?? true,
    propertyRenderers: declared?.propertyRenderers ?? true,
    edgeStyles: declared?.edgeStyles ?? true,
    customPanels: declared?.customPanels ?? true,
  };

  return {
    id: REACT_FLOW_ADAPTER_ID,
    label: REACT_FLOW_ADAPTER_LABEL,
    capabilities,
  };
}
