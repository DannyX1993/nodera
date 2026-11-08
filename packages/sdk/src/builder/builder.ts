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
 */

import { ok, err, RegistryStore, type RegistryError, type Result } from "@nodera/contracts";
import { DEFAULT_FORMAT_VERSION, GGD_FORMAT } from "@nodera/document";
import { EditorEngine, type EditorEngineOptions } from "@nodera/application";
import { NoderaDomain } from "@nodera/domain";
import { NodeRegistry, type NodeDefinition } from "@nodera/node-registry";
import { EdgeRegistry, type EdgeDefinition } from "@nodera/edge-registry";
import { ValidatorRegistry } from "@nodera/validation";
import { DEFAULT_THEME_ID, ThemeRegistry } from "@nodera/theme-engine";
import { EDITOR_LAYOUT_ID, LayoutRegistry, createLayoutState } from "@nodera/layout-engine";
import {
  UiStateStore,
  createDefaultPanelRegistry,
  createDefaultToolRegistry,
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
import { toNodeDefinition, type NodeDefinitionInput } from "../authoring/nodes.js";
import { toPropertyDefinition, type PropertyInput } from "../authoring/properties.js";
import type { RendererBinding } from "../authoring/renderer-binding.js";
import {
  isQualifiedId,
  sdkError,
  type SdkError,
  type SdkIssue,
  type SdkIssues,
} from "../errors.js";
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

/** Definition registries the builder owns and shares with its editors. */
export interface BuilderRegistries {
  readonly nodes: NodeRegistry;
  readonly edges: EdgeRegistry;
  readonly validators: ValidatorRegistry;
  readonly themes: ThemeRegistry;
  readonly layouts: LayoutRegistry;
  readonly panels: PanelRegistry;
  readonly tools: ToolRegistry;
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
  /** Portable document facade over the phase-2 document and serializer packages. */
  readonly document: BuilderDocumentApi;
  registerNode(input: NodeDefinitionInput): Result<NodeDefinition, SdkIssues>;
  registerEdge(input: EdgeDefinitionInput): Result<EdgeDefinition, SdkIssues>;
  registerProperty(input: PropertyInput): Result<PropertyDefinition, SdkIssues>;
  registerPanel(panel: PanelDefinition): Result<PanelDefinition, SdkIssues>;
  registerTool(tool: ToolDefinition): Result<ToolDefinition, SdkIssues>;
  bindRenderer(kind: RendererKind, id: string, value: unknown): Result<Builder, SdkError>;
  createEditor(options?: EditorEngineOptions): Result<EditorEngine, SdkError>;
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

function disposed(operation: string): SdkError {
  return sdkError(
    "sdk.disposed",
    `The builder has been disposed; "${operation}" is no longer available`,
    { metadata: { operation } },
  );
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
  if (!VERSION_PATTERN.test(version)) {
    issues.push(
      toIssue(
        sdkError(
          "sdk.document-invalid",
          `Document version "${version}" must be semver-shaped (major.minor.patch)`,
          { path: ["document", "version"], metadata: { value: version } },
        ),
      ),
    );
  }

  return issues.length > 0 ? err(issues) : ok({ format, version });
}

/** Values a fully validated composition needs to build the builder. */
interface BuilderAssemblerOptions {
  readonly id: string;
  readonly adapter: BuilderAdapter | undefined;
  readonly features: ResolvedFeatures;
  readonly diagnostics: SdkIssues;
  readonly registries: BuilderRegistries;
  readonly properties: RegistryStore<PropertyDefinition>;
  readonly renderers: RendererBindings;
  readonly store: UiStateStore;
  readonly documentFormat: BuilderDocumentFormat;
  readonly domain: NoderaDomain;
  readonly editor: EditorEngine;
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

  private readonly domain: NoderaDomain;
  private bindings: RendererBindings;
  private disposedFlag = false;

  constructor(options: BuilderAssemblerOptions) {
    this.id = options.id;
    this.adapter = options.adapter;
    this.features = options.features;
    this.diagnostics = options.diagnostics;
    this.registries = options.registries;
    this.properties = options.properties;
    this.editor = options.editor;
    this.store = options.store;
    this.documentFormat = options.documentFormat;
    this.domain = options.domain;
    this.bindings = options.renderers;
    this.graph = createGraphApi(this.editor);
    this.document = createDocumentApi(this.editor, this.documentFormat);
  }

  get renderers(): RendererBindings {
    return this.bindings;
  }

  registerNode(input: NodeDefinitionInput): Result<NodeDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([toIssue(disposed("registerNode"))]);
    }
    const added = addNode(this.registries.nodes, this.bindings, input, (id) => [
      "nodes",
      id,
    ]);
    if (!added.ok) {
      return err(added.error);
    }
    this.bindings = added.value.renderers;
    return ok(added.value.definition);
  }

  registerEdge(input: EdgeDefinitionInput): Result<EdgeDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([toIssue(disposed("registerEdge"))]);
    }
    const added = addEdge(this.registries.edges, this.bindings, input, (id) => [
      "edges",
      id,
    ]);
    if (!added.ok) {
      return err(added.error);
    }
    this.bindings = added.value.renderers;
    return ok(added.value.definition);
  }

  registerProperty(input: PropertyInput): Result<PropertyDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([toIssue(disposed("registerProperty"))]);
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
      return err([toIssue(disposed("registerPanel"))]);
    }
    const registered = this.registries.panels.register(panel);
    if (!registered.ok) {
      return err([registryIssue(registered.error, ["panels", registered.error.id])]);
    }
    return ok(registered.value);
  }

  registerTool(tool: ToolDefinition): Result<ToolDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([toIssue(disposed("registerTool"))]);
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
  ): Result<Builder, SdkError> {
    if (this.disposedFlag) {
      return err(disposed("bindRenderer"));
    }
    const next = withRendererBinding(this.bindings, kind, { id, value });
    if (!next.ok) {
      return next;
    }
    this.bindings = next.value;
    return ok(this);
  }

  createEditor(options: EditorEngineOptions = {}): Result<EditorEngine, SdkError> {
    if (this.disposedFlag) {
      return err(disposed("createEditor"));
    }
    return ok(new EditorEngine({ ...options, domain: this.domain }));
  }

  /**
   * Releases the builder. Disposing is idempotent and closes every operation
   * that would mutate or extend the composition; the state the host already
   * received stays readable.
   */
  dispose(): void {
    this.disposedFlag = true;
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
  const issues: SdkIssue[] = [];

  const id = configuration.id ?? DEFAULT_BUILDER_ID;
  if (!isQualifiedId(id)) {
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

  for (const input of configuration.registry?.nodes ?? []) {
    const added = addNode(nodes, renderers, input, (id) => ["registry", "nodes", id]);
    if (!added.ok) {
      issues.push(...added.error);
      continue;
    }
    renderers = added.value.renderers;
    nodeDefinitions.push(added.value.definition);
  }

  for (const input of configuration.registry?.edges ?? []) {
    const added = addEdge(edges, renderers, input, (id) => ["registry", "edges", id]);
    if (!added.ok) {
      issues.push(...added.error);
      continue;
    }
    renderers = added.value.renderers;
    edgeDefinitions.push(added.value.definition);
  }

  for (const input of configuration.registry?.properties ?? []) {
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

  const themeId = configuration.ui?.theme ?? DEFAULT_THEME_ID;
  if (!themes.has(themeId)) {
    issues.push(
      toIssue(
        sdkError("sdk.unknown-theme", `No theme registered with id "${themeId}"`, {
          path: ["ui", "theme"],
          metadata: { value: themeId, known: themes.all().map((theme) => theme.id) },
        }),
      ),
    );
  }

  const layoutId = configuration.ui?.layout ?? EDITOR_LAYOUT_ID;
  const layoutDefinition = layouts.get(layoutId);
  if (layoutDefinition === undefined) {
    issues.push(
      toIssue(
        sdkError("sdk.unknown-layout", `No layout registered with id "${layoutId}"`, {
          path: ["ui", "layout"],
          metadata: { value: layoutId, known: layouts.all().map((layout) => layout.id) },
        }),
      ),
    );
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

  const editorOptions: EditorEngineOptions = {
    ...(configuration.graph?.graphId === undefined
      ? {}
      : { graphId: configuration.graph.graphId }),
    ...(configuration.graph?.settings === undefined
      ? {}
      : { graphSettings: configuration.graph.settings }),
    domain,
  };

  return ok(
    new SdkBuilder({
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
    }),
  );
}
