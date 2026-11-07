/**
 * Severity levels for validation diagnostics and registry conflicts.
 *
 * Severity is representation-independent: the presentation layer decides how
 * each level is displayed; the domain only classifies it.
 */

/** Severity of a validation issue. */
export type ValidationSeverity = "error" | "warning" | "info";

/** All severity levels ordered from most to least severe. */
export const VALIDATION_SEVERITIES: readonly ValidationSeverity[] = [
  "error",
  "warning",
  "info",
] as const;

/** Checks whether a raw value is a known severity level. */
export function isValidationSeverity(value: unknown): value is ValidationSeverity {
  return (
    typeof value === "string" &&
    (VALIDATION_SEVERITIES as readonly string[]).includes(value)
  );
}
