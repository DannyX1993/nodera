import { describe, expect, it } from "vitest";

import * as uiReact from "./index.js";

/**
 * Names the package must export.
 *
 * The list is deliberately exhaustive (S2 components, S3 replacement surface,
 * S5 bindings): a missing export is a broken public contract for every host,
 * so the assertions below report the offending names instead of failing on the
 * first one.
 */
const COMPONENTS = [
  "EditorShell",
  "CanvasContainer",
  "NodePalette",
  "PropertiesPanel",
  "InspectorPanel",
  "Toolbar",
  "ContextMenu",
  "Header",
  "Footer",
  "Sidebar",
  "Navigator",
  "SearchPanel",
  "MinimapPanel",
  "ValidationPanel",
  "HistoryPanel",
  "MetadataPanel",
] as const;

const PROVIDERS_AND_HOOKS = [
  "NoderaUiProvider",
  "ThemeProvider",
  "useNoderaUi",
  "useEditorEngine",
  "useUiState",
  "useTheme",
  "useUiStateActions",
  "useLayoutActions",
  "useEditorSnapshot",
  "useToolAvailability",
  "useGraphQueries",
  "useEditorCommands",
  "useValidation",
  "useHistory",
] as const;

const REGISTRIES_AND_FACTORIES = [
  "ComponentRegistry",
  "createComponentRenderers",
  "createDefaultComponentRenderers",
  "createDefaultPanelRegistry",
  "createDefaultToolRegistry",
  "createDefaultPropertyRenderers",
  "defaultPropertyRenderer",
] as const;

const SHELL_HELPERS = ["computeShellSizes", "panelIdForRegion"] as const;

function exportedEntries(): Readonly<Record<string, unknown>> {
  return uiReact as unknown as Readonly<Record<string, unknown>>;
}

/** Fails with the exact list of names the entry point does not export. */
function expectExported(names: readonly string[]): void {
  const entries = exportedEntries();
  expect(names.filter((name) => entries[name] === undefined)).toEqual([]);
}

describe("@nodera/ui-react public surface", () => {
  it("exports every component of the UI composition layer", () => {
    expectExported(COMPONENTS);

    const entries = exportedEntries();
    expect(COMPONENTS.filter((name) => typeof entries[name] !== "function")).toEqual([]);
  });

  it("exports the providers and hooks a host composes with", () => {
    expectExported(PROVIDERS_AND_HOOKS);

    const entries = exportedEntries();
    expect(PROVIDERS_AND_HOOKS.filter((name) => typeof entries[name] !== "function")).toEqual([]);
  });

  it("exports the component registries and their factories", () => {
    expectExported(REGISTRIES_AND_FACTORIES);

    const entries = exportedEntries();
    expect(
      REGISTRIES_AND_FACTORIES.filter((name) => typeof entries[name] !== "function"),
    ).toEqual([]);
  });

  it("exports the shell helpers a host wires its layout with", () => {
    expectExported(SHELL_HELPERS);

    expect(typeof uiReact.computeShellSizes).toBe("function");
    expect(typeof uiReact.panelIdForRegion).toBe("function");
  });
});
