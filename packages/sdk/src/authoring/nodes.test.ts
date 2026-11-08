import { describe, expect, it } from "vitest";
import { validateNodeDefinition } from "@nodera/node-registry";
import { toNodeDefinition, type NodeDefinitionInput } from "./nodes.js";

const HttpRequestNodeRenderer = (): null => null;

function httpRequestInput(): NodeDefinitionInput {
  return {
    type: "http.request",
    version: "1.0.0",
    label: "HTTP Request",
    description: "Makes an HTTP request",
    category: "network",
    icon: "globe",
    ports: {
      inputs: [{ id: "trigger", dataType: "event" }],
      outputs: [{ id: "response", dataType: "object" }],
    },
    properties: [
      { id: "url", type: "string", label: "URL", required: true },
      {
        id: "method",
        type: "select",
        label: "Method",
        defaultValue: "GET",
        options: ["GET", "POST", "PUT", "DELETE"],
      },
    ],
    renderer: HttpRequestNodeRenderer,
  };
}

describe("toNodeDefinition", () => {
  it("translates the published node authoring example", () => {
    const result = toNodeDefinition(httpRequestInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition).toEqual({
      id: "http.request",
      name: "HTTP Request",
      description: "Makes an HTTP request",
      category: "network",
      icon: "globe",
      version: "1.0.0",
      renderer: "http.request",
      ports: [
        { id: "trigger", dataType: "event", direction: "input" },
        { id: "response", dataType: "object", direction: "output" },
      ],
      properties: [
        { id: "url", type: "string", label: "URL", required: true },
        {
          id: "method",
          type: "select",
          label: "Method",
          defaultValue: "GET",
          options: [
            { value: "GET", label: "GET" },
            { value: "POST", label: "POST" },
            { value: "PUT", label: "PUT" },
            { value: "DELETE", label: "DELETE" },
          ],
        },
      ],
    });
    expect(result.value.renderer).toEqual({
      id: "http.request",
      value: HttpRequestNodeRenderer,
    });
    expect(result.value.components).toEqual([]);
  });

  it("produces a definition the domain considers complete", () => {
    const result = toNodeDefinition(httpRequestInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateNodeDefinition(result.value.definition)).toEqual([]);
  });

  it("omits the renderer entirely when the host supplies none", () => {
    const input = httpRequestInput();
    const withoutRenderer: NodeDefinitionInput = {
      type: input.type,
      label: input.label,
      category: input.category,
      ...(input.ports === undefined ? {} : { ports: input.ports }),
      ...(input.properties === undefined ? {} : { properties: input.properties }),
    };

    const result = toNodeDefinition(withoutRenderer);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition).not.toHaveProperty("renderer");
    expect(result.value.renderer).toBeUndefined();
  });

  it("defaults the definition version to 1.0.0", () => {
    const result = toNodeDefinition({
      type: "demo.node",
      label: "Demo",
      category: "demo",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition.version).toBe("1.0.0");
    expect(result.value.definition.ports).toEqual([]);
    expect(result.value.definition.properties).toEqual([]);
  });

  it("carries policies, visual hints and validation rule ids", () => {
    const result = toNodeDefinition({
      type: "demo.node",
      label: "Demo",
      category: "demo",
      connectionPolicy: { incoming: "forbid", outgoing: "allow" },
      visual: { color: "#123456", metadata: { dense: true } },
      validationRuleIds: ["demo.rule"],
      metadata: { vendor: "demo" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition.connectionPolicy).toEqual({
      incoming: "forbid",
      outgoing: "allow",
    });
    expect(result.value.definition.visual).toEqual({
      color: "#123456",
      metadata: { dense: true },
    });
    expect(result.value.definition.validationRuleIds).toEqual(["demo.rule"]);
    expect(result.value.definition.metadata).toEqual({ vendor: "demo" });
  });

  it("binds property components and derives their renderer ids", () => {
    const CodeEditor = (): null => null;

    const result = toNodeDefinition({
      type: "demo.editor",
      label: "Editor",
      category: "demo",
      properties: [{ id: "code", type: "custom", component: CodeEditor }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition.properties[0]?.component).toBe("demo.editor.code");
    expect(result.value.components).toEqual([
      { id: "demo.editor.code", value: CodeEditor },
    ]);
  });

  it("rejects a node type that is not globally qualified", () => {
    const result = toNodeDefinition({ type: "request", label: "Request", category: "http" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({
      code: "sdk.invalid-id",
      path: ["type"],
      metadata: { value: "request" },
    });
  });

  it("rejects a definition without a category or label", () => {
    const result = toNodeDefinition({
      type: "demo.node",
      label: "   ",
      category: "",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.map((issue) => issue.code)).toEqual([
      "sdk.invalid-input",
      "sdk.invalid-input",
    ]);
    expect(result.error.map((issue) => issue.path)).toEqual([
      ["label"],
      ["category"],
    ]);
  });

  it("reports port and property problems together with their paths", () => {
    const result = toNodeDefinition({
      type: "demo.node",
      label: "Demo",
      category: "demo",
      ports: { inputs: [{ id: "in" }, { id: "in" }] },
      properties: [{ id: "method", type: "select" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toHaveLength(2);
    expect(result.error[0]).toMatchObject({
      code: "sdk.duplicate-id",
      path: ["ports", "inputs", "in"],
    });
    expect(result.error[1]).toMatchObject({
      code: "sdk.invalid-input",
      path: ["properties", "method", "options"],
    });
  });

  it("rejects duplicates the domain validator catches, naming the domain code", () => {
    const result = toNodeDefinition({
      type: "demo.node",
      label: "Demo",
      category: "demo",
      properties: [
        { id: "mode", type: "string" },
        { id: "mode", type: "string" },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({
      code: "sdk.invalid-input",
      severity: "error",
      metadata: { domainCode: "node-definition.duplicate-property-id" },
    });
  });

  it("does not leak unknown authoring fields into the definition", () => {
    const result = toNodeDefinition({
      type: "demo.node",
      label: "Demo",
      category: "demo",
      hacked: true,
    } as unknown as NodeDefinitionInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.definition).not.toHaveProperty("hacked");
  });
});
