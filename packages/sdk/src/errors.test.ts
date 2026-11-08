import { describe, expect, it } from "vitest";
import { err, ok } from "@nodera/contracts";
import {
  SDK_ISSUE_CODES,
  SdkAssertionError,
  assertOk,
  assertValid,
  isQualifiedId,
  sdkError,
  toIssues,
  type SdkIssue,
} from "./errors.js";

describe("SDK issue codes", () => {
  it("exposes a closed, dot-namespaced list of stable codes", () => {
    expect(SDK_ISSUE_CODES.length).toBeGreaterThan(0);
    for (const code of SDK_ISSUE_CODES) {
      expect(code).toMatch(/^sdk\.[a-z][a-z-]*$/);
    }
    expect(new Set(SDK_ISSUE_CODES).size).toBe(SDK_ISSUE_CODES.length);
  });
});

describe("sdkError", () => {
  it("builds an error carrying code and message only", () => {
    expect(sdkError("sdk.invalid-id", 'Node type "request" is not qualified')).toEqual({
      code: "sdk.invalid-id",
      message: 'Node type "request" is not qualified',
    });
  });

  it("carries the offending path and metadata when given", () => {
    const error = sdkError("sdk.invalid-id", "bad type", {
      path: ["nodes", "0", "type"],
      metadata: { value: "request" },
    });

    expect(error.path).toEqual(["nodes", "0", "type"]);
    expect(error.metadata).toEqual({ value: "request" });
  });
});

describe("toIssues", () => {
  it("turns one error into a single error-severity issue", () => {
    const error = sdkError("sdk.invalid-id", "bad type", { path: ["type"] });

    expect(toIssues(error)).toEqual([{ ...error, severity: "error" }]);
  });

  it("keeps an existing issue list untouched", () => {
    const issues: readonly SdkIssue[] = [
      { code: "sdk.invalid-id", severity: "error", message: "one" },
      { code: "sdk.feature-unsupported", severity: "warning", message: "two" },
    ];

    expect(toIssues(issues)).toBe(issues);
  });
});

describe("assertOk", () => {
  it("returns the value of an ok result", () => {
    expect(assertOk(ok(41))).toBe(41);
  });

  it("throws an SdkAssertionError carrying one error", () => {
    const failure = sdkError("sdk.invalid-input", "bad input");

    expect(() => assertOk(err(failure))).toThrow(SdkAssertionError);
    try {
      assertOk(err(failure));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SdkAssertionError);
      const assertion = error as SdkAssertionError;
      expect(assertion.issues).toEqual([{ ...failure, severity: "error" }]);
      expect(assertion.message).toContain("bad input");
    }
  });
});

describe("assertValid", () => {
  it("returns the value of an ok result", () => {
    expect(assertValid(ok("builder"))).toBe("builder");
  });

  it("throws one aggregated error naming every issue", () => {
    const issues: readonly SdkIssue[] = [
      { code: "sdk.invalid-id", severity: "error", message: "first problem" },
      { code: "sdk.feature-unsupported", severity: "error", message: "second problem" },
    ];

    try {
      assertValid(err(issues));
      expect.unreachable();
    } catch (error) {
      const assertion = error as SdkAssertionError;
      expect(assertion.issues).toBe(issues);
      expect(assertion.message).toContain("first problem");
      expect(assertion.message).toContain("second problem");
    }
  });
});

describe("isQualifiedId", () => {
  it("accepts dot-qualified identifiers", () => {
    expect(isQualifiedId("http.request")).toBe(true);
    expect(isQualifiedId("company.ai-nodes")).toBe(true);
    expect(isQualifiedId("vendor.feature-name.v2")).toBe(true);
    expect(isQualifiedId("a_b.c_d")).toBe(true);
  });

  it("rejects identifiers that are not dot-qualified", () => {
    expect(isQualifiedId("request")).toBe(false);
    expect(isQualifiedId("")).toBe(false);
    expect(isQualifiedId(".leading")).toBe(false);
    expect(isQualifiedId("trailing.")).toBe(false);
    expect(isQualifiedId("two..dots")).toBe(false);
    expect(isQualifiedId("with space.x")).toBe(false);
    expect(isQualifiedId("-leading.x")).toBe(false);
  });
});
