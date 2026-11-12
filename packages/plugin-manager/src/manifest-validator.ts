import type {
  PluginAuthor,
  PluginCompatibility,
  PluginContribution,
  PluginContributionKind,
  PluginDependency,
  PluginIssue,
  PluginIssues,
  PluginManifest,
  PluginPermissions,
} from "@nodera/plugin-api";
import { isPluginId, pluginIssue } from "@nodera/plugin-api";
import { err, ok, type Result } from "@nodera/contracts";
import { isValidVersion, parseVersionRange } from "./semver.js";

/**
 * Manifest validation for untrusted input.
 *
 * A manifest arrives from a package on disk or a host configuration, so it is
 * untrusted data: validate it structurally before treating it as the plugin
 * contract. Every failure is a `plugin.invalid-manifest` diagnostic carrying a
 * precise `path`; nothing throws and unknown extra keys are ignored so a
 * forward-compatible manifest still validates.
 */

/** Contribution kinds a manifest may declare (mirrors `PluginContributionKind`). */
const CONTRIBUTION_KINDS: readonly PluginContributionKind[] = [
  "node",
  "edge",
  "property",
  "renderer",
  "tool",
  "panel",
  "validator",
  "theme",
  "layout",
  "layout-strategy",
  "importer",
  "exporter",
  "dialog",
];

const CONTRIBUTION_KIND_SET: ReadonlySet<string> = new Set(CONTRIBUTION_KINDS);

type PlainObject = Record<string, unknown>;
type Path = readonly string[];
type Report = (path: Path, message: string) => void;

/** Validates an untrusted value as a plugin manifest. */
export function validatePluginManifest(
  value: unknown,
): Result<PluginManifest, PluginIssues> {
  if (!isPlainObject(value)) {
    return err([
      pluginIssue(
        "plugin.invalid-manifest",
        `Expected a plugin manifest object, received ${describeValue(value)}`,
        { path: [] },
      ),
    ]);
  }

  const issues: PluginIssue[] = [];
  const report: Report = (path, message) => {
    issues.push(pluginIssue("plugin.invalid-manifest", message, { path }));
  };

  const id = readId(value.id, ["id"], report, "plugin id");
  const name = readText(value.name, ["name"], report, "plugin name");
  const version = readVersion(value.version, ["version"], report, "plugin version");
  const description =
    value.description === undefined
      ? undefined
      : readString(value.description, ["description"], report, "plugin description");
  const author =
    value.author === undefined ? undefined : readAuthor(value.author, ["author"], report);
  const dependencies =
    value.dependencies === undefined
      ? undefined
      : readDependencies(value.dependencies, ["dependencies"], report);
  const compatibility =
    value.compatibility === undefined
      ? undefined
      : readCompatibility(value.compatibility, ["compatibility"], report);
  const contributions =
    value.contributions === undefined
      ? undefined
      : readContributions(value.contributions, ["contributions"], report);
  const permissions =
    value.permissions === undefined
      ? undefined
      : readPermissions(value.permissions, ["permissions"], report);

  // Required fields also need explicit narrowing checks: `issues.length` alone
  // cannot prove they were read successfully to the type checker.
  if (
    issues.length > 0 ||
    id === undefined ||
    name === undefined ||
    version === undefined
  ) {
    return err(issues);
  }

  return ok({
    id,
    name,
    version,
    ...(description === undefined ? {} : { description }),
    ...(author === undefined ? {} : { author }),
    ...(dependencies === undefined ? {} : { dependencies }),
    ...(compatibility === undefined ? {} : { compatibility }),
    ...(contributions === undefined ? {} : { contributions }),
    ...(permissions === undefined ? {} : { permissions }),
  } satisfies PluginManifest);
}

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readId(value: unknown, path: Path, report: Report, label: string): string | undefined {
  if (!isPluginId(value)) {
    report(path, `Expected ${label} to be a globally qualified id (vendor.feature-name), received ${describeValue(value)}`);
    return undefined;
  }
  return value;
}

/** Reads a non-blank string (names, formats, versions). */
function readText(value: unknown, path: Path, report: Report, label: string): string | undefined {
  if (typeof value !== "string") {
    report(path, `Expected ${label} to be a string, received ${describeValue(value)}`);
    return undefined;
  }
  if (value.trim().length === 0) {
    report(path, `Expected ${label} to be a non-empty string`);
    return undefined;
  }
  return value;
}

/** Reads any string, including an empty one (descriptions, e-mails, urls). */
function readString(value: unknown, path: Path, report: Report, label: string): string | undefined {
  if (typeof value !== "string") {
    report(path, `Expected ${label} to be a string, received ${describeValue(value)}`);
    return undefined;
  }
  return value;
}

function readVersion(value: unknown, path: Path, report: Report, label: string): string | undefined {
  if (!isValidVersion(value)) {
    report(path, `Expected ${label} to be a semantic version (major.minor.patch), received ${describeValue(value)}`);
    return undefined;
  }
  return value;
}

function readRange(value: unknown, path: Path, report: Report, label: string): string | undefined {
  if (typeof value !== "string") {
    report(path, `Expected ${label} to be a version range string, received ${describeValue(value)}`);
    return undefined;
  }
  if (parseVersionRange(value) === undefined) {
    report(path, `Expected ${label} to be one of *, x.y.z, ^x.y.z or ~x.y.z, received "${value}"`);
    return undefined;
  }
  return value;
}

function readAuthor(value: unknown, path: Path, report: Report): PluginAuthor | undefined {
  if (!isPlainObject(value)) {
    report(path, `Expected author to be an object, received ${describeValue(value)}`);
    return undefined;
  }
  const name = readText(value.name, [...path, "name"], report, "author name");
  const email =
    value.email === undefined
      ? undefined
      : readString(value.email, [...path, "email"], report, "author email");
  const url =
    value.url === undefined ? undefined : readString(value.url, [...path, "url"], report, "author url");

  if (name === undefined || (value.email !== undefined && email === undefined) || (value.url !== undefined && url === undefined)) {
    return undefined;
  }
  return {
    name,
    ...(email === undefined ? {} : { email }),
    ...(url === undefined ? {} : { url }),
  };
}

function readDependencies(
  value: unknown,
  path: Path,
  report: Report,
): readonly PluginDependency[] | undefined {
  if (!Array.isArray(value)) {
    report(path, `Expected dependencies to be an array, received ${describeValue(value)}`);
    return undefined;
  }

  const dependencies: PluginDependency[] = [];
  let failed = false;

  for (const [index, entry] of value.entries()) {
    const entryPath: Path = [...path, String(index)];
    if (!isPlainObject(entry)) {
      report(entryPath, `Expected a dependency object, received ${describeValue(entry)}`);
      failed = true;
      continue;
    }

    const id = readId(entry.id, [...entryPath, "id"], report, "dependency id");
    const version =
      entry.version === undefined
        ? undefined
        : readRange(entry.version, [...entryPath, "version"], report, "dependency version");

    if (id === undefined || (entry.version !== undefined && version === undefined)) {
      failed = true;
      continue;
    }
    dependencies.push({ id, ...(version === undefined ? {} : { version }) });
  }

  return failed ? undefined : dependencies;
}

function readCompatibility(
  value: unknown,
  path: Path,
  report: Report,
): PluginCompatibility | undefined {
  if (!isPlainObject(value)) {
    report(path, `Expected compatibility to be an object, received ${describeValue(value)}`);
    return undefined;
  }

  const sdkVersion =
    value.sdkVersion === undefined
      ? undefined
      : readRange(value.sdkVersion, [...path, "sdkVersion"], report, "SDK version range");
  const documentFormat =
    value.documentFormat === undefined
      ? undefined
      : readText(value.documentFormat, [...path, "documentFormat"], report, "document format");
  const documentVersion =
    value.documentVersion === undefined
      ? undefined
      : readText(value.documentVersion, [...path, "documentVersion"], report, "document version");
  const definitionVersions =
    value.definitionVersions === undefined
      ? undefined
      : readDefinitionVersions(value.definitionVersions, [...path, "definitionVersions"], report);

  if (
    (value.sdkVersion !== undefined && sdkVersion === undefined) ||
    (value.documentFormat !== undefined && documentFormat === undefined) ||
    (value.documentVersion !== undefined && documentVersion === undefined) ||
    (value.definitionVersions !== undefined && definitionVersions === undefined)
  ) {
    return undefined;
  }

  return {
    ...(sdkVersion === undefined ? {} : { sdkVersion }),
    ...(documentFormat === undefined ? {} : { documentFormat }),
    ...(documentVersion === undefined ? {} : { documentVersion }),
    ...(definitionVersions === undefined ? {} : { definitionVersions }),
  };
}

function readDefinitionVersions(
  value: unknown,
  path: Path,
  report: Report,
): Readonly<Record<string, string>> | undefined {
  if (!isPlainObject(value)) {
    report(path, `Expected definitionVersions to be an object, received ${describeValue(value)}`);
    return undefined;
  }

  const versions: Record<string, string> = {};
  let failed = false;
  for (const [definitionId, version] of Object.entries(value)) {
    if (definitionId.trim().length === 0) {
      report(path, "Expected definitionVersions keys to be non-empty definition ids");
      failed = true;
      continue;
    }
    const read = readText(version, [...path, definitionId], report, `version of "${definitionId}"`);
    if (read === undefined) {
      failed = true;
      continue;
    }
    versions[definitionId] = read;
  }
  return failed ? undefined : versions;
}

function readContributions(
  value: unknown,
  path: Path,
  report: Report,
): readonly PluginContribution[] | undefined {
  if (!Array.isArray(value)) {
    report(path, `Expected contributions to be an array, received ${describeValue(value)}`);
    return undefined;
  }

  const contributions: PluginContribution[] = [];
  let failed = false;

  for (const [index, entry] of value.entries()) {
    const entryPath: Path = [...path, String(index)];
    if (!isPlainObject(entry)) {
      report(entryPath, `Expected a contribution object, received ${describeValue(entry)}`);
      failed = true;
      continue;
    }

    const type = isContributionKind(entry.type) ? entry.type : undefined;
    if (type === undefined) {
      report([...entryPath, "type"], `Expected contribution type to be a known contribution kind, received ${describeValue(entry.type)}`);
      failed = true;
    }
    const id = readId(entry.id, [...entryPath, "id"], report, "contribution id");
    const version =
      entry.version === undefined
        ? undefined
        : readVersion(entry.version, [...entryPath, "version"], report, "contribution version");

    if (type === undefined || id === undefined || (entry.version !== undefined && version === undefined)) {
      failed = true;
      continue;
    }
    contributions.push({ type, id, ...(version === undefined ? {} : { version }) });
  }

  return failed ? undefined : contributions;
}

function readPermissions(value: unknown, path: Path, report: Report): PluginPermissions | undefined {
  if (!isPlainObject(value)) {
    report(path, `Expected permissions to be an object, received ${describeValue(value)}`);
    return undefined;
  }

  const network =
    value.network === undefined
      ? undefined
      : readBoolean(value.network, [...path, "network"], report, "network permission");
  const storage =
    value.storage === undefined
      ? undefined
      : readBoolean(value.storage, [...path, "storage"], report, "storage permission");

  if (
    (value.network !== undefined && network === undefined) ||
    (value.storage !== undefined && storage === undefined)
  ) {
    return undefined;
  }

  return {
    ...(network === undefined ? {} : { network }),
    ...(storage === undefined ? {} : { storage }),
  };
}

function readBoolean(value: unknown, path: Path, report: Report, label: string): boolean | undefined {
  if (typeof value !== "boolean") {
    report(path, `Expected ${label} to be a boolean, received ${describeValue(value)}`);
    return undefined;
  }
  return value;
}

function isContributionKind(value: unknown): value is PluginContributionKind {
  return typeof value === "string" && CONTRIBUTION_KIND_SET.has(value);
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string") return `the string "${value}"`;
  return typeof value;
}
