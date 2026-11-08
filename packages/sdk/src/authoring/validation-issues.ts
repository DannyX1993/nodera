/**
 * Bridge between the core's validation diagnostics and the SDK's public
 * diagnostic model.
 *
 * The SDK never reimplements a rule the core already owns: it runs the
 * definition validators and re-publishes their findings under one stable SDK
 * code, keeping the original domain code as metadata so a host can still tell
 * exactly what the core objected to.
 */

import type { ValidationIssue } from "@nodera/contracts";
import type { SdkIssue } from "../errors.js";

/** Maps domain definition-validation findings into SDK diagnostics. */
export function fromDomainValidationIssues(
  issues: readonly ValidationIssue[],
): SdkIssue[] {
  return issues.map((issue) => ({
    code: "sdk.invalid-input" as const,
    severity: issue.severity === "error" ? ("error" as const) : ("warning" as const),
    message: issue.message,
    ...(issue.propertyPath === undefined ? {} : { path: issue.propertyPath }),
    metadata: {
      domainCode: issue.code,
      ...(issue.elementId === undefined ? {} : { elementId: issue.elementId }),
    },
  }));
}
