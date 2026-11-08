import type { EditorEngine } from "@nodera/application";
import type { NodeDefinition } from "@nodera/node-registry";
import type { PropertyDefinition } from "@nodera/property-system";
import { EditorEngine as EditorEngineClass } from "@nodera/application";

/** Stable id of the node definition the UI tests register. */
export const TEST_DEFINITION_ID = "test.node";

/** Builds a valid, fully qualified node definition for UI tests. */
export function createTestDefinition(
  properties: readonly PropertyDefinition[] = [],
): NodeDefinition {
  return {
    id: TEST_DEFINITION_ID,
    name: "Test node",
    category: "test",
    version: "1.0.0",
    ports: [
      { id: "in", direction: "input" },
      { id: "out", direction: "output" },
    ],
    properties,
  };
}

/** Creates an editor with the test definition already registered. */
export function createTestEditor(
  properties: readonly PropertyDefinition[] = [],
): EditorEngine {
  const editor = new EditorEngineClass({ graphId: "graph-ui-test" });
  editor.domain.nodes.register(createTestDefinition(properties));
  return editor;
}
