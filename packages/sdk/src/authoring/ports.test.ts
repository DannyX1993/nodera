import { describe, expect, it } from "vitest";
import { toPortDeclarations } from "./ports.js";

describe("toPortDeclarations", () => {
  it("assigns the direction of each group and keeps declaration order", () => {
    const result = toPortDeclarations({
      inputs: [{ id: "trigger", dataType: "event" }],
      outputs: [{ id: "response", dataType: "object" }],
      bidirectional: [{ id: "channel" }],
    });

    expect(result).toEqual({
      ok: true,
      value: [
        { id: "trigger", dataType: "event", direction: "input" },
        { id: "response", dataType: "object", direction: "output" },
        { id: "channel", direction: "bidirectional" },
      ],
    });
  });

  it("returns no declarations when no group is declared", () => {
    expect(toPortDeclarations({})).toEqual({ ok: true, value: [] });
  });

  it("maps required to a minimum connection count of one", () => {
    const result = toPortDeclarations({
      inputs: [
        { id: "required-one", required: true },
        { id: "optional-one" },
        { id: "explicitly-optional", required: false },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toEqual({
      id: "required-one",
      direction: "input",
      minConnections: 1,
    });
    expect(result.value[1]).not.toHaveProperty("minConnections");
    expect(result.value[2]).not.toHaveProperty("minConnections");
  });

  it("carries the declaration constraints a port admits", () => {
    const result = toPortDeclarations({
      outputs: [
        {
          id: "fan-out",
          name: "Fan out",
          dataType: "string",
          multiplicity: "multiple",
          maxConnections: 4,
          allowedDataTypes: ["string", "number"],
          allowedNodeDefinitionIds: ["demo.sink"],
          customConditionId: "demo.only-strings",
          renderer: "demo.port",
          metadata: { tagged: true },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([
      {
        id: "fan-out",
        name: "Fan out",
        direction: "output",
        dataType: "string",
        multiplicity: "multiple",
        maxConnections: 4,
        allowedDataTypes: ["string", "number"],
        allowedNodeDefinitionIds: ["demo.sink"],
        customConditionId: "demo.only-strings",
        visual: { renderer: "demo.port" },
        metadata: { tagged: true },
      },
    ]);
  });

  it("keeps a declared null max connection as unbounded", () => {
    const result = toPortDeclarations({
      outputs: [{ id: "unbounded", multiplicity: "multiple", maxConnections: null }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toHaveProperty("maxConnections", null);
  });

  it("rejects an empty or malformed port id", () => {
    const empty = toPortDeclarations({ inputs: [{ id: "  " }] });
    const spaced = toPortDeclarations({ inputs: [{ id: "with space" }] });

    expect(empty.ok).toBe(false);
    expect(spaced.ok).toBe(false);
    if (empty.ok || spaced.ok) return;
    expect(empty.error[0]).toMatchObject({
      code: "sdk.invalid-id",
      severity: "error",
      path: ["ports", "inputs", "  "],
    });
  });

  it("rejects the same port id declared in two groups", () => {
    const result = toPortDeclarations({
      inputs: [{ id: "channel" }],
      outputs: [{ id: "channel" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error[0]).toMatchObject({
      code: "sdk.duplicate-id",
      path: ["ports", "outputs", "channel"],
      metadata: { portId: "channel", firstGroup: "inputs" },
    });
  });

  it("reports one issue per invalid port instead of stopping at the first", () => {
    const result = toPortDeclarations({
      inputs: [{ id: "" }, { id: "ok" }],
      outputs: [{ id: "bad id" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toHaveLength(2);
    expect(result.error.map((issue) => issue.path)).toEqual([
      ["ports", "inputs", ""],
      ["ports", "outputs", "bad id"],
    ]);
  });

  it("does not leak unknown authoring fields into the declaration", () => {
    const result = toPortDeclarations({
      inputs: [{ id: "trigger", hacked: true } as unknown as { id: string }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toEqual({ id: "trigger", direction: "input" });
  });
});
