/**
 * Public error model of the Nodera SDK.
 *
 * The SDK reports every data problem as a `Result` (never by throwing), so a
 * host can branch once per call. Codes are stable, dot-namespaced and closed:
 * they are part of the public contract, exactly like the domain validation
 * codes of the core.
 */

import type { Result } from "@nodera/contracts";

/** Every diagnostic code the SDK can report. */
export const SDK_ISSUE_CODES = [
  "sdk.invalid-id",
  "sdk.invalid-input",
  "sdk.duplicate-id",
  "sdk.unknown-definition",
  "sdk.feature-unsupported",
  "sdk.feature-unavailable",
  "sdk.unknown-theme",
  "sdk.unknown-layout",
  "sdk.unsupported-format",
  "sdk.document-invalid",
  "sdk.renderer-unsupported",
  "sdk.plugin-invalid",
  "sdk.plugin-conflict",
  "sdk.disposed",
] as const;

/** A stable SDK diagnostic code. */
export type SdkIssueCode = (typeof SDK_ISSUE_CODES)[number];

/** How much a diagnostic must matter to the caller. */
export type SdkSeverity = "error" | "warning";

/** One SDK failure. Returned as the error side of a `Result`. */
export interface SdkError {
  readonly code: SdkIssueCode;
  readonly message: string;
  /** Location inside the input that produced it, e.g. `["registry", "nodes", "demo.node"]`. */
  readonly path?: readonly string[];
  /** Structured context for the host, never required to render a message. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** One SDK diagnostic with a severity: the unit of the diagnostic list. */
export interface SdkIssue extends SdkError {
  readonly severity: SdkSeverity;
}

/** Diagnostics collected by an operation that has several independent inputs. */
export type SdkIssues = readonly SdkIssue[];

/** Optional detail attached to a diagnostic. */
export interface SdkIssueOptions {
  readonly path?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Builds an SDK error. */
export function sdkError(
  code: SdkIssueCode,
  message: string,
  options: SdkIssueOptions = {},
): SdkError {
  return {
    code,
    message,
    ...(options.path === undefined ? {} : { path: options.path }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
  };
}

/**
 * Normalizes the error side of any SDK result into a diagnostic list, so a
 * caller can always render one list regardless of which operation failed.
 */
export function toIssues(error: SdkError | SdkIssues): SdkIssues {
  if (Array.isArray(error)) {
    return error;
  }
  return [{ ...(error as SdkError), severity: "error" }];
}

/**
 * The diagnostic every operation a disposed builder refuses reports.
 *
 * Disposal closes mutations and extensions, never reads: a host may keep
 * rendering the state it already received.
 */
export function disposedIssue(operation: string): SdkIssue {
  return {
    ...sdkError(
      "sdk.disposed",
      `The builder has been disposed; "${operation}" is no longer available`,
      { metadata: { operation } },
    ),
    severity: "error",
  };
}

/**
 * Whether a value is a plain object.
 *
 * Every SDK input is either a primitive or an object with declared fields; an
 * array, a `null` or a primitive where an object is required is malformed data
 * and is reported instead of being dereferenced.
 *
 * The predicate is `object`: the declared signature of an input stays the
 * contract its caller promises, and this check is the runtime safety net at
 * the boundary that owns it.
 */
export function isPlainObject(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Description of a malformed value, for a message that names what arrived. */
export function describeValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "an array";
  }
  if (typeof value === "object") {
    return "an object";
  }
  if (typeof value === "string") {
    return `the string "${value}"`;
  }
  return `${typeof value} ${String(value)}`;
}

/**
 * Issue for a value whose shape is not the one the boundary requires.
 *
 * `expected` names the shape the caller has to supply; the received value is
 * described, never echoed as a data structure.
 */
export function shapeIssue(
  expected: string,
  value: unknown,
  path: readonly string[],
): SdkIssue {
  const received = describeValue(value);
  return {
    ...sdkError("sdk.invalid-input", `${expected}; received ${received}`, {
      path,
      metadata: { received },
    }),
    severity: "error",
  };
}

/**
 * Issue for a required text field that is missing, empty or not a string.
 *
 * The message states what the boundary needs, so an author fixes the input
 * instead of reading a stack trace.
 */
export function stringFieldIssue(
  owner: string,
  field: string,
  value: unknown,
  path: readonly string[],
): SdkIssue {
  const message =
    typeof value === "string"
      ? `${owner} must declare a non-empty ${field}`
      : `${owner} must declare ${field} as a string; received ${describeValue(value)}`;
  return { ...sdkError("sdk.invalid-input", message, { path }), severity: "error" };
}

/** Same as {@link stringFieldIssue} for a field whose rule is its identity. */
export function identifierFieldIssue(
  owner: string,
  field: string,
  value: unknown,
  path: readonly string[],
): SdkIssue {
  return { ...stringFieldIssue(owner, field, value, path), code: "sdk.invalid-id" };
}

/**
 * Thrown by {@link assertOk} and {@link assertValid} only. The SDK itself never
 * throws for input problems; these helpers exist for hosts that prefer linear
 * code and accept a single throw at the boundary they chose.
 */
export class SdkAssertionError extends Error {
  readonly issues: SdkIssues;

  constructor(issues: SdkIssues) {
    super(
      `Nodera SDK call failed: ${issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "SdkAssertionError";
    this.issues = issues;
  }
}

/** Unwraps an SDK result, throwing {@link SdkAssertionError} on failure. */
export function assertOk<T>(result: Result<T, SdkError | SdkIssues>): T {
  if (result.ok) {
    return result.value;
  }
  throw new SdkAssertionError(toIssues(result.error));
}

/**
 * Unwraps a validated configuration result, throwing {@link SdkAssertionError}
 * with every collected issue on failure.
 */
export function assertValid<T>(result: Result<T, SdkIssues>): T {
  if (result.ok) {
    return result.value;
  }
  throw new SdkAssertionError(result.error);
}

/** Shape of a globally qualified identifier: at least one dot, no whitespace. */
const QUALIFIED_ID_PATTERN =
  /^[a-zA-Z0-9][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+$/;

/**
 * Whether an identifier is globally qualified (`vendor.feature-name`), the
 * public vocabulary of the SDK for node types, edge types and property ids.
 */
export function isQualifiedId(id: string): boolean {
  return QUALIFIED_ID_PATTERN.test(id);
}
