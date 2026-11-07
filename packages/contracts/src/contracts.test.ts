import { describe, expect, it } from "vitest";
import { isValidationSeverity, VALIDATION_SEVERITIES } from "./severity.js";
import { createValidationIssue } from "./validation-issue.js";
import { duplicateIdError, notFoundError, RegistryStore } from "./registry.js";

describe("severity", () => {
  it("recognizes known severity levels", () => {
    expect(VALIDATION_SEVERITIES).toEqual(["error", "warning", "info"]);
    expect(isValidationSeverity("error")).toBe(true);
    expect(isValidationSeverity("fatal")).toBe(false);
    expect(isValidationSeverity(1)).toBe(false);
  });
});

describe("validation issue", () => {
  it("keeps optional context absent when not provided", () => {
    const issue = createValidationIssue({
      code: "structural.duplicate-node-id",
      severity: "error",
      message: "duplicated",
    });
    expect(Object.keys(issue)).toEqual(["code", "severity", "message"]);
    expect("elementId" in issue).toBe(false);
    expect("metadata" in issue).toBe(false);
  });

  it("carries element, property path and metadata when provided", () => {
    const issue = createValidationIssue({
      code: "domain.missing-required-property",
      severity: "error",
      message: "endpoint is required",
      elementId: "node-123",
      propertyPath: ["properties", "endpoint"],
      metadata: { definitionId: "http.request" },
    });
    expect(issue.elementId).toBe("node-123");
    expect(issue.propertyPath).toEqual(["properties", "endpoint"]);
    expect(issue.metadata).toEqual({ definitionId: "http.request" });
  });
});

describe("RegistryStore", () => {
  interface FakeEntry {
    readonly id: string;
  }

  const entry = (id: string): FakeEntry => ({ id });

  it("registers, looks up and lists definitions in order", () => {
    const store = new RegistryStore<FakeEntry>("TestRegistry");
    expect(store.register(entry("b"))).toEqual({ ok: true, value: { id: "b" } });
    store.register(entry("a"));
    expect(store.get("b")).toEqual({ id: "b" });
    expect(store.has("a")).toBe(true);
    expect(store.all().map((e) => e.id)).toEqual(["b", "a"]);
    expect(store.size).toBe(2);
  });

  it("rejects duplicate ids instead of overwriting", () => {
    const store = new RegistryStore<FakeEntry>("TestRegistry");
    store.register(entry("x"));
    const result = store.register(entry("x"));
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "duplicate-id",
        id: "x",
        message: 'TestRegistry already contains a definition with id "x"',
      },
    });
    expect(duplicateIdError("x", "TestRegistry").kind).toBe("duplicate-id");
    expect(store.size).toBe(1);
  });

  it("fails with not-found when unregistering or requiring unknown ids", () => {
    const store = new RegistryStore<FakeEntry>("TestRegistry");
    expect(store.unregister("missing")).toEqual({
      ok: false,
      error: {
        kind: "not-found",
        id: "missing",
        message: 'TestRegistry has no definition with id "missing"',
      },
    });
    expect(notFoundError("missing", "TestRegistry").kind).toBe("not-found");
    expect(store.require("missing").ok).toBe(false);
  });

  it("unregistering removes the definition and keeps order stable", () => {
    const store = new RegistryStore<FakeEntry>("TestRegistry");
    store.register(entry("a"));
    store.register(entry("b"));
    store.register(entry("c"));
    expect(store.unregister("b")).toEqual({ ok: true, value: { id: "b" } });
    expect(store.has("b")).toBe(false);
    expect(store.all().map((e) => e.id)).toEqual(["a", "c"]);
    expect(store.size).toBe(2);
  });
});
