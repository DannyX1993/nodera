/**
 * Public vocabulary of the SDK: the names of the values that flow through its
 * own signatures.
 *
 * `registerPanel`, `registerTheme`, `registerLayout`, `registerNode` and
 * `builder.graph.addNode` accept and return types defined by the core packages.
 * A host has to be able to *write* those names — to type a variable, annotate a
 * helper or declare a component — instead of recovering them with
 * `Parameters<Builder["theme"]["register"]>[0]`.
 *
 * The SDK never re-declares any of these types. Every entry below is a
 * type-only re-export of the module that owns it, so a host and the core always
 * talk about the very same type: there is one `PanelDefinition`, one
 * `GraphDocument` and one `NodeDefinition` in the framework, not a public copy
 * and an internal original.
 *
 * Ownership (one owner per name, so `export *` stays unambiguous):
 *
 * - `@nodera/ui-core` owns the declarative UI contracts and the layout model.
 * - `@nodera/theme-engine` owns the theme model and its design tokens.
 * - `@nodera/graph-model` owns the graph model and its value objects.
 * - `@nodera/property-system` owns the property schema.
 * - `@nodera/document` owns the portable document and its validation report.
 * - `@nodera/node-registry` / `@nodera/edge-registry` own the definitions.
 * - `@nodera/validation` owns the validation report and its levels;
 *   `@nodera/contracts` owns the diagnostic unit they are made of.
 * - `@nodera/graph-layout` owns the placement strategy port, so a host can
 *   write an adapter (`builder.graphLayout.register`) without naming an
 *   internal module.
 *
 * `LayoutDefinition` is deliberately not re-exported from
 * `@nodera/layout-engine`: that package consumes the type, `@nodera/ui-core`
 * owns it.
 */

export type {
  LayoutDefinition,
  LayoutState,
  PanelDefinition,
  PanelRegion,
  ToolAvailability,
  ToolCommand,
  ToolDefinition,
} from "@nodera/ui-core";

export type {
  CreateThemeInput,
  DesignTokens,
  ThemeDefinition,
} from "@nodera/theme-engine";

export type {
  Connection,
  Edge,
  Graph,
  GraphSettings,
  Node,
  NodePosition,
  PortDeclaration,
  PortPlacement,
} from "@nodera/graph-model";

export type {
  PropertyDefinition,
  PropertyOption,
  PropertyType,
} from "@nodera/property-system";

export type { DocumentValidationReport, GraphDocument } from "@nodera/document";

export type { NodeDefinition } from "@nodera/node-registry";
export type { EdgeDefinition } from "@nodera/edge-registry";

export type { ValidationLevel, ValidationReport } from "@nodera/validation";
export type { ValidationIssue } from "@nodera/contracts";

export type {
  GraphLayoutDiagnostic,
  GraphLayoutDiagnosticCode,
  GraphLayoutDirection,
  GraphLayoutEdgeInput,
  GraphLayoutInput,
  GraphLayoutNodeInput,
  GraphLayoutOptions,
  GraphLayoutPlacedNode,
  GraphLayoutResult,
  GraphLayoutScope,
  GraphLayoutStrategy,
} from "@nodera/graph-layout";
