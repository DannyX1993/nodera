/**
 * The builder composition root: the single entry point the host application
 * uses to assemble Nodera.
 *
 * `createBuilder` validates the whole configuration, then wires the existing
 * modules together — domain registries, the editor engine, the UI state store,
 * the theme/layout/panel/tool registries — and hands back one object with the
 * public authoring surface. It never reimplements a rule the core already owns:
 * every definition goes through the authoring translation layer, every registry
 * through its own duplicate detection, and every presentation value stays
 * opaque so no framework leaks into the SDK.
 *
 * Error policy: the public surface has exactly one error shape. Every operation
 * reports its failures as `SdkIssues` — a list of `SdkIssue` values — so a host
 * handles one type no matter which call failed, and collects every issue of an
 * input that has several. `SdkError` is the internal single-failure form; the
 * builder converts it with `toIssue` before it can reach a caller.
 */

import { ok, err, RegistryStore, type RegistryError, type Result } from "@nodera/contracts";
import { DEFAULT_FORMAT_VERSION, GGD_FORMAT } from "@nodera/document";
import { EditorEngine, type EditorEngineOptions } from "@nodera/application";
import { NoderaDomain } from "@nodera/domain";
import { NodeRegistry, type NodeDefinition } from "@nodera/node-registry";
import { EdgeRegistry, type EdgeDefinition } from "@nodera/edge-registry";
import { ValidatorRegistry } from "@nodera/validation";
import { DEFAULT_THEME_ID, ThemeRegistry, createTheme } from "@nodera/theme-engine";
import type { CreateThemeInput, ThemeDefinition } from "@nodera/theme-engine";
import { EDITOR_LAYOUT_ID, LayoutRegistry, createLayoutState } from "@nodera/layout-engine";
import {
  UiStateStore,
  createDefaultPanelRegistry,
  createDefaultToolRegistry,
  type LayoutDefinition,
  type LayoutPanelPlacement,
  type PanelDefinition,
  type PanelRegistry,
  type ToolDefinition,
  type ToolRegistry,
} from "@nodera/ui-core";
import type { PropertyDefinition } from "@nodera/property-system";
import {
  EMPTY_RENDERER_BINDINGS,
  withRendererBinding,
} from "../adapter/renderer-bindings.js";
import type { RendererBindings, RendererKind } from "../adapter/renderer-bindings.js";
import {
  capabilityGaps,
  normalizeAdapter,
  requirementsFrom,
  type BuilderAdapter,
} from "../adapter/adapter.js";
import { toEdgeDefinition, type EdgeDefinitionInput } from "../authoring/edges.js";
import { createDocumentApi, type BuilderDocumentApi } from "../document/document-api.js";
import { createGraphApi, type BuilderGraphApi } from "../graph/graph-api.js";
import { resolveGraphLayout, type ResolvedGraphLayout } from "../graph/placement.js";
import { toNodeDefinition, type NodeDefinitionInput } from "../authoring/nodes.js";
import { toPropertyDefinition, type PropertyInput } from "../authoring/properties.js";
import type { RendererBinding } from "../authoring/renderer-binding.js";
import { toEdgeDefinitionView, toNodeDefinitionView } from "../view/definitions.js";
import type { EdgeDefinitionView, NodeDefinitionView } from "../view/definitions.js";
import type {
  EdgeDefinitionRegistryView,
  NodeDefinitionRegistryView,
} from "../view/registries.js";
import {
  createEdgeDefinitionRegistryView,
  createNodeDefinitionRegistryView,
} from "../view/registries.js";
import {
  disposedIssue,
  identifierFieldIssue,
  isPlainObject,
  isQualifiedId,
  sdkError,
  shapeIssue,
  stringFieldIssue,
  toIssues,
  type SdkError,
  type SdkIssue,
  type SdkIssues,
} from "../errors.js";
import { createBuilderEvents, type BuilderEventApi } from "../events/events-api.js";
import {
  installPlugin,
  type BuilderPlugin,
  type PluginInstallation,
} from "../plugin/plugin.js";
import type {
  BuilderConfiguration,
  BuilderDocumentConfiguration,
  BuilderDocumentFormat,
} from "./configuration.js";
import { resolveFeatures, type ResolvedFeatures } from "./features.js";

/** Id of a builder the host did not name. */
export const DEFAULT_BUILDER_ID = "nodera.builder";

/** Shape of a semver document version, matching the document package. */
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Definition registries the builder owns and shares with its editors.
 *
 * `nodes` and `edges` are read adapters over the domain registries: they answer
 * in the public §9 vocabulary (`type`/`label`) instead of handing back core
 * `id`/`name` shapes. The concrete registries remain reachable through
 * `builder.editor` (the documented escape hatch) and are what an editor session
 * mutates.
 */
export interface BuilderRegistries {
  readonly nodes: NodeDefinitionRegistryView;
  readonly edges: EdgeDefinitionRegistryView;
  readonly validators: ValidatorRegistry;
  readonly themes: ThemeRegistry;
  readonly layouts: LayoutRegistry;
  readonly panels: PanelRegistry;
  readonly tools: ToolRegistry;
}

/** The core registries the builder composes, before the read adapters wrap them. */
interface BuilderRegistrySources {
  readonly nodes: NodeRegistry;
  readonly edges: EdgeRegistry;
  readonly validators: ValidatorRegistry;
  readonly themes: ThemeRegistry;
  readonly layouts: LayoutRegistry;
  readonly panels: PanelRegistry;
  readonly tools: ToolRegistry;
}

/** Theme surface of the builder: the theme registry plus the active selection. */
export interface BuilderThemeApi {
  /** Registers one theme built by the theme engine's `createTheme`. */
  register(input: CreateThemeInput): Result<ThemeDefinition, SdkIssues>;
  /** Applies a registered theme to the builder's UI state. */
  setDefault(themeId: string): Result<ThemeDefinition, SdkIssues>;
  /** Theme currently applied; falls back to the registry default. */
  active(): ThemeDefinition;
  /** Every registered theme, in registration order. */
  all(): readonly ThemeDefinition[];
}

/** Layout surface of the builder: the layout registry plus the active selection. */
export interface BuilderLayoutApi {
  /** Registers one declarative layout. */
  register(layout: LayoutDefinition): Result<LayoutDefinition, SdkIssues>;
  /** Applies a registered layout, and the panel state it produces, to the UI state. */
  setDefault(layoutId: string): Result<LayoutDefinition, SdkIssues>;
  /** Layout currently applied; falls back to the registry default. */
  active(): LayoutDefinition;
  /** Every registered layout, in registration order. */
  all(): readonly LayoutDefinition[];
}

/** The assembled builder: the only object a host needs after configuration. */
export interface Builder {
  /** Globally qualified builder id. */
  readonly id: string;
  /** Presentation engine the host selected, if any. */
  readonly adapter: BuilderAdapter | undefined;
  /** Feature flags the builder resolved from the configuration. */
  readonly features: ResolvedFeatures;
  /**
   * Non-fatal diagnostics of the composition, currently the capability gaps
   * between the selected adapter and the authored definitions.
   */
  readonly diagnostics: SdkIssues;
  readonly registries: BuilderRegistries;
  /** Properties registered on their own, outside any node definition. */
  readonly properties: RegistryStore<PropertyDefinition>;
  /** Opaque renderers bound so far, by slot kind. */
  readonly renderers: RendererBindings;
  /** The builder's own editing session. Advanced escape hatch. */
  readonly editor: EditorEngine;
  /** Framework-agnostic UI state the presentation binding consumes. */
  readonly store: UiStateStore;
  /** Document format and version the builder was configured with. */
  readonly documentFormat: BuilderDocumentFormat;
  /** Graph-editing facade over the application use cases of the editing session. */
  readonly graph: BuilderGraphApi;
  /**
   * Portable document facade over the phase-2 document and serializer packages.
   *
   * The document API is the one place where the *wire* contract is visible:
   * `GraphDocument` keeps its published shape (`graph.nodes[].type`,
   * `graph.edges[].source.nodeId`, …) because it is the format other tools
   * read and write. Nothing else in the SDK hands a host a core shape; graph
   * reads return instance views and definition reads return definition views.
   */
  readonly document: BuilderDocumentApi;
  /**
   * Event subscriptions: the application events of the editing session plus the
   * two SDK-owned plugin events.
   */
  readonly events: BuilderEventApi;
  /** Theme contributions, bound to the builder's UI state store. */
  readonly theme: BuilderThemeApi;
  /** Layout contributions, bound to the builder's UI state store. */
  readonly layout: BuilderLayoutApi;
  /** Registers one node definition and returns it in the public vocabulary. */
  registerNode(input: NodeDefinitionInput): Result<NodeDefinitionView, SdkIssues>;
  /** Registers one edge definition and returns it in the public vocabulary. */
  registerEdge(input: EdgeDefinitionInput): Result<EdgeDefinitionView, SdkIssues>;
  registerProperty(input: PropertyInput): Result<PropertyDefinition, SdkIssues>;
  registerPanel(panel: PanelDefinition): Result<PanelDefinition, SdkIssues>;
  registerTool(tool: ToolDefinition): Result<ToolDefinition, SdkIssues>;
  /**
   * Binds one opaque presentation value to a renderer slot.
   *
   * Failures are `SdkIssues`, like every other builder operation: the value is
   * never inspected, so the only failures are a malformed or already-bound id.
   */
  bindRenderer(kind: RendererKind, id: string, value: unknown): Result<Builder, SdkIssues>;
  /** Installs one plugin and reports what it contributed. */
  use(plugin: BuilderPlugin): Result<PluginInstallation, SdkIssues>;
  /** Opens a new editing session over the builder's registries. */
  createEditor(options?: EditorEngineOptions): Result<EditorEngine, SdkIssues>;
  /**
   * Releases the builder. Idempotent.
   *
   * Afterwards every operation that mutates the graph or extends the builder
   * fails with `sdk.disposed`; every read keeps working, because the state the
   * host already received must stay renderable.
   */
  dispose(): void;
}

function toIssue(error: SdkError): SdkIssue {
  return { ...error, severity: "error" };
}

function registryIssue(error: RegistryError, path: readonly string[]): SdkIssue {
  return {
    code: error.kind === "duplicate-id" ? "sdk.duplicate-id" : "sdk.unknown-definition",
    severity: "error",
    message: error.message,
    path,
    metadata: { registryId: error.id, registryErrorKind: error.kind },
  };
}

/** Issue for a theme id no registry entry matches. */
function unknownThemeIssue(
  themeId: string,
  themes: ThemeRegistry,
  path?: readonly string[],
): SdkIssue {
  return toIssue(
    sdkError("sdk.unknown-theme", `No theme registered with id "${themeId}"`, {
      ...(path === undefined ? {} : { path }),
      metadata: { value: themeId, known: themes.all().map((theme) => theme.id) },
    }),
  );
}

/** Issue for a layout id no registry entry matches. */
function unknownLayoutIssue(
  layoutId: string,
  layouts: LayoutRegistry,
  path?: readonly string[],
): SdkIssue {
  return toIssue(
    sdkError("sdk.unknown-layout", `No layout registered with id "${layoutId}"`, {
      ...(path === undefined ? {} : { path }),
      metadata: { value: layoutId, known: layouts.all().map((layout) => layout.id) },
    }),
  );
}

/** Message of a thrown value, whatever the theme engine threw. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Registers one `createTheme` input.
 *
 * `createTheme` is the theme engine's validating factory and it throws for the
 * inputs it rejects (an empty id or name, broken tokens). The SDK never throws
 * for data, so the throw becomes `sdk.invalid-input` and the registry decides
 * everything else — duplicate ids included.
 */
function registerTheme(
  themes: ThemeRegistry,
  input: CreateThemeInput,
  path: readonly string[],
): Result<ThemeDefinition, SdkIssues> {
  if (!isPlainObject(input)) {
    return err([
      shapeIssue(
        "A theme must be an object declaring an id, a name and its design tokens",
        input,
        path,
      ),
    ]);
  }

  const id = typeof input.id === "string" && input.id.trim().length > 0 ? input.id : undefined;
  const issues: SdkIssue[] = [];
  if (id === undefined) {
    issues.push(identifierFieldIssue("Theme", "id", input.id, [...path, "id"]));
  }
  if (typeof input.name !== "string") {
    issues.push(stringFieldIssue("Theme", "name", input.name, [...path, "name"]));
  }
  if (issues.length > 0 || id === undefined) {
    return err(issues);
  }

  let theme: ThemeDefinition;
  try {
    theme = createTheme(input);
  } catch (error) {
    return err([
      toIssue(
        sdkError("sdk.invalid-input", messageOf(error), {
          path,
          metadata: { value: id },
        }),
      ),
    ]);
  }
  const registered = themes.register(theme);
  if (!registered.ok) {
    return err([registryIssue(registered.error, [...path, registered.error.id])]);
  }
  return ok(registered.value);
}

/**
 * Structural checks of a layout definition.
 *
 * No core validator covers layouts — `LayoutRegistry` only owns duplicate and
 * unknown ids — so the SDK checks the boundary of what a host hands in and
 * lets the registry decide conflicts.
 */
/**
 * Structural checks of the graph layout configuration.
 *
 * The host declares who owns placement; a value outside the declared unions, or
 * a spacing that is not a positive finite number, is a configuration problem the
 * builder reports instead of guessing a geometry.
 */
function graphLayoutIssues(layout: unknown, path: readonly string[]): SdkIssue[] {
  if (!isPlainObject(layout)) {
    return [
      shapeIssue(
        "Builder graph layout must be an object declaring a placement mode",
        layout,
        path,
      ),
    ];
  }
  const issues: SdkIssue[] = [];
  const mode: unknown = Reflect.get(layout, "mode");
  if (mode !== undefined && mode !== "free" && mode !== "auto") {
    issues.push(
      shapeIssue('Builder graph layout mode must be "free" or "auto"', mode, [...path, "mode"]),
    );
  }
  const direction: unknown = Reflect.get(layout, "direction");
  if (direction !== undefined && direction !== "horizontal" && direction !== "vertical") {
    issues.push(
      shapeIssue(
        'Builder graph layout direction must be "horizontal" or "vertical"',
        direction,
        [...path, "direction"],
      ),
    );
  }
  const spacing: unknown = Reflect.get(layout, "spacing");
  if (
    spacing !== undefined &&
    !(typeof spacing === "number" && Number.isFinite(spacing) && spacing > 0)
  ) {
    issues.push(
      shapeIssue(
        "Builder graph layout spacing must be a positive finite number",
        spacing,
        [...path, "spacing"],
      ),
    );
  }
  return issues;
}

function layoutIssues(layout: LayoutDefinition, path: readonly string[]): SdkIssue[] {
  if (!isPlainObject(layout)) {
    return [
      shapeIssue(
        "A layout must be an object declaring an id and its panel placements",
        layout,
        path,
      ),
    ];
  }

  const issues: SdkIssue[] = [];
  const id = typeof layout.id === "string" && layout.id.trim().length > 0 ? layout.id : undefined;
  if (id === undefined) {
    issues.push(identifierFieldIssue("Layout", "id", layout.id, [...path, "id"]));
  }
  const declaredPanels = layout.panels;
  if (!Array.isArray(declaredPanels)) {
    issues.push(
      shapeIssue("A layout must declare its panels as an array", declaredPanels, [
        ...path,
        "panels",
      ]),
    );
    return issues;
  }
  const placements: readonly LayoutPanelPlacement[] = declaredPanels;
  placements.forEach((placement, index) => {
    if (!isPlainObject(placement)) {
      issues.push(
        shapeIssue(
          "A layout panel placement must be an object declaring a panel id and a region",
          placement,
          [...path, "panels", String(index)],
        ),
      );
      return;
    }
    if (typeof placement.panelId !== "string" || placement.panelId.trim().length === 0) {
      issues.push(
        stringFieldIssue("Layout panel placement", "panelId", placement.panelId, [
          ...path,
          "panels",
          String(index),
          "panelId",
        ]),
      );
    }
    if (typeof placement.region !== "string" || placement.region.trim().length === 0) {
      issues.push(
        stringFieldIssue("Layout panel placement", "region", placement.region, [
          ...path,
          "panels",
          String(index),
          "region",
        ]),
      );
    }
  });
  return issues;
}

/**
 * Structural checks of a panel definition.
 *
 * `PanelRegistry` only owns duplicate and unknown ids, and a panel without an
 * id would be stored under an undefined key, so the SDK validates the shape a
 * host hands in before the registry sees it.
 */
function panelIssues(panel: PanelDefinition): SdkIssue[] {
  if (!isPlainObject(panel)) {
    return [
      shapeIssue(
        "A panel must be an object declaring an id, a title and a region",
        panel,
        ["panels"],
      ),
    ];
  }
  const issues: SdkIssue[] = [];
  if (typeof panel.id !== "string" || panel.id.trim().length === 0) {
    issues.push(identifierFieldIssue("Panel", "id", panel.id, ["panels", "id"]));
  }
  if (typeof panel.title !== "string" || panel.title.trim().length === 0) {
    issues.push(stringFieldIssue("Panel", "title", panel.title, ["panels", "title"]));
  }
  if (typeof panel.region !== "string" || panel.region.trim().length === 0) {
    issues.push(stringFieldIssue("Panel", "region", panel.region, ["panels", "region"]));
  }
  return issues;
}

/**
 * Structural checks of a tool definition.
 *
 * A tool is a declarative command, so the command must be an object with a
 * string `kind` the presentation layer can map to a use case.
 */
function toolIssues(tool: ToolDefinition): SdkIssue[] {
  if (!isPlainObject(tool)) {
    return [
      shapeIssue(
        "A tool must be an object declaring an id, a label and a command",
        tool,
        ["tools"],
      ),
    ];
  }
  const issues: SdkIssue[] = [];
  if (typeof tool.id !== "string" || tool.id.trim().length === 0) {
    issues.push(identifierFieldIssue("Tool", "id", tool.id, ["tools", "id"]));
  }
  if (typeof tool.label !== "string" || tool.label.trim().length === 0) {
    issues.push(stringFieldIssue("Tool", "label", tool.label, ["tools", "label"]));
  }
  if (!isPlainObject(tool.command)) {
    issues.push(
      shapeIssue("A tool must declare its command as an object with a kind", tool.command, [
        "tools",
        "command",
      ]),
    );
  } else if (typeof tool.command.kind !== "string" || tool.command.kind.trim().length === 0) {
    issues.push(
      stringFieldIssue("Tool command", "kind", tool.command.kind, [
        "tools",
        "command",
        "kind",
      ]),
    );
  }
  return issues;
}

/** Registers one layout definition after checking its structure. */
function registerLayout(
  layouts: LayoutRegistry,
  layout: LayoutDefinition,
  path: readonly string[],
): Result<LayoutDefinition, SdkIssues> {
  const issues = layoutIssues(layout, path);
  if (issues.length > 0) {
    return err(issues);
  }
  const registered = layouts.register(layout);
  if (!registered.ok) {
    return err([registryIssue(registered.error, [...path, registered.error.id])]);
  }
  return ok(registered.value);
}

/**
 * Adds a batch of renderers to a binding snapshot.
 *
 * A batch is applied to a local copy so a rejected binding never half-applies:
 * either every renderer of the batch is bound or the previous snapshot stands.
 */
function bindRenderers(
  bindings: RendererBindings,
  kind: RendererKind,
  renderers: readonly RendererBinding[],
): Result<RendererBindings, SdkError> {
  let current = bindings;
  for (const renderer of renderers) {
    const next = withRendererBinding(current, kind, renderer);
    if (!next.ok) {
      return next;
    }
    current = next.value;
  }
  return ok(current);
}

function rendererBatch(
  renderer: RendererBinding | undefined,
  components: readonly RendererBinding[],
): readonly RendererBinding[] {
  return renderer === undefined ? components : [renderer, ...components];
}

/**
 * Binds everything one node definition contributes: its own renderer in the
 * node slot and the components of its `custom` properties in the property
 * slot, which is where a host resolves property components.
 */
function bindNodeRenderers(
  bindings: RendererBindings,
  renderer: RendererBinding | undefined,
  components: readonly RendererBinding[],
): Result<RendererBindings, SdkError> {
  const withNodeRenderer = bindRenderers(bindings, "nodes", rendererBatch(renderer, []));
  if (!withNodeRenderer.ok) {
    return withNodeRenderer;
  }
  return bindRenderers(withNodeRenderer.value, "properties", components);
}

/** Where a conflicting definition id lives, in the caller's input vocabulary. */
type RegistryPath = (id: string) => readonly string[];

/** One definition that entered a registry, with the bindings it produced. */
interface AddedDefinition<TDefinition> {
  readonly definition: TDefinition;
  readonly renderers: RendererBindings;
}

/**
 * Adds one authored node definition atomically.
 *
 * The registry entry and its renderers are one transaction: a renderer the
 * host already bound elsewhere rolls the registration back, so a failed call
 * never leaves a half-registered definition behind.
 */
function addNode(
  nodes: NodeRegistry,
  bindings: RendererBindings,
  input: NodeDefinitionInput,
  path: RegistryPath,
): Result<AddedDefinition<NodeDefinition>, SdkIssues> {
  const translated = toNodeDefinition(input);
  if (!translated.ok) {
    return err(translated.error);
  }
  const registered = nodes.register(translated.value.definition);
  if (!registered.ok) {
    return err([registryIssue(registered.error, path(registered.error.id))]);
  }
  const bound = bindNodeRenderers(
    bindings,
    translated.value.renderer,
    translated.value.components,
  );
  if (!bound.ok) {
    nodes.unregister(registered.value.id);
    return err([toIssue(bound.error)]);
  }
  return ok({ definition: registered.value, renderers: bound.value });
}

/** Adds one authored edge definition atomically, like {@link addNode}. */
function addEdge(
  edges: EdgeRegistry,
  bindings: RendererBindings,
  input: EdgeDefinitionInput,
  path: RegistryPath,
): Result<AddedDefinition<EdgeDefinition>, SdkIssues> {
  const translated = toEdgeDefinition(input);
  if (!translated.ok) {
    return err(translated.error);
  }
  const registered = edges.register(translated.value.definition);
  if (!registered.ok) {
    return err([registryIssue(registered.error, path(registered.error.id))]);
  }
  const bound = bindRenderers(
    bindings,
    "edges",
    rendererBatch(translated.value.renderer, []),
  );
  if (!bound.ok) {
    edges.unregister(registered.value.id);
    return err([toIssue(bound.error)]);
  }
  return ok({ definition: registered.value, renderers: bound.value });
}

/** Adds one authored property atomically, like {@link addNode}. */
function addProperty(
  properties: RegistryStore<PropertyDefinition>,
  bindings: RendererBindings,
  input: PropertyInput,
  path: RegistryPath,
): Result<AddedDefinition<PropertyDefinition>, SdkIssues> {
  const translated = toPropertyDefinition(input);
  if (!translated.ok) {
    return err(translated.error);
  }
  const registered = properties.register(translated.value.definition);
  if (!registered.ok) {
    return err([registryIssue(registered.error, path(registered.error.id))]);
  }
  const bound = bindRenderers(
    bindings,
    "properties",
    rendererBatch(translated.value.component, []),
  );
  if (!bound.ok) {
    properties.unregister(registered.value.id);
    return err([toIssue(bound.error)]);
  }
  return ok({ definition: registered.value, renderers: bound.value });
}

/** Resolves and validates the document format and version. */
function resolveDocumentFormat(
  configuration: BuilderDocumentConfiguration | undefined,
): Result<BuilderDocumentFormat, SdkIssues> {
  if (configuration !== undefined && !isPlainObject(configuration)) {
    return err([
      shapeIssue(
        "Builder document configuration must be an object declaring a format and a version",
        configuration,
        ["document"],
      ),
    ]);
  }

  const issues: SdkIssue[] = [];
  const format = configuration?.format ?? GGD_FORMAT;
  const version = configuration?.version ?? DEFAULT_FORMAT_VERSION;

  if (format !== GGD_FORMAT) {
    issues.push(
      toIssue(
        sdkError(
          "sdk.unsupported-format",
          `Document format "${String(format)}" is not supported; ` +
            `the canonical format is "${GGD_FORMAT}"`,
          { path: ["document", "format"], metadata: { value: format } },
        ),
      ),
    );
  }
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    issues.push(
      toIssue(
        sdkError(
          "sdk.document-invalid",
          `Document version "${String(version)}" must be semver-shaped (major.minor.patch)`,
          { path: ["document", "version"], metadata: { value: version } },
        ),
      ),
    );
  }

  return issues.length > 0 ? err(issues) : ok({ format, version });
}

/**
 * Reads one configured registry list.
 *
 * A list that is not an array is reported at its own path instead of being
 * iterated, so a malformed configuration never reaches a `for…of` loop.
 */
function declaredList<T>(
  value: readonly T[] | undefined,
  key: string,
  issues: SdkIssue[],
): readonly T[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push(
      shapeIssue(
        `Builder registry "${key}" must be an array of definitions`,
        value,
        ["registry", key],
      ),
    );
    return [];
  }
  return value;
}

/** Values a fully validated composition needs to build the builder. */
interface BuilderAssemblerOptions {
  readonly id: string;
  readonly adapter: BuilderAdapter | undefined;
  readonly features: ResolvedFeatures;
  readonly diagnostics: SdkIssues;
  readonly registries: BuilderRegistrySources;
  readonly properties: RegistryStore<PropertyDefinition>;
  readonly renderers: RendererBindings;
  readonly store: UiStateStore;
  readonly documentFormat: BuilderDocumentFormat;
  readonly domain: NoderaDomain;
  readonly editor: EditorEngine;
  readonly graphLayout: ResolvedGraphLayout;
}

/** Concrete builder. Hosts only ever see the {@link Builder} contract. */
class SdkBuilder implements Builder {
  readonly id: string;
  readonly adapter: BuilderAdapter | undefined;
  readonly features: ResolvedFeatures;
  readonly diagnostics: SdkIssues;
  readonly registries: BuilderRegistries;
  readonly properties: RegistryStore<PropertyDefinition>;
  readonly editor: EditorEngine;
  readonly store: UiStateStore;
  readonly documentFormat: BuilderDocumentFormat;
  readonly graph: BuilderGraphApi;
  readonly document: BuilderDocumentApi;
  readonly events: BuilderEventApi;
  readonly theme: BuilderThemeApi;
  readonly layout: BuilderLayoutApi;

  private readonly domain: NoderaDomain;
  private readonly nodeRegistry: NodeRegistry;
  private readonly edgeRegistry: EdgeRegistry;
  private bindings: RendererBindings;
  private disposedFlag = false;

  constructor(options: BuilderAssemblerOptions) {
    this.id = options.id;
    this.adapter = options.adapter;
    this.features = options.features;
    this.diagnostics = options.diagnostics;
    this.properties = options.properties;
    this.editor = options.editor;
    this.store = options.store;
    this.documentFormat = options.documentFormat;
    this.domain = options.domain;
    this.nodeRegistry = options.registries.nodes;
    this.edgeRegistry = options.registries.edges;
    this.bindings = options.renderers;
    // One adapter object per builder, so a host can hold on to it across reads.
    this.registries = {
      nodes: createNodeDefinitionRegistryView(this.nodeRegistry, () => this.disposedFlag),
      edges: createEdgeDefinitionRegistryView(this.edgeRegistry, () => this.disposedFlag),
      validators: options.registries.validators,
      themes: options.registries.themes,
      layouts: options.registries.layouts,
      panels: options.registries.panels,
      tools: options.registries.tools,
    };
    this.graph = createGraphApi(this.editor, () => this.disposedFlag, options.graphLayout);
    this.document = createDocumentApi(this.editor, this.documentFormat, () => this.disposedFlag);
    this.events = createBuilderEvents(this.editor.events);
    this.theme = {
      register: (input) => this.addTheme(input),
      setDefault: (themeId) => this.selectTheme(themeId),
      active: () => this.activeTheme(),
      all: () => this.registries.themes.all(),
    };
    this.layout = {
      register: (layout) => this.addLayout(layout),
      setDefault: (layoutId) => this.selectLayout(layoutId),
      active: () => this.activeLayout(),
      all: () => this.registries.layouts.all(),
    };
  }

  get renderers(): RendererBindings {
    return this.bindings;
  }

  registerNode(input: NodeDefinitionInput): Result<NodeDefinitionView, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("registerNode")]);
    }
    const added = addNode(this.nodeRegistry, this.bindings, input, (id) => [
      "nodes",
      id,
    ]);
    if (!added.ok) {
      return err(added.error);
    }
    this.bindings = added.value.renderers;
    return ok(toNodeDefinitionView(added.value.definition));
  }

  registerEdge(input: EdgeDefinitionInput): Result<EdgeDefinitionView, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("registerEdge")]);
    }
    const added = addEdge(this.edgeRegistry, this.bindings, input, (id) => [
      "edges",
      id,
    ]);
    if (!added.ok) {
      return err(added.error);
    }
    this.bindings = added.value.renderers;
    return ok(toEdgeDefinitionView(added.value.definition));
  }

  registerProperty(input: PropertyInput): Result<PropertyDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("registerProperty")]);
    }
    const added = addProperty(this.properties, this.bindings, input, (id) => [
      "properties",
      id,
    ]);
    if (!added.ok) {
      return err(added.error);
    }
    this.bindings = added.value.renderers;
    return ok(added.value.definition);
  }

  registerPanel(panel: PanelDefinition): Result<PanelDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("registerPanel")]);
    }
    const issues = panelIssues(panel);
    if (issues.length > 0) {
      return err(issues);
    }
    const registered = this.registries.panels.register(panel);
    if (!registered.ok) {
      return err([registryIssue(registered.error, ["panels", registered.error.id])]);
    }
    return ok(registered.value);
  }

  registerTool(tool: ToolDefinition): Result<ToolDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("registerTool")]);
    }
    const issues = toolIssues(tool);
    if (issues.length > 0) {
      return err(issues);
    }
    const registered = this.registries.tools.register(tool);
    if (!registered.ok) {
      return err([registryIssue(registered.error, ["tools", registered.error.id])]);
    }
    return ok(registered.value);
  }

  bindRenderer(
    kind: RendererKind,
    id: string,
    value: unknown,
  ): Result<Builder, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("bindRenderer")]);
    }
    const next = withRendererBinding(this.bindings, kind, { id, value });
    if (!next.ok) {
      return err(toIssues(next.error));
    }
    this.bindings = next.value;
    return ok(this);
  }

  createEditor(options: EditorEngineOptions = {}): Result<EditorEngine, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("createEditor")]);
    }
    if (!isPlainObject(options)) {
      return err([
        shapeIssue("Editor options must be an object", options, ["options"]),
      ]);
    }
    return ok(new EditorEngine({ ...options, domain: this.domain }));
  }

  use(plugin: BuilderPlugin): Result<PluginInstallation, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("use")]);
    }
    return installPlugin(this, plugin);
  }

  /**
   * Releases the builder.
   *
   * Disposing is idempotent and closes every operation that would mutate the
   * graph or extend the composition: `register*`, `bindRenderer`, `use`,
   * `createEditor`, `theme.register`/`setDefault`,
   * `layout.register`/`setDefault`, `registries.nodes.unregister`,
   * `registries.edges.unregister`, every mutating `graph.*` call and
   * `document.import` fail with `sdk.disposed`. Reads keep working — `graph`
   * counts, selections, history flags and validation, `document` creation,
   * export, serialization and validation, events and the theme/layout queries —
   * because they observe state the host already received.
   */
  dispose(): void {
    this.disposedFlag = true;
  }

  private addTheme(input: CreateThemeInput): Result<ThemeDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("theme.register")]);
    }
    return registerTheme(this.registries.themes, input, ["themes"]);
  }

  /**
   * Applies a registered theme.
   *
   * The registry stays the owner of the default id — an unknown id is its
   * decision — and the UI state store is what the presentation binding reads.
   */
  private selectTheme(themeId: string): Result<ThemeDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("theme.setDefault")]);
    }
    const selected = this.registries.themes.setDefault(themeId);
    if (!selected.ok) {
      return err([unknownThemeIssue(themeId, this.registries.themes)]);
    }
    this.store.setTheme(themeId);
    return ok(selected.value);
  }

  private activeTheme(): ThemeDefinition {
    const themeId = this.store.getState().themeId;
    return this.registries.themes.get(themeId) ?? this.registries.themes.getDefault();
  }

  private addLayout(layout: LayoutDefinition): Result<LayoutDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("layout.register")]);
    }
    return registerLayout(this.registries.layouts, layout, ["layouts"]);
  }

  /**
   * Applies a registered layout together with the panel state it produces.
   *
   * The layout engine derives that state from the registered panels, so the
   * store never holds a layout whose panels the builder does not know.
   */
  private selectLayout(layoutId: string): Result<LayoutDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("layout.setDefault")]);
    }
    const selected = this.registries.layouts.setDefault(layoutId);
    if (!selected.ok) {
      return err([unknownLayoutIssue(layoutId, this.registries.layouts)]);
    }
    this.store.setLayout(
      layoutId,
      createLayoutState(selected.value, { panels: this.registries.panels.all() }),
    );
    return ok(selected.value);
  }

  private activeLayout(): LayoutDefinition {
    const layoutId = this.store.getState().layoutId;
    return this.registries.layouts.get(layoutId) ?? this.registries.layouts.getDefault();
  }
}

/**
 * Validates a builder configuration and composes a builder from it.
 *
 * Fail-closed by contract: every issue of every configured input is collected
 * and returned together, and no partially wired builder ever escapes.
 */
export function createBuilder(
  configuration: BuilderConfiguration = {},
): Result<Builder, SdkIssues> {
  if (!isPlainObject(configuration)) {
    return err([
      shapeIssue("Builder configuration must be an object", configuration, [
        "configuration",
      ]),
    ]);
  }

  const issues: SdkIssue[] = [];

  const id = configuration.id ?? DEFAULT_BUILDER_ID;
  if (typeof id !== "string") {
    issues.push(shapeIssue("Builder id must be a string", id, ["id"]));
  } else if (!isQualifiedId(id)) {
    issues.push(
      toIssue(
        sdkError(
          "sdk.invalid-id",
          `Builder id "${id}" must be globally qualified, e.g. "vendor.builder"`,
          { path: ["id"], metadata: { value: id } },
        ),
      ),
    );
  }

  const registry = configuration.registry;
  if (registry !== undefined && !isPlainObject(registry)) {
    issues.push(
      shapeIssue(
        "Builder registry must be an object grouping nodes, edges, properties, themes and layouts",
        registry,
        ["registry"],
      ),
    );
  }

  const ui = configuration.ui;
  if (ui !== undefined && !isPlainObject(ui)) {
    issues.push(
      shapeIssue("Builder ui must be an object declaring a theme and a layout", ui, [
        "ui",
      ]),
    );
  } else if (ui !== undefined) {
    if (ui.theme !== undefined && typeof ui.theme !== "string") {
      issues.push(shapeIssue("Builder ui theme must be a theme id", ui.theme, [
        "ui",
        "theme",
      ]));
    }
    if (ui.layout !== undefined && typeof ui.layout !== "string") {
      issues.push(
        shapeIssue("Builder ui layout must be a layout id", ui.layout, ["ui", "layout"]),
      );
    }
  }

  if (configuration.graph !== undefined && !isPlainObject(configuration.graph)) {
    issues.push(
      shapeIssue("Builder graph must be an object declaring a graph id and settings", configuration.graph, [
        "graph",
      ]),
    );
  }

  const declaredGraphLayout = configuration.graph?.layout;
  if (declaredGraphLayout !== undefined) {
    issues.push(...graphLayoutIssues(declaredGraphLayout, ["graph", "layout"]));
  }

  if (configuration.plugins !== undefined && !Array.isArray(configuration.plugins)) {
    issues.push(
      shapeIssue("Builder plugins must be an array of plugin definitions", configuration.plugins, [
        "plugins",
      ]),
    );
  }

  const nodeInputs = declaredList(registry?.nodes, "nodes", issues);
  const edgeInputs = declaredList(registry?.edges, "edges", issues);
  const propertyInputs = declaredList(registry?.properties, "properties", issues);
  const themeInputs = declaredList(registry?.themes, "themes", issues);
  const layoutInputs = declaredList(registry?.layouts, "layouts", issues);

  let adapter: BuilderAdapter | undefined;
  if (configuration.adapter !== undefined) {
    const normalized = normalizeAdapter(configuration.adapter);
    if (normalized.ok) {
      adapter = normalized.value;
    } else {
      issues.push(...normalized.error);
    }
  }

  const features = resolveFeatures(configuration.features);
  if (!features.ok) {
    issues.push(...features.error);
  }

  const documentFormat = resolveDocumentFormat(configuration.document);
  if (!documentFormat.ok) {
    issues.push(...documentFormat.error);
  }

  const nodes = new NodeRegistry();
  const edges = new EdgeRegistry();
  const validators = new ValidatorRegistry();
  const themes = new ThemeRegistry();
  const layouts = new LayoutRegistry();
  const panels = createDefaultPanelRegistry();
  const tools = createDefaultToolRegistry();
  const properties = new RegistryStore<PropertyDefinition>("sdk.properties");
  const domain = new NoderaDomain(nodes, edges, validators);

  let renderers: RendererBindings = EMPTY_RENDERER_BINDINGS;
  const nodeDefinitions: NodeDefinition[] = [];
  const edgeDefinitions: EdgeDefinition[] = [];

  for (const input of nodeInputs) {
    const added = addNode(nodes, renderers, input, (id) => ["registry", "nodes", id]);
    if (!added.ok) {
      issues.push(...added.error);
      continue;
    }
    renderers = added.value.renderers;
    nodeDefinitions.push(added.value.definition);
  }

  for (const input of edgeInputs) {
    const added = addEdge(edges, renderers, input, (id) => ["registry", "edges", id]);
    if (!added.ok) {
      issues.push(...added.error);
      continue;
    }
    renderers = added.value.renderers;
    edgeDefinitions.push(added.value.definition);
  }

  for (const input of propertyInputs) {
    const added = addProperty(properties, renderers, input, (id) => [
      "registry",
      "properties",
      id,
    ]);
    if (!added.ok) {
      issues.push(...added.error);
      continue;
    }
    renderers = added.value.renderers;
  }

  for (const input of themeInputs) {
    const registered = registerTheme(themes, input, ["registry", "themes"]);
    if (!registered.ok) {
      issues.push(...registered.error);
    }
  }

  for (const layout of layoutInputs) {
    const registered = registerLayout(layouts, layout, ["registry", "layouts"]);
    if (!registered.ok) {
      issues.push(...registered.error);
    }
  }

  const themeId = ui?.theme ?? DEFAULT_THEME_ID;
  if (!themes.has(themeId)) {
    issues.push(unknownThemeIssue(themeId, themes, ["ui", "theme"]));
  }

  const layoutId = ui?.layout ?? EDITOR_LAYOUT_ID;
  const layoutDefinition = layouts.get(layoutId);
  if (layoutDefinition === undefined) {
    issues.push(unknownLayoutIssue(layoutId, layouts, ["ui", "layout"]));
  }

  if (issues.length > 0) {
    return err(issues);
  }
  // The gate above proves every collected result is a success.
  if (!features.ok || !documentFormat.ok || layoutDefinition === undefined) {
    return err(issues);
  }

  const diagnostics = capabilityGaps(
    adapter,
    requirementsFrom({ nodes: nodeDefinitions, edges: edgeDefinitions }),
  );

  const store = new UiStateStore({
    themeId,
    layoutId,
    layout: createLayoutState(layoutDefinition, { panels: panels.all() }),
  });

  const graph = configuration.graph;
  const graphLayout = resolveGraphLayout(declaredGraphLayout);
  const editorOptions: EditorEngineOptions = {
    ...(graph?.graphId === undefined ? {} : { graphId: graph.graphId }),
    ...(graph?.settings === undefined ? {} : { graphSettings: graph.settings }),
    domain,
  };

  const builder = new SdkBuilder({
    id,
    adapter,
    features: features.value,
    diagnostics,
    registries: {
      nodes: domain.nodes,
      edges: domain.edges,
      validators: domain.validators,
      themes,
      layouts,
      panels,
      tools,
    },
    properties,
    renderers,
    store,
    documentFormat: documentFormat.value,
    domain,
    editor: new EditorEngine(editorOptions),
    graphLayout,
  });

  // Configured plugins run last, once every declarative registry is populated,
  // so a plugin sees the same builder a host would after construction.
  for (const plugin of Array.isArray(configuration.plugins) ? configuration.plugins : []) {
    const installed = builder.use(plugin);
    if (!installed.ok) {
      issues.push(...installed.error);
    }
  }

  return issues.length === 0 ? ok(builder) : err(issues);
}
