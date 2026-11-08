import { describe, expect, it } from "vitest";
import { NoderaDomain } from "@nodera/domain";
import { EditorEngine } from "./editor-engine.js";
import { addNode } from "./use-cases/nodes.js";

/**
 * The editor may be composed with a domain the host already owns. This is what
 * lets a composition root (the SDK builder) keep one set of definition
 * registries for every editing session it creates, instead of rebuilding them.
 */

function registerDefinition(domain: NoderaDomain, id: string): void {
  domain.nodes.register({
    id,
    name: id,
    category: "demo",
    version: "1.0.0",
    ports: [],
    properties: [],
  });
}

describe("EditorEngine domain injection", () => {
  it("uses the domain instance it was given", () => {
    const domain = new NoderaDomain();

    const editor = new EditorEngine({ domain });

    expect(editor.domain).toBe(domain);
  });

  it("keeps creating its own domain when none is supplied", () => {
    const first = new EditorEngine();
    const second = new EditorEngine();

    expect(first.domain).not.toBe(second.domain);
    registerDefinition(first.domain, "demo.only-in-first");

    const result = addNode(second, { definitionId: "demo.only-in-first" });

    expect(result.ok).toBe(false);
    expect(second.graph.nodeCount).toBe(0);
  });

  it("shares definitions through one domain across editors", () => {
    const domain = new NoderaDomain();
    registerDefinition(domain, "demo.shared");

    const first = new EditorEngine({ domain, graphId: "graph-first" });
    const second = new EditorEngine({ domain, graphId: "graph-second" });

    const firstNode = addNode(first, { definitionId: "demo.shared" });
    const secondNode = addNode(second, { definitionId: "demo.shared" });

    expect(firstNode.ok).toBe(true);
    expect(secondNode.ok).toBe(true);
    expect(first.graph.nodeCount).toBe(1);
    expect(second.graph.nodeCount).toBe(1);
    expect(domain.nodes.all().map((definition) => definition.id)).toEqual([
      "demo.shared",
    ]);
  });

  it("still honours the graph id and settings of a supplied domain", () => {
    const domain = new NoderaDomain();

    const editor = new EditorEngine({
      domain,
      graphId: "graph-explicit",
      graphSettings: {
        selfLoops: "forbid",
        multiEdges: "allow",
        cycles: "allow",
      },
    });

    expect(editor.graph.id).toBe("graph-explicit");
    expect(editor.graph.settings.selfLoops).toBe("forbid");
    expect(editor.domain).toBe(domain);
  });
});
