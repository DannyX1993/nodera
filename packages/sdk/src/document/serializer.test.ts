import { describe, expect, it } from "vitest";

import { assertValid, createBuilder, SDK_ISSUE_CODES } from "../index.js";
import type { BuilderDocumentSerializer } from "./document-api.js";

/**
 * The serializer object is bound to one format, and the format check is part of
 * its contract: a format the SDK does not implement must surface as a `Result`
 * error when the operation runs, never as a throw and never as a silent `ok`.
 *
 * Policy pinned here: rejection is **at call time**, not at `serializer()` time.
 * `serializer()` returns the object for any name a caller passes, and each of
 * its two operations reports `sdk.unsupported-format` when the name is unknown.
 * A host therefore has one error channel — the `Result` it already handles —
 * instead of an extra failure mode at construction.
 */

/** A real document, produced by the builder the host would use. */
function liveDocument() {
  return assertValid(createBuilder()).document.create();
}

/** Either operation of the serializer object, as a `Result` of the same shape. */
type SerializerCall =
  | ReturnType<BuilderDocumentSerializer["serialize"]>
  | ReturnType<BuilderDocumentSerializer["deserialize"]>;

/** Asserts one call failed with `sdk.unsupported-format` and nothing else. */
function expectUnsupportedFormat(result: SerializerCall): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error).toHaveLength(1);
  expect(result.error[0]).toMatchObject({
    code: "sdk.unsupported-format",
    severity: "error",
  });
  expect(SDK_ISSUE_CODES).toContain(result.error[0]?.code);
  expect(result.error[0]?.message).toContain("csv");
}

describe("document.serializer(format)", () => {
  it("serializes with the format the serializer was bound to", () => {
    const serialized = assertValid(createBuilder()).document
      .serializer("json")
      .serialize(liveDocument());

    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    expect(JSON.parse(serialized.value)).toMatchObject({ format: "ggd" });
  });

  it("returns an unsupported-format error at call time instead of throwing", () => {
    const builder = assertValid(createBuilder());
    // The host named a format the SDK does not implement; the declared type
    // does not allow it, so the cast is the mistake being pinned here.
    const serializer = builder.document.serializer("csv" as never);

    let serialized: ReturnType<BuilderDocumentSerializer["serialize"]> | undefined;
    expect(() => {
      serialized = serializer.serialize(builder.document.create());
    }).not.toThrow();
    expect(serialized).toBeDefined();
    if (serialized === undefined) return;
    expectUnsupportedFormat(serialized);
  });

  it("returns the same unsupported-format error when deserializing", () => {
    const serializer = assertValid(createBuilder()).document.serializer("csv" as never);

    let deserialized: ReturnType<BuilderDocumentSerializer["deserialize"]> | undefined;
    expect(() => {
      deserialized = serializer.deserialize("x");
    }).not.toThrow();
    expect(deserialized).toBeDefined();
    if (deserialized === undefined) return;
    expectUnsupportedFormat(deserialized);
  });

  it("deserializes with the format the serializer was bound to", () => {
    const builder = assertValid(createBuilder());
    const text = assertValid(
      builder.document.serializer("json").serialize(builder.document.create()),
    );

    const parsed = builder.document.serializer("json").deserialize(text);
    expect(parsed.ok).toBe(true);
  });
});
