/**
 * Plugin diagnostic model.
 *
 * The plugin system reports every data problem as a `Result` (never by
 * throwing), mirroring the SDK's public error shape so a host handles one kind
 * of diagnostic. Codes are stable, dot-namespaced and closed.
 */

/** Every diagnostic code the plugin system can report. */
export const PLUGIN_ERROR_CODES = [
  "plugin.invalid-manifest",
  "plugin.missing-dependency",
  "plugin.dependency-cycle",
  "plugin.incompatible-sdk",
  "plugin.duplicate-plugin",
  "plugin.contribution-conflict",
  "plugin.activation-failed",
  "plugin.deactivation-failed",
  "plugin.not-found",
  "plugin.invalid-state",
] as const;

/** A stable plugin diagnostic code. */
export type PluginErrorCode = (typeof PLUGIN_ERROR_CODES)[number];

/** How much a diagnostic must matter to the caller. */
export type PluginSeverity = "error" | "warning";

/** One plugin failure. Returned as the error side of a `Result`. */
export interface PluginIssue {
  readonly code: PluginErrorCode;
  readonly message: string;
  /** Location inside the input that produced it, e.g. `["manifest", "id"]`. */
  readonly path?: readonly string[];
  /** Structured context for the host, never required to render a message. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly severity: PluginSeverity;
}

/** Diagnostics collected by an operation with several independent inputs. */
export type PluginIssues = readonly PluginIssue[];

/** Optional detail attached to a diagnostic. */
export interface PluginIssueOptions {
  readonly path?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly severity?: PluginSeverity;
}

/** Builds a plugin issue. */
export function pluginIssue(
  code: PluginErrorCode,
  message: string,
  options: PluginIssueOptions = {},
): PluginIssue {
  return {
    code,
    message,
    severity: options.severity ?? "error",
    ...(options.path === undefined ? {} : { path: options.path }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
  };
}
