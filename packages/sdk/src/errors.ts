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
