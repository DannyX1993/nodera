import { describe, expect, it } from "vitest";
import { createNodeId } from "@nodera/contracts";
import { DEFAULT_GRAPH_SETTINGS, type GraphSettings } from "./graph-settings.js";
import { Node } from "./node.js";

describe("Node definitionVersion", () => {
  it("carries the definition version an instance was created against, when given", () => {
    const withVersion = new Node(
      createNodeId("n1"),
      "example.input",
      [],
      {},
      undefined,
      undefined,
      "1.2.3",
    );
    expect(withVersion.definitionVersion).toBe("1.2.3");

    const withoutVersion = new Node(createNodeId("n2"), "example.input", []);
    expect(withoutVersion.definitionVersion).toBeUndefined();
  });

  it("keeps default settings shape stable", () => {
    const settings: GraphSettings = DEFAULT_GRAPH_SETTINGS;
    expect(settings).toEqual({ selfLoops: "allow", multiEdges: "allow", cycles: "allow" });
  });
});
