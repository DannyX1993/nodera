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
import {
  NoderaDomain,
  type Exporter,
  type ExporterRegistry,
  type Importer,
  type ImporterRegistry,
} from "@nodera/domain";
import { LayoutStrategyRegistry, type GraphLayoutNodeSize, type GraphLayoutStrategy } from "@nodera/graph-layout";
import { NodeRegistry, type NodeDefinition } from "@nodera/node-registry";
import { EdgeRegistry, type EdgeDefinition } from "@nodera/edge-registry";
import { ValidatorRegistry, type GraphValidator } from "@nodera/validation";
import { DEFAULT_THEME_ID, ThemeRegistry, createTheme } from "@nodera/theme-engine";
import type { CreateThemeInput, ThemeDefinition } from "@nodera/theme-engine";
import { EDITOR_LAYOUT_ID, LayoutRegistry, createLayoutState } from "@nodera/layout-engine";
import {
  DEFAULT_DIALOGS,
  DialogRegistry,
  UiStateStore,
  createDefaultPanelRegistry,
  createDefaultToolRegistry,
  type ConnectionsPolicy,
  type DialogDefinition,
  type DragPolicy,
  type NodeTransition,
  type LayoutDefinition,
  type LayoutPanelPlacement,
  type PanelDefinition,
  type PanelRegistry,
  type PortsPolicy,
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
import {
  createGraphApi,
  unknownLayoutStrategyIssue,
  type BuilderGraphApi,
} from "../graph/graph-api.js";
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
  ArrangeOnChange,
  BuilderConfiguration,
  BuilderDocumentConfiguration,
  BuilderDocumentFormat,
  GraphLayoutConfiguration,
  RemovalPolicy,
  ViewportConfiguration,
} from "./configuration.js";
import {
  createFeaturesApi,
  resolveFeatures,
  type BuilderFeaturesApi,
  type EdgeWaypointConditions,
  type ResolvedFeatures,
} from "./features.js";

/**
 * Drag policy of a manual node drag, re-exported from `@nodera/ui-core` because
 * it is part of what `builder.graphLayout` reads and writes.
 */
export type { DragPolicy } from "@nodera/ui-core";

/**
 * Runtime feature API of an assembled builder, resolved and bound by
 * `createBuilder` (`builder.features`).
 */
export type { BuilderFeaturesApi } from "./features.js";

/**
 * Connections policy of the canvas, re-exported from `@nodera/ui-core` because
 * it is part of what `builder.graphLayout` reads and writes.
 */
export type { ConnectionsPolicy } from "@nodera/ui-core";

/**
 * Ports policy of the node surface, re-exported from `@nodera/ui-core` because
 * it is part of what `builder.graphLayout` reads and writes.
 */
export type { PortsPolicy } from "@nodera/ui-core";

export type { NodeTransition } from "@nodera/ui-core";

/** Id of a builder the host did not name. */
export const DEFAULT_BUILDER_ID = "nodera.builder";

/**
 * React Flow padding a camera framing uses when the host declares none.
 *
 * The presentation binding applies the same default (`canvas/viewport-fit.ts`),
 * restated here because the SDK cannot import a presentation package: the host
 * reads the resolved value from `builder.viewport()` and the canvas falls back to
 * the same number when it receives a raw configuration.
 */
const DEFAULT_VIEWPORT_PADDING = 0.1;

/** Animation length, in milliseconds, a camera framing uses by default. */
const DEFAULT_VIEWPORT_DURATION = 200;

/** Zoom ceiling a camera framing fits under when the host declares none. */
const DEFAULT_VIEWPORT_MAX_ZOOM = 1.5;

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
  readonly dialogs: DialogRegistry;
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

/**
 * Graph placement surface of the builder: the strategy registry plus the
 * selection `builder.graph.arrange()` reads.
 *
 * This is how a host installs its own adapter — a `@dagrejs/dagre` wrapper or
 * any other algorithm — and selects it by id. The framework ships the `free`
 * no-op and the in-house layered strategy; it ships no external layouter. There
 * is deliberately no runtime toggle a user could flip: the selection is host
 * configuration, exactly like the mode and the direction.
 */
export interface BuilderGraphLayoutApi {
  /**
   * Registers one strategy implementation.
   *
   * A used id is a `sdk.duplicate-id`, never a silent override: a plugin cannot
   * shadow the strategy the host already selected.
   */
  register(strategy: GraphLayoutStrategy): Result<GraphLayoutStrategy, SdkIssues>;
  /**
   * Removes one strategy, so a plugin uninstalled by the host leaves no entry
   * behind.
   *
   * An unknown id is a `sdk.unknown-definition`, never a silent no-op, and the
   * registry moves the active selection to a strategy that remains when the
   * removed one was active — so a removed strategy can never be the one
   * `arrange` runs next.
   */
  unregister(strategyId: string): Result<GraphLayoutStrategy, SdkIssues>;
  /** Selects the strategy `arrange` runs; an unknown id is an explicit diagnostic. */
  setDefault(strategyId: string): Result<GraphLayoutStrategy, SdkIssues>;
  /** Globally qualified id of the strategy `arrange` runs today. */
  active(): string;
  /** Every registered strategy, in registration order. */
  all(): readonly GraphLayoutStrategy[];
  /**
   * Drag policy the canvas applies today.
   *
   * It is the policy declared in `graph.layout.drag` when the layout owns the
   * positions (`mode: "auto"`, default `"locked"`), and `"free"` when the host
   * owns them, unless the host changed it at runtime with
   * {@link BuilderGraphLayoutApi.setDragPolicy}.
   */
  dragPolicy(): DragPolicy;
  /**
   * Changes what a manual drag does, and reflects it in the UI state the canvas
   * reads, so a presentation binding re-renders without a rebuild.
   *
   * It never rewrites a document position by itself: `"free"` keeps today's
   * drag-and-commit, `"locked"` and `"snap-back"` leave every assigned position
   * alone. A value outside the union is refused with `sdk.invalid-input` at
   * `graph.layout.drag` and the previous policy stays.
   */
  setDragPolicy(policy: DragPolicy): Result<DragPolicy, SdkIssues>;
  /**
   * Whether a node moves to its new position or appears there.
   *
   * It is the policy declared in `graph.layout.nodeTransition` (`"instant"` by
   * default, today's behaviour), unless the host changed it at runtime with
   * {@link BuilderGraphLayoutApi.setNodeTransition}. `"animated"` makes a node
   * glide to the position the document holds, which is what makes a drag under
   * `"snap-back"` visible; an active drag is never animated.
   */
  nodeTransition(): NodeTransition;
  /**
   * Changes whether a node moves to its new position or appears there, and
   * reflects it in the UI state the canvas reads, so a presentation binding
   * re-renders without a rebuild.
   *
   * It never writes a document position by itself and pushes no history entry. A
   * value outside the union is refused with `sdk.invalid-input` at
   * `graph.layout.nodeTransition` and the previous transition stays.
   */
  setNodeTransition(policy: NodeTransition): Result<NodeTransition, SdkIssues>;
  /**
   * Connections policy the canvas applies today.
   *
   * It is the policy declared in `graph.layout.connections` (`"editable"` by
   * default): `"fixed"` makes the canvas offer no connectable handle and refuse
   * a connection that arrives anyway, so nobody adds an edge the arrangement the
   * layout owns does not know about. Unless the host changed it at runtime with
   * {@link BuilderGraphLayoutApi.setConnectionsPolicy}.
   */
  connectionsPolicy(): ConnectionsPolicy;
  /**
   * Changes whether a person may draw a new connection, and reflects it in the
   * UI state the canvas reads, so a presentation binding re-renders without a
   * rebuild.
   *
   * It never writes an edge by itself and never touches the ones the document
   * holds; existing edges stay editable in the document. A value outside the
   * union is refused with `sdk.invalid-input` at `graph.layout.connections` and
   * the previous policy stays.
   */
  setConnectionsPolicy(policy: ConnectionsPolicy): Result<ConnectionsPolicy, SdkIssues>;
  /**
   * Ports policy the node surface applies today.
   *
   * It is the policy declared in `graph.layout.ports` (`"visible"` by default):
   * `"hidden"` renders no port handle at all while node renderers keep receiving
   * their port data. Unless the host changed it at runtime with
   * {@link BuilderGraphLayoutApi.setPortsPolicy}.
   */
  portsPolicy(): PortsPolicy;
  /**
   * Changes whether the node surface paints its port handles, and reflects it in
   * the UI state the canvas reads, so a presentation binding re-renders without
   * a rebuild.
   *
   * It never writes anything: hiding a handle removes a control, not a port. A
   * value outside the union is refused with `sdk.invalid-input` at
   * `graph.layout.ports` and the previous policy stays.
   */
  setPortsPolicy(policy: PortsPolicy): Result<PortsPolicy, SdkIssues>;
  /**
   * What a structural change does with the positions the layout owns today.
   *
   * It is the policy declared in `graph.layout.arrangeOnChange` (`"never"` by
   * default), unless the host changed it at runtime with
   * {@link BuilderGraphLayoutApi.setArrangeOnChange}. `"downstream"` arranges the
   * node an `insertNode` created — and the target of a `connect` — together with
   * its descendants, after the mutation and as its own history unit.
   *
   * The policy only takes effect while the layout owns the positions
   * (`mode: "auto"`): in `"free"` mode the host places every node, so nothing is
   * arranged automatically whatever the value says. It is configuration a host
   * writes, never a control the framework puts in front of a user.
   */
  arrangeOnChange(): ArrangeOnChange;
  /**
   * Changes what a structural change arranges automatically.
   *
   * Unlike the drag, connections and ports policies this one is not presentation
   * state: it decides what the SDK writes to the document, so it lives in the
   * builder and never touches the UI state. It writes no position on its own. A
   * value outside the union is refused with `sdk.invalid-input` at
   * `graph.layout.arrangeOnChange` and the previous policy stays.
   */
  setArrangeOnChange(policy: ArrangeOnChange): Result<ArrangeOnChange, SdkIssues>;
  /**
   * What removing a node does today: `"detach"` or `"splice"`.
   *
   * It is the policy declared in `graph.layout.onRemove` (`"detach"` by
   * default), unless the host changed it at runtime with
   * {@link BuilderGraphLayoutApi.setRemovalPolicy}. `"splice"` makes
   * `builder.graph.removeNode` join every predecessor to every successor inside
   * the removal's own history unit, so one undo restores the node and its
   * original edges; `"detach"` keeps today's behaviour exactly.
   *
   * Like the other policies it is host configuration, never a control the
   * framework puts in front of a user.
   */
  removalPolicy(): RemovalPolicy;
  /**
   * Changes what removing a node does with the relations it carried.
   *
   * Like {@link BuilderGraphLayoutApi.setArrangeOnChange} this one decides what
   * the SDK writes to the document, so it lives in the builder and never touches
   * the UI state. It writes nothing on its own. A value outside the union is
   * refused with `sdk.invalid-input` at `graph.layout.onRemove` and the previous
   * policy stays.
   */
  setRemovalPolicy(policy: RemovalPolicy): Result<RemovalPolicy, SdkIssues>;
}

/**
 * Dialog surface of the builder: the registry the UI state resolves dialog ids
 * from.
 *
 * A dialog is opened through the store (`builder.store.openDialog(id)`), which
 * refuses an id no registered definition matches, so “the open dialog is always
 * a registered one” holds by construction. The open id itself is presentation
 * state and lives in the store, not here.
 */
export interface BuilderDialogApi {
  /** Registers one declarative dialog; a used id is `sdk.duplicate-id`. */
  register(dialog: DialogDefinition): Result<DialogDefinition, SdkIssues>;
  /**
   * Removes one dialog and closes it when it was the open one.
   *
   * An unknown id is a `sdk.unknown-definition`. The store owns the open id, so
   * the removal closes it in the same call that unregisters it: “the open dialog
   * is a registered one” stays true however a plugin is uninstalled.
   */
  unregister(dialogId: string): Result<DialogDefinition, SdkIssues>;
  /** Every registered dialog, in registration order. */
  all(): readonly DialogDefinition[];
}

/**
 * Validator surface of the builder: the graph-validator registry the editing
 * session validates with.
 *
 * A validator is code, not declarative data, so this is the composition point
 * where an extension contributes a rule (AGENTS.md §9) and the one where it is
 * withdrawn again.
 */
export interface BuilderValidatorApi {
  /** Registers one graph validator; a used id is `sdk.duplicate-id`. */
  register(validator: GraphValidator): Result<GraphValidator, SdkIssues>;
  /** Removes one graph validator; an unknown id is `sdk.unknown-definition`. */
  unregister(validatorId: string): Result<GraphValidator, SdkIssues>;
  /** Every registered graph validator, in registration order. */
  all(): readonly GraphValidator[];
}

/**
 * Importer surface of the builder: the domain registry a host resolves import
 * formats from.
 *
 * An importer is the inbound half of the portable document boundary, so a
 * plugin contributes it through the same registry the framework's own formats
 * use and never through a private path.
 */
export interface BuilderImporterApi {
  /** Registers one importer; a used id is `sdk.duplicate-id`. */
  register(importer: Importer): Result<Importer, SdkIssues>;
  /** Removes one importer; an unknown id is `sdk.unknown-definition`. */
  unregister(importerId: string): Result<Importer, SdkIssues>;
  /** Every registered importer, in registration order. */
  all(): readonly Importer[];
}

/** Exporter surface of the builder: the outbound half of the same boundary. */
export interface BuilderExporterApi {
  /** Registers one exporter; a used id is `sdk.duplicate-id`. */
  register(exporter: Exporter): Result<Exporter, SdkIssues>;
  /** Removes one exporter; an unknown id is `sdk.unknown-definition`. */
  unregister(exporterId: string): Result<Exporter, SdkIssues>;
  /** Every registered exporter, in registration order. */
  all(): readonly Exporter[];
}

/** The assembled builder: the only object a host needs after configuration. */
export interface Builder {
  /** Globally qualified builder id. */
  readonly id: string;
  /** Presentation engine the host selected, if any. */
  readonly adapter: BuilderAdapter | undefined;
  /** Feature flags the builder resolved from the configuration. */
  readonly features: BuilderFeaturesApi;
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
   * five SDK-owned plugin events (registration, failure and the Phase 7
   * lifecycle).
   */
  readonly events: BuilderEventApi;
  /** Theme contributions, bound to the builder's UI state store. */
  readonly theme: BuilderThemeApi;
  /** Layout contributions, bound to the builder's UI state store. */
  readonly layout: BuilderLayoutApi;
  /**
   * Dialog contributions, resolved by the builder's UI state store.
   *
   * The store is composed with these definitions, so `builder.store.openDialog`
   * works for the built-in node-creation dialog out of the box and for every
   * dialog the host declares or registers here.
   */
  readonly dialogs: BuilderDialogApi;
  /**
   * Graph validators the editing session validates with.
   *
   * The escape hatch a plugin uses to contribute code, not data: the registry is
   * the one the session's validation reads, so a validator registered here takes
   * part in the next validation with no re-composition.
   */
  readonly validators: BuilderValidatorApi;
  /** Import formats the host can read documents with. */
  readonly importers: BuilderImporterApi;
  /** Export formats the host can write documents with. */
  readonly exporters: BuilderExporterApi;
  /**
   * Placement strategies, and the one an explicit `graph.arrange()` runs.
   *
   * The extension point for a third-party layouter: register it here, select it
   * by id here (or declare it in `graph.layout.strategy`), and `arrange` uses it
   * without any other layer changing.
   */
  readonly graphLayout: BuilderGraphLayoutApi;
  /**
   * Camera framing the host declared, with the documented defaults applied.
   *
   * A reader, not a toggle: the framing is host configuration, so there is no
   * UI state behind it. `undefined` means the host declared no camera
   * configuration at all, which is what keeps a canvas on today's plain React
   * Flow `fitView` with no movement on selection. The value can be replaced at
   * runtime with {@link Builder.setViewport}.
   *
   * It is presentation data only (AGENTS.md §5.3): nothing here reaches the
   * document, the UI state, a node's data or the history, and applying a framing
   * emits no application event. The presentation binding reads it through a live
   * reader (`GraphCanvas.viewportFit`).
   */
  viewport(): ViewportConfiguration | undefined;
  /**
   * Replaces the camera configuration at runtime.
   *
   * `undefined` restores today's behaviour (no start framing beyond React Flow's
   * own `fitView`, no camera movement on selection). The value is validated with
   * the same rules as creation; an invalid one is refused and the previous
   * configuration stays in force.
   *
   * The same document discipline holds as for the creation-time group: no
   * document write, no UI state, no history unit and no application event — the
   * canvas picks the new framing up through its live reader, so a `selection`
   * change applies on the next selection change and a `start` change needs a new
   * canvas mount.
   */
  setViewport(
    viewport: ViewportConfiguration | undefined,
  ): Result<ViewportConfiguration | undefined, SdkIssues>;
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
 * The host declares who owns placement and which strategy an explicit
 * `Arrange` runs; a value outside the declared unions, a spacing that is not a
 * positive finite number, a fallback node box with an extent that is not one, or
 * a strategy id no registry entry matches is a configuration problem the builder
 * reports instead of guessing a geometry.
 */
function graphLayoutIssues(
  layout: unknown,
  path: readonly string[],
  strategies: LayoutStrategyRegistry,
): SdkIssue[] {
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
  const strategy: unknown = Reflect.get(layout, "strategy");
  if (strategy !== undefined) {
    if (typeof strategy !== "string") {
      issues.push(
        shapeIssue(
          "Builder graph layout strategy must be a globally qualified strategy id",
          strategy,
          [...path, "strategy"],
        ),
      );
    } else if (!strategies.has(strategy)) {
      issues.push(
        unknownLayoutStrategyIssue(
          strategy,
          strategies.all().map((registered) => registered.id),
          [...path, "strategy"],
        ),
      );
    }
  }
  const rankSpacing: unknown = Reflect.get(layout, "rankSpacing");
  if (
    rankSpacing !== undefined &&
    !(typeof rankSpacing === "number" && Number.isFinite(rankSpacing) && rankSpacing > 0)
  ) {
    issues.push(
      shapeIssue(
        "Builder graph layout rankSpacing must be a positive finite number",
        rankSpacing,
        [...path, "rankSpacing"],
      ),
    );
  }
  issues.push(...nodeSizeIssues(Reflect.get(layout, "nodeSize"), [...path, "nodeSize"]));
  const drag: unknown = Reflect.get(layout, "drag");
  if (drag !== undefined && drag !== "locked" && drag !== "snap-back") {
    issues.push(
      shapeIssue(
        'Builder graph layout drag policy must be "locked" or "snap-back"',
        drag,
        [...path, "drag"],
      ),
    );
  }
  const nodeTransition: unknown = Reflect.get(layout, "nodeTransition");
  if (
    nodeTransition !== undefined &&
    nodeTransition !== "animated" &&
    nodeTransition !== "instant"
  ) {
    issues.push(
      shapeIssue(
        'Builder graph layout node transition must be "animated" or "instant"',
        nodeTransition,
        [...path, "nodeTransition"],
      ),
    );
  }
  const connections: unknown = Reflect.get(layout, "connections");
  if (connections !== undefined && connections !== "editable" && connections !== "fixed") {
    issues.push(
      shapeIssue(
        'Builder graph layout connections policy must be "editable" or "fixed"',
        connections,
        [...path, "connections"],
      ),
    );
  }
  const ports: unknown = Reflect.get(layout, "ports");
  if (ports !== undefined && ports !== "visible" && ports !== "hidden") {
    issues.push(
      shapeIssue(
        'Builder graph layout ports policy must be "visible" or "hidden"',
        ports,
        [...path, "ports"],
      ),
    );
  }
  const arrangeOnChange: unknown = Reflect.get(layout, "arrangeOnChange");
  if (
    arrangeOnChange !== undefined &&
    arrangeOnChange !== "never" &&
    arrangeOnChange !== "downstream"
  ) {
    issues.push(
      shapeIssue(
        'Builder graph layout arrangeOnChange must be "never" or "downstream"',
        arrangeOnChange,
        [...path, "arrangeOnChange"],
      ),
    );
  }
  const onRemove: unknown = Reflect.get(layout, "onRemove");
  if (onRemove !== undefined && onRemove !== "detach" && onRemove !== "splice") {
    issues.push(
      shapeIssue(
        'Builder graph layout removal policy must be "detach" or "splice"',
        onRemove,
        [...path, "onRemove"],
      ),
    );
  }
  return issues;
}

/**
 * Structural checks of the default node box `Arrange` reserves room for.
 *
 * The strategy validates the same box again — it is the layer that builds the
 * geometry, and a host that bypasses these types reaches it directly — but the
 * builder refuses it at the composition boundary, with the offending field
 * named, so a host learns it from its own configuration instead of from a
 * refused `arrange()` call later on.
 */
function nodeSizeIssues(nodeSize: unknown, path: readonly string[]): SdkIssue[] {
  if (nodeSize === undefined) {
    return [];
  }
  if (!isPlainObject(nodeSize)) {
    return [
      shapeIssue(
        "Builder graph layout nodeSize must be an object declaring a width and a height",
        nodeSize,
        path,
      ),
    ];
  }
  const issues: SdkIssue[] = [];
  for (const field of ["width", "height"] as const) {
    const extent: unknown = Reflect.get(nodeSize, field);
    if (!isPositiveFiniteNumber(extent)) {
      issues.push(
        shapeIssue(
          `Builder graph layout nodeSize ${field} must be a positive finite number`,
          extent,
          [...path, field],
        ),
      );
    }
  }
  return issues;
}

/**
 * Whether a declared camera value is a positive finite number.
 *
 * Zero is refused along with the negatives: a zoom of `0` frames nothing and a
 * padding of `0` asks for no margin at all, so neither can be told apart from a
 * malformed value at the boundary that validates the configuration.
 */
function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Structural checks of the zoom rule both viewport groups carry: `zoom`,
 * `maxZoom`, `padding` and `duration`.
 *
 * `owner` names the group in the message (`Builder viewport start`, …) so the
 * host reads which of the two rules is wrong, not only where.
 */
function viewportZoomIssues(
  group: object,
  path: readonly string[],
  owner: string,
): SdkIssue[] {
  const issues: SdkIssue[] = [];
  for (const field of ["zoom", "maxZoom", "padding"] as const) {
    const value: unknown = Reflect.get(group, field);
    if (value !== undefined && !isPositiveFiniteNumber(value)) {
      issues.push(
        shapeIssue(`${owner} ${field} must be a positive finite number`, value, [
          ...path,
          field,
        ]),
      );
    }
  }
  const duration: unknown = Reflect.get(group, "duration");
  if (
    duration !== undefined &&
    !(typeof duration === "number" && Number.isFinite(duration) && duration >= 0)
  ) {
    issues.push(
      shapeIssue(`${owner} duration must be a non-negative finite number`, duration, [
        ...path,
        "duration",
      ]),
    );
  }
  return issues;
}

/**
 * Structural checks of the camera framing configuration.
 *
 * Modelled on {@link graphLayoutIssues}: the host declares what the canvas frames
 * and at which zoom, and a value the declared shape cannot hold — a group that
 * is not an object, an empty node id, a zoom, ceiling or padding that is not a
 * positive finite number, an animation length that is negative or not finite, a
 * `selection.edges` that is not a boolean — is reported where it sits rather
 * than dropped, so nothing is silently half-applied.
 */
function viewportIssues(viewport: unknown, path: readonly string[]): SdkIssue[] {
  if (!isPlainObject(viewport)) {
    return [
      shapeIssue(
        "Builder viewport must be an object declaring start and selection",
        viewport,
        path,
      ),
    ];
  }

  const issues: SdkIssue[] = [];
  const start: unknown = Reflect.get(viewport, "start");
  if (start !== undefined) {
    if (!isPlainObject(start)) {
      issues.push(
        shapeIssue(
          "Builder viewport start must be an object declaring the node and leading zoom",
          start,
          [...path, "start"],
        ),
      );
    } else {
      const node: unknown = Reflect.get(start, "node");
      if (node !== undefined && !(typeof node === "string" && node.trim().length > 0)) {
        issues.push(
          shapeIssue("Builder viewport start node must be a non-empty node id", node, [
            ...path,
            "start",
            "node",
          ]),
        );
      }
      issues.push(...viewportZoomIssues(start, [...path, "start"], "Builder viewport start"));
    }
  }

  const selection: unknown = Reflect.get(viewport, "selection");
  if (selection !== undefined) {
    if (!isPlainObject(selection)) {
      issues.push(
        shapeIssue(
          "Builder viewport selection must be an object declaring the zoom rule of a selection",
          selection,
          [...path, "selection"],
        ),
      );
    } else {
      issues.push(
        ...viewportZoomIssues(selection, [...path, "selection"], "Builder viewport selection"),
      );
      const edges: unknown = Reflect.get(selection, "edges");
      if (edges !== undefined && typeof edges !== "boolean") {
        issues.push(
          shapeIssue("Builder viewport selection edges must be a boolean", edges, [
            ...path,
            "selection",
            "edges",
          ]),
        );
      }
    }
  }
  return issues;
}

/**
 * Resolves the camera framing a validated configuration declares.
 *
 * The defaults are applied here once — React Flow padding `0.1`, animation
 * length `200` ms and zoom ceiling `1.5`, the same values the presentation
 * binding falls back to — so the host reads one frozen object instead of
 * repeating the same fallbacks. A group the host did not declare stays absent,
 * which is what keeps a canvas with no camera configuration on today's plain
 * `fitView`, and a field the host did not declare stays absent too (the node id,
 * the absolute zoom), because `undefined` is not a value here: it is the absence
 * of a rule.
 */
function resolveViewport(
  configuration: ViewportConfiguration | undefined,
): ViewportConfiguration | undefined {
  if (configuration === undefined) {
    return undefined;
  }
  const start = configuration.start;
  const selection = configuration.selection;
  return Object.freeze({
    ...(start === undefined
      ? {}
      : {
          start: Object.freeze({
            ...(start.node === undefined ? {} : { node: start.node }),
            ...(start.zoom === undefined ? {} : { zoom: start.zoom }),
            maxZoom: start.maxZoom ?? DEFAULT_VIEWPORT_MAX_ZOOM,
            padding: start.padding ?? DEFAULT_VIEWPORT_PADDING,
            duration: start.duration ?? DEFAULT_VIEWPORT_DURATION,
          }),
        }),
    ...(selection === undefined
      ? {}
      : {
          selection: Object.freeze({
            ...(selection.zoom === undefined ? {} : { zoom: selection.zoom }),
            maxZoom: selection.maxZoom ?? DEFAULT_VIEWPORT_MAX_ZOOM,
            padding: selection.padding ?? DEFAULT_VIEWPORT_PADDING,
            duration: selection.duration ?? DEFAULT_VIEWPORT_DURATION,
            edges: selection.edges ?? false,
          }),
        }),
  });
}

/**
 * Resolves the drag policy a validated configuration declares.
 *
 * The policy describes what a manual drag does with the positions the **layout**
 * assigned, so it only applies when the layout owns placement: `"free"` mode
 * means the host owns them, and a drag keeps committing (today's behaviour)
 * whatever `drag` says. In `"auto"` mode the declared policy wins and `"locked"`
 * is the default — a graph the layout controls is not draggable unless the host
 * says otherwise. Fail-closed like the rest of the configuration: an unknown
 * value can never unlock a drag.
 */
function resolveDragPolicy(configuration: GraphLayoutConfiguration | undefined): DragPolicy {
  if (configuration?.mode !== "auto") {
    return "free";
  }
  return configuration.drag === "snap-back" ? "snap-back" : "locked";
}

/**
 * Resolves the node transition a validated configuration declares.
 *
 * Independent of the placement mode and of who owns the positions: how a node
 * reaches its position is presentation, so it applies to a layout-owned graph
 * and to a hand-positioned one alike. Fail-closed like the rest of the
 * configuration: `"instant"` — today's behaviour — is the default, so an
 * unknown value never animates a canvas nobody asked to animate.
 */
function resolveNodeTransition(
  configuration: GraphLayoutConfiguration | undefined,
): NodeTransition {
  return configuration?.nodeTransition === "animated" ? "animated" : "instant";
}

/**
 * Resolves the connections policy a validated configuration declares.
 *
 * Unlike the drag policy it does not depend on who owns placement: a graph the
 * host positions by hand may still fix its connections (an imported graph, a
 * read-only inspection surface), so the declared value always wins and
 * `"editable"` — today's behaviour — is the default. Fail-closed like the rest of
 * the configuration: only `"fixed"` fixes anything, so an unknown value can
 * never take connections away from a host that did not ask for it.
 */
function resolveConnectionsPolicy(
  configuration: GraphLayoutConfiguration | undefined,
): ConnectionsPolicy {
  return configuration?.connections === "fixed" ? "fixed" : "editable";
}

/**
 * Resolves the ports policy a validated configuration declares.
 *
 * Same rule as the connections policy: independent of the placement mode, the
 * declared value wins and `"visible"` — today's behaviour — is the default, so an
 * unknown value never hides a handle nobody asked to hide.
 */
function resolvePortsPolicy(configuration: GraphLayoutConfiguration | undefined): PortsPolicy {
  return configuration?.ports === "hidden" ? "hidden" : "visible";
}

/**
 * Resolves the automatic arrangement policy a validated configuration declares.
 *
 * Fail-closed like the rest of the configuration: only `"downstream"` arranges
 * anything, so an unknown value can never move a graph nobody asked to have
 * moved. The placement mode is not folded in here — the policy is what the host
 * declared, and `mode: "free"` is where it stops applying, which the graph API
 * enforces so the getter keeps reporting the declaration.
 */
function resolveArrangeOnChange(
  configuration: GraphLayoutConfiguration | undefined,
): ArrangeOnChange {
  return configuration?.arrangeOnChange === "downstream" ? "downstream" : "never";
}

/**
 * Resolves the removal policy a validated configuration declares.
 *
 * Unlike the drag policy it does not depend on who owns placement: whether a
 * removed node leaves a hole or is spliced over is graph semantics, not geometry,
 * so the declared value always wins and `"detach"` — today's behaviour — is the
 * default. Fail-closed like the rest of the configuration: only `"splice"`
 * splices, so an unknown value can never join relations nobody asked to join.
 * The placement mode still gates the automatic arrangement that follows a splice.
 */
function resolveRemovalPolicy(
  configuration: GraphLayoutConfiguration | undefined,
): RemovalPolicy {
  return configuration?.onRemove === "splice" ? "splice" : "detach";
}

/**
 * Structural checks of one placement strategy the host hands in.
 *
 * `LayoutStrategyRegistry` owns duplicate and unknown ids only; a strategy
 * without an id or without a `place` function would be stored under an unusable
 * key, so the SDK checks the shape before the registry sees it.
 */
function strategyIssues(strategy: unknown, path: readonly string[]): SdkIssue[] {
  if (!isPlainObject(strategy)) {
    return [
      shapeIssue(
        "A layout strategy must be an object declaring an id and a place function",
        strategy,
        path,
      ),
    ];
  }
  const issues: SdkIssue[] = [];
  const id: unknown = Reflect.get(strategy, "id");
  if (typeof id !== "string" || id.trim().length === 0) {
    issues.push(identifierFieldIssue("Layout strategy", "id", id, [...path, "id"]));
  }
  const place: unknown = Reflect.get(strategy, "place");
  if (typeof place !== "function") {
    issues.push(
      shapeIssue("A layout strategy must declare a place function", place, [
        ...path,
        "place",
      ]),
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
 * Structural checks of one dialog definition.
 *
 * `DialogRegistry` owns duplicate and unknown ids only, so the SDK checks the
 * two fields a dialog cannot do without: the id it is opened by, and the title
 * the renderer uses as its accessible name.
 */
function dialogIssues(dialog: unknown, path: readonly string[]): SdkIssue[] {
  if (!isPlainObject(dialog)) {
    return [
      shapeIssue("A dialog must be an object declaring an id and a title", dialog, path),
    ];
  }
  const issues: SdkIssue[] = [];
  const id: unknown = Reflect.get(dialog, "id");
  if (typeof id !== "string" || id.trim().length === 0) {
    issues.push(identifierFieldIssue("Dialog", "id", id, [...path, "id"]));
  }
  const title: unknown = Reflect.get(dialog, "title");
  if (typeof title !== "string" || title.trim().length === 0) {
    issues.push(stringFieldIssue("Dialog", "title", title, [...path, "title"]));
  }
  return issues;
}

/**
 * Structural checks of one graph validator.
 *
 * `ValidatorRegistry` owns duplicate and unknown ids only, so the SDK checks
 * what an extension contributes as code: the id it is registered under, the
 * level it reports at, and the function that produces the issues.
 */
function validatorIssues(validator: unknown, path: readonly string[]): SdkIssue[] {
  if (!isPlainObject(validator)) {
    return [
      shapeIssue(
        "A validator must be an object declaring an id, a level and a validate function",
        validator,
        path,
      ),
    ];
  }
  const issues: SdkIssue[] = [];
  const id: unknown = Reflect.get(validator, "id");
  if (typeof id !== "string" || id.trim().length === 0) {
    issues.push(identifierFieldIssue("Validator", "id", id, [...path, "id"]));
  }
  const level: unknown = Reflect.get(validator, "level");
  if (typeof level !== "string" || level.trim().length === 0) {
    issues.push(stringFieldIssue("Validator", "level", level, [...path, "level"]));
  }
  const validate: unknown = Reflect.get(validator, "validate");
  if (typeof validate !== "function") {
    issues.push(
      shapeIssue("A validator must declare validate as a function", validate, [
        ...path,
        "validate",
      ]),
    );
  }
  return issues;
}

/** Registers one graph validator after checking its structure. */
function registerValidator(
  validators: ValidatorRegistry,
  validator: unknown,
  path: readonly string[],
): Result<GraphValidator, SdkIssues> {
  const issues = validatorIssues(validator, path);
  if (issues.length > 0) {
    return err(issues);
  }
  const registered = validators.registerValidator(validator as GraphValidator);
  if (!registered.ok) {
    return err([registryIssue(registered.error, [...path, registered.error.id])]);
  }
  return ok(registered.value);
}

/**
 * Structural checks of one importer or exporter.
 *
 * Both kinds share the same declared shape — identity, format, version and the
 * function that does the work — so one check keeps them from drifting apart.
 * The registry owns conflicts only; a code contribution is checked here.
 */
function ioIssues(
  owner: "importer" | "exporter",
  entry: unknown,
  operation: "importContent" | "exportContent",
  path: readonly string[],
): SdkIssue[] {
  if (!isPlainObject(entry)) {
    return [
      shapeIssue(
        `An ${owner} must be an object declaring an id, a format, a version and a ${operation} function`,
        entry,
        path,
      ),
    ];
  }
  const named = owner === "importer" ? "Importer" : "Exporter";
  const issues: SdkIssue[] = [];
  const id: unknown = Reflect.get(entry, "id");
  if (typeof id !== "string" || id.trim().length === 0) {
    issues.push(identifierFieldIssue(named, "id", id, [...path, "id"]));
  }
  const format: unknown = Reflect.get(entry, "format");
  if (typeof format !== "string" || format.trim().length === 0) {
    issues.push(stringFieldIssue(named, "format", format, [...path, "format"]));
  }
  const version: unknown = Reflect.get(entry, "version");
  if (typeof version !== "string" || version.trim().length === 0) {
    issues.push(stringFieldIssue(named, "version", version, [...path, "version"]));
  }
  const behaviour: unknown = Reflect.get(entry, operation);
  if (typeof behaviour !== "function") {
    issues.push(
      shapeIssue(`An ${owner} must declare ${operation} as a function`, behaviour, [
        ...path,
        operation,
      ]),
    );
  }
  return issues;
}

/** Registers one importer after checking its structure. */
function registerImporter(
  importers: ImporterRegistry,
  importer: unknown,
  path: readonly string[],
): Result<Importer, SdkIssues> {
  const issues = ioIssues("importer", importer, "importContent", path);
  if (issues.length > 0) {
    return err(issues);
  }
  const registered = importers.register(importer as Importer);
  if (!registered.ok) {
    return err([registryIssue(registered.error, [...path, registered.error.id])]);
  }
  return ok(registered.value);
}

/** Registers one exporter after checking its structure. */
function registerExporter(
  exporters: ExporterRegistry,
  exporter: unknown,
  path: readonly string[],
): Result<Exporter, SdkIssues> {
  const issues = ioIssues("exporter", exporter, "exportContent", path);
  if (issues.length > 0) {
    return err(issues);
  }
  const registered = exporters.register(exporter as Exporter);
  if (!registered.ok) {
    return err([registryIssue(registered.error, [...path, registered.error.id])]);
  }
  return ok(registered.value);
}

/** Registers one dialog definition after checking its structure. */
function registerDialog(
  dialogs: DialogRegistry,
  dialog: unknown,
  path: readonly string[],
): Result<DialogDefinition, SdkIssues> {
  const issues = dialogIssues(dialog, path);
  if (issues.length > 0) {
    return err(issues);
  }
  const registered = dialogs.register(dialog as DialogDefinition);
  if (!registered.ok) {
    return err([registryIssue(registered.error, [...path, registered.error.id])]);
  }
  return ok(registered.value);
}

/**
 * Composes the dialog registry the UI state resolves ids from.
 * A declared list replaces the framework's built-in dialogs (`DialogRegistry`'s
 * own seeding rule). Either source is registered through {@link registerDialog},
 * so a duplicate id or a malformed definition becomes an `sdk.duplicate-id` /
 * `sdk.invalid-input` issue with its path instead of the throw the registry
 * constructor would raise — and the builder is consequently never created.
 */
function dialogRegistryFrom(declared: unknown, issues: SdkIssue[]): DialogRegistry {
  if (declared !== undefined && !Array.isArray(declared)) {
    issues.push(
      shapeIssue(
        'Builder registry "dialogs" must be an array of dialog definitions',
        declared,
        ["registry", "dialogs"],
      ),
    );
    return new DialogRegistry({ dialogs: [] });
  }
  const seeds: readonly unknown[] = declared ?? DEFAULT_DIALOGS;
  const dialogs = new DialogRegistry({ dialogs: [] });
  for (const seed of seeds) {
    const registered = registerDialog(dialogs, seed, ["registry", "dialogs"]);
    if (!registered.ok) {
      issues.push(...registered.error);
    }
  }
  return dialogs;
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
  /** Strategies `arrange` can run; the composition root seeds the built-ins. */
  readonly strategies: LayoutStrategyRegistry;
  /** Distance between consecutive `Arrange` ranks, resolved from configuration. */
  readonly rankSpacing: number;
  /** Fallback node box `Arrange` reserves room for, when the host declared one. */
  readonly nodeSize: GraphLayoutNodeSize | undefined;
  /** What a structural change arranges automatically, resolved from configuration. */
  readonly arrangeOnChange: ArrangeOnChange;
  /** What removing a node does with the relations it carried. */
  readonly onRemove: RemovalPolicy;
  /** Camera framing the host declared, resolved and frozen. */
  readonly viewport: ViewportConfiguration | undefined;
}
/** Concrete builder. Hosts only ever see the {@link Builder} contract. */
class SdkBuilder implements Builder {
  readonly id: string;
  readonly adapter: BuilderAdapter | undefined;
  readonly features: BuilderFeaturesApi;
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
  readonly dialogs: BuilderDialogApi;
  readonly validators: BuilderValidatorApi;
  readonly importers: BuilderImporterApi;
  readonly exporters: BuilderExporterApi;
  readonly graphLayout: BuilderGraphLayoutApi;

  private readonly domain: NoderaDomain;
  private readonly nodeRegistry: NodeRegistry;
  private readonly edgeRegistry: EdgeRegistry;
  private readonly dialogRegistry: DialogRegistry;
  private readonly strategyRegistry: LayoutStrategyRegistry;
  private bindings: RendererBindings;
  private disposedFlag = false;
  /**
   * What a structural change arranges automatically.
   *
   * It is builder state rather than UI state because it decides document writes,
   * not presentation: the graph API reads it through a function, so a runtime
   * change applies to the next mutation with no re-composition.
   */
  private arrangeOnChangePolicy: ArrangeOnChange;
  /**
   * What removing a node does with the relations it carried.
   *
   * Builder state for the same reason: it decides document writes, so the graph
   * API reads it through a function and a runtime change applies to the next
   * removal with no re-composition.
   */
  private onRemovePolicy: RemovalPolicy;
  /**
   * Camera framing the host declared, resolved and frozen.
   *
   * Configuration, never UI state (AGENTS.md §5.3): it is frozen, it carries no
   * document data, and the presentation binding reads it through a function.
   * Replaced at runtime by {@link SdkBuilder.setViewport}, which is why it is the
   * one mutable field of its kind here: a refused replacement leaves the previous
   * value in place.
   */
  private viewportConfiguration: ViewportConfiguration | undefined;

  constructor(options: BuilderAssemblerOptions) {
    this.id = options.id;
    this.adapter = options.adapter;
    this.features = createFeaturesApi(
      options.features,
      options.store,
      () => this.disposedFlag,
      () => {
        const activeId =
          this.strategyRegistry !== undefined
            ? this.strategyRegistry.defaultStrategyId
            : undefined;
        return {
          free: activeId === "nodera.graph-layout.free",
          editable: this.store.getState().connections === "editable",
        };
      },
    );
    this.diagnostics = options.diagnostics;
    this.properties = options.properties;
    this.editor = options.editor;
    this.store = options.store;
    this.documentFormat = options.documentFormat;
    this.domain = options.domain;
    this.nodeRegistry = options.registries.nodes;
    this.edgeRegistry = options.registries.edges;
    this.dialogRegistry = options.registries.dialogs;
    this.bindings = options.renderers;
    this.strategyRegistry = options.strategies;
    this.arrangeOnChangePolicy = options.arrangeOnChange;
    this.onRemovePolicy = options.onRemove;
    this.viewportConfiguration = options.viewport;
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
    this.graph = createGraphApi(
      this.editor,
      () => this.disposedFlag,
      options.graphLayout,
      {
        strategies: this.strategyRegistry,
        rankSpacing: options.rankSpacing,
        nodeSize: options.nodeSize,
        arrangeOnChange: () => this.arrangeOnChangePolicy,
      },
      { onRemove: () => this.onRemovePolicy },
    );
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
    this.graphLayout = {
      register: (strategy) => this.addStrategy(strategy),
      unregister: (strategyId) => this.removeStrategy(strategyId),
      setDefault: (strategyId) => this.selectStrategy(strategyId),
      active: () => this.strategyRegistry.defaultStrategyId,
      all: () => this.strategyRegistry.all(),
      dragPolicy: () => this.store.getState().dragPolicy,
      setDragPolicy: (policy) => this.selectDragPolicy(policy),
      nodeTransition: () => this.store.getState().nodeTransition,
      setNodeTransition: (policy) => this.selectNodeTransition(policy),
      connectionsPolicy: () => this.store.getState().connections,
      setConnectionsPolicy: (policy) => this.selectConnectionsPolicy(policy),
      portsPolicy: () => this.store.getState().ports,
      setPortsPolicy: (policy) => this.selectPortsPolicy(policy),
      arrangeOnChange: () => this.arrangeOnChangePolicy,
      setArrangeOnChange: (policy) => this.selectArrangeOnChange(policy),
      removalPolicy: () => this.onRemovePolicy,
      setRemovalPolicy: (policy) => this.selectRemovalPolicy(policy),
    };
    this.dialogs = {
      register: (dialog) => this.addDialog(dialog),
      unregister: (dialogId) => this.removeDialog(dialogId),
      all: () => this.dialogRegistry.all(),
    };
    this.validators = {
      register: (validator) => this.addValidator(validator),
      unregister: (validatorId) => this.removeValidator(validatorId),
      all: () => this.registries.validators.all(),
    };
    this.importers = {
      register: (importer) => this.addImporter(importer),
      unregister: (importerId) => this.removeImporter(importerId),
      all: () => this.domain.importers.all(),
    };
    this.exporters = {
      register: (exporter) => this.addExporter(exporter),
      unregister: (exporterId) => this.removeExporter(exporterId),
      all: () => this.domain.exporters.all(),
    };
  }

  get renderers(): RendererBindings {
    return this.bindings;
  }

  viewport(): ViewportConfiguration | undefined {
    return this.viewportConfiguration;
  }

  /**
   * Replaces the camera framing at runtime.
   *
   * The value runs through the same validation as composition, so a host cannot
   * reach a stored configuration composition would have refused. The refusal
   * returns every issue and returns before the assignment, which is what leaves
   * the previous configuration — and therefore the next framing the canvas reads
   * — untouched.
   */
  setViewport(
    viewport: ViewportConfiguration | undefined,
  ): Result<ViewportConfiguration | undefined, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("setViewport")]);
    }
    if (viewport !== undefined) {
      const issues = viewportIssues(viewport, ["viewport"]);
      if (issues.length > 0) {
        return err(issues);
      }
    }
    this.viewportConfiguration = resolveViewport(viewport);
    return ok(this.viewportConfiguration);
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
   * `layout.register`/`setDefault`, `dialogs.register`/`unregister`,
   * `validators.register`/`unregister`, `importers.register`/`unregister`,
   * `exporters.register`/`unregister`,
   * `graphLayout.register`/`unregister`/`setDefault`/`setDragPolicy`,
   * `registries.nodes.unregister`,
   * `registries.edges.unregister`, every mutating `graph.*` call and
   * `document.import` fail with `sdk.disposed`. Reads keep working — `graph`
   * counts, selections, history flags and validation, `document` creation,
   * export, serialization and validation, events and the theme/layout/strategy
   * queries — because they observe state the host already received.
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
   * Registers one dialog the UI state may open.
   *
   * The registry is the one the store resolves ids from, so a definition
   * registered here is openable at once; a duplicate id stays a
   * `sdk.duplicate-id` instead of replacing the definition another surface
   * already opened.
   */
  private addDialog(dialog: DialogDefinition): Result<DialogDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("dialogs.register")]);
    }
    return registerDialog(this.dialogRegistry, dialog, ["dialogs"]);
  }

  /**
   * Removes one dialog the UI state may open.
   *
   * The store owns the open id, so removing a definition closes it when it was
   * the open one: the invariant “the open id is a registered one” is restored in
   * the same call, never left to the caller.
   */
  private removeDialog(dialogId: string): Result<DialogDefinition, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("dialogs.unregister")]);
    }
    const removed = this.dialogRegistry.unregister(dialogId);
    if (!removed.ok) {
      return err([registryIssue(removed.error, ["dialogs", removed.error.id])]);
    }
    if (this.store.getState().activeDialogId === dialogId) {
      this.store.closeDialog();
    }
    return ok(removed.value);
  }

  private addValidator(validator: GraphValidator): Result<GraphValidator, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("validators.register")]);
    }
    return registerValidator(this.registries.validators, validator, ["validators"]);
  }

  private removeValidator(validatorId: string): Result<GraphValidator, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("validators.unregister")]);
    }
    const removed = this.registries.validators.unregister(validatorId);
    return removed.ok
      ? ok(removed.value)
      : err([registryIssue(removed.error, ["validators", removed.error.id])]);
  }

  private addImporter(importer: Importer): Result<Importer, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("importers.register")]);
    }
    return registerImporter(this.domain.importers, importer, ["importers"]);
  }

  private removeImporter(importerId: string): Result<Importer, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("importers.unregister")]);
    }
    const removed = this.domain.importers.unregister(importerId);
    return removed.ok
      ? ok(removed.value)
      : err([registryIssue(removed.error, ["importers", removed.error.id])]);
  }

  private addExporter(exporter: Exporter): Result<Exporter, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("exporters.register")]);
    }
    return registerExporter(this.domain.exporters, exporter, ["exporters"]);
  }

  private removeExporter(exporterId: string): Result<Exporter, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("exporters.unregister")]);
    }
    const removed = this.domain.exporters.unregister(exporterId);
    return removed.ok
      ? ok(removed.value)
      : err([registryIssue(removed.error, ["exporters", removed.error.id])]);
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

  private addStrategy(strategy: GraphLayoutStrategy): Result<GraphLayoutStrategy, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("graphLayout.register")]);
    }
    const issues = strategyIssues(strategy, ["graph", "layout", "strategy"]);
    if (issues.length > 0) {
      return err(issues);
    }
    const registered = this.strategyRegistry.register(strategy);
    return registered.ok
      ? ok(registered.value)
      : err([registryIssue(registered.error, ["graph", "layout", "strategy"])]);
  }

  /**
   * Removes one strategy the host could select.
   *
   * The registry owns the default id, so it moves the selection to a strategy
   * that remains when the removed one was active; the store is then told, which
   * is what keeps the UI state pointing at a registered strategy.
   */
  private removeStrategy(strategyId: string): Result<GraphLayoutStrategy, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("graphLayout.unregister")]);
    }
    const removed = this.strategyRegistry.unregister(strategyId);
    if (!removed.ok) {
      return err([
        registryIssue(removed.error, ["graph", "layout", "strategy", removed.error.id]),
      ]);
    }
    this.store.setActiveGraphStrategyId(this.strategyRegistry.defaultStrategyId);
    return ok(removed.value);
  }

  /**
   * Selects the strategy `arrange` runs.
   *
   * The registry stays the owner of the default id — an unknown id is its
   * decision — so the selection can never point at a strategy nobody holds.
   */
  private selectStrategy(strategyId: string): Result<GraphLayoutStrategy, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("graphLayout.setDefault")]);
    }
    const selected = this.strategyRegistry.setDefault(strategyId);
    if (!selected.ok) {
      return err([
        unknownLayoutStrategyIssue(
          strategyId,
          this.strategyRegistry.all().map((registered) => registered.id),
          ["graph", "layout", "strategy"],
        ),
      ]);
    }
    this.store.setActiveGraphStrategyId(strategyId);
    return ok(selected.value);
  }

  /**
   * Applies a drag policy to the UI state the canvas reads.
   *
   * The union is checked here because the value comes from a host, and a
   * refused policy leaves both the state and its subscribers untouched: the
   * store is written only after the value proved valid.
   */
  private selectDragPolicy(policy: DragPolicy): Result<DragPolicy, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("graphLayout.setDragPolicy")]);
    }
    if (policy !== "free" && policy !== "locked" && policy !== "snap-back") {
      return err([
        shapeIssue(
          'Builder graph layout drag policy must be "free", "locked" or "snap-back"',
          policy,
          ["graph", "layout", "drag"],
        ),
      ]);
    }
    this.store.setDragPolicy(policy);
    return ok(policy);
  }

  /**
   * Applies a node transition to the UI state the canvas reads.
   *
   * Same contract as {@link selectDragPolicy}: the union is checked here because
   * the value comes from a host, and a refused policy leaves both the state and
   * its subscribers untouched.
   */
  private selectNodeTransition(policy: NodeTransition): Result<NodeTransition, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("graphLayout.setNodeTransition")]);
    }
    if (policy !== "animated" && policy !== "instant") {
      return err([
        shapeIssue(
          'Builder graph layout node transition must be "animated" or "instant"',
          policy,
          ["graph", "layout", "nodeTransition"],
        ),
      ]);
    }
    this.store.setNodeTransition(policy);
    return ok(policy);
  }

  /**
   * Applies a connections policy to the UI state the canvas reads.
   *
   * Same contract as {@link selectDragPolicy}: the union is checked here because
   * the value comes from a host, and a refused policy leaves both the state and
   * its subscribers untouched.
   */
  private selectConnectionsPolicy(
    policy: ConnectionsPolicy,
  ): Result<ConnectionsPolicy, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("graphLayout.setConnectionsPolicy")]);
    }
    if (policy !== "editable" && policy !== "fixed") {
      return err([
        shapeIssue(
          'Builder graph layout connections policy must be "editable" or "fixed"',
          policy,
          ["graph", "layout", "connections"],
        ),
      ]);
    }
    this.store.setConnections(policy);
    return ok(policy);
  }

  /**
   * Applies a ports policy to the UI state the canvas reads.
   *
   * Same contract as {@link selectDragPolicy}: the union is checked here because
   * the value comes from a host, and a refused policy leaves both the state and
   * its subscribers untouched.
   */
  private selectPortsPolicy(policy: PortsPolicy): Result<PortsPolicy, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("graphLayout.setPortsPolicy")]);
    }
    if (policy !== "visible" && policy !== "hidden") {
      return err([
        shapeIssue(
          'Builder graph layout ports policy must be "visible" or "hidden"',
          policy,
          ["graph", "layout", "ports"],
        ),
      ]);
    }
    this.store.setPorts(policy);
    return ok(policy);
  }

  /**
   * Applies an automatic arrangement policy.
   *
   * Same contract as {@link selectDragPolicy} minus the UI state: the union is
   * checked here because the value comes from a host, and a refused policy leaves
   * the stored one — and therefore the next mutation — untouched.
   */
  private selectArrangeOnChange(policy: ArrangeOnChange): Result<ArrangeOnChange, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("graphLayout.setArrangeOnChange")]);
    }
    if (policy !== "never" && policy !== "downstream") {
      return err([
        shapeIssue(
          'Builder graph layout arrangeOnChange must be "never" or "downstream"',
          policy,
          ["graph", "layout", "arrangeOnChange"],
        ),
      ]);
    }
    this.arrangeOnChangePolicy = policy;
    return ok(policy);
  }

  /**
   * Applies a removal policy.
   *
   * Same contract as {@link selectArrangeOnChange} minus the UI state: the union
   * is checked here because the value comes from a host, and a refused policy
   * leaves the stored one — and therefore the next removal — untouched.
   */
  private selectRemovalPolicy(policy: RemovalPolicy): Result<RemovalPolicy, SdkIssues> {
    if (this.disposedFlag) {
      return err([disposedIssue("graphLayout.setRemovalPolicy")]);
    }
    if (policy !== "detach" && policy !== "splice") {
      return err([
        shapeIssue(
          'Builder graph layout removal policy must be "detach" or "splice"',
          policy,
          ["graph", "layout", "onRemove"],
        ),
      ]);
    }
    this.onRemovePolicy = policy;
    return ok(policy);
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
  // The strategy registry exists before validation: an id no entry matches is a
  // configuration problem reported at `graph.layout.strategy`, not a strategy
  // the builder selects blindly.
  const strategies = new LayoutStrategyRegistry();
  if (declaredGraphLayout !== undefined) {
    issues.push(...graphLayoutIssues(declaredGraphLayout, ["graph", "layout"], strategies));
  }

  // The camera framing is configuration, so it is validated here beside the
  // layout and never applied half-way: one issue and no builder is composed.
  const declaredViewport = configuration.viewport;
  if (declaredViewport !== undefined) {
    issues.push(...viewportIssues(declaredViewport, ["viewport"]));
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
  // Seeded here, before the store exists, so every dialog id the UI state can
  // open is a registered one by construction.
  const dialogs = dialogRegistryFrom(registry?.dialogs, issues);
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
    dialogRegistry: dialogs,
    dragPolicy: resolveDragPolicy(declaredGraphLayout),
    nodeTransition: resolveNodeTransition(declaredGraphLayout),
    connections: resolveConnectionsPolicy(declaredGraphLayout),
    ports: resolvePortsPolicy(declaredGraphLayout),
    edgeInsertion: features.value.edgeInsertion,
    // Seed the active strategy so the adapter can read the live id on first paint.
    activeGraphStrategyId: strategies.defaultStrategyId,
  });

  const graph = configuration.graph;
  const graphLayout = resolveGraphLayout(declaredGraphLayout);
  // The gate above proves a declared strategy id is registered, so selecting it
  // cannot fail here; the selection is what every `arrange` resolves at call
  // time, so a later `builder.graphLayout.setDefault` takes effect immediately.
  if (declaredGraphLayout?.strategy !== undefined) {
    const selected = strategies.setDefault(declaredGraphLayout.strategy);
    if (!selected.ok) {
      return err(issues);
    }
  }
  const rankSpacing = declaredGraphLayout?.rankSpacing ?? graphLayout.spacing;
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
      dialogs,
    },
    properties,
    renderers,
    store,
    documentFormat: documentFormat.value,
    domain,
    editor: new EditorEngine(editorOptions),
    graphLayout,
    strategies,
    rankSpacing,
    // The declared box, or nothing at all: `nodeSizeIssues` already refused an
    // unusable one, and a host-written strategy must see `nodeSize === undefined`
    // when the host declared none, so its own default stays the only fallback
    // (`resolveLayoutNodeSize` in `@nodera/graph-layout`).
    nodeSize: declaredGraphLayout?.nodeSize,
    arrangeOnChange: resolveArrangeOnChange(declaredGraphLayout),
    onRemove: resolveRemovalPolicy(declaredGraphLayout),
    viewport: resolveViewport(declaredViewport),
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
