import {
  err,
  ok,
  RegistryStore,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";

/** Structured failure of an export operation. */
export interface ExportError {
  /** Why the export failed. */
  readonly kind: "serialization-failed" | "unsupported-version";
  /** Human-readable explanation. Not for programmatic decisions. */
  readonly message: string;
}

/**
 * An exporter contributed by an adapter or extension.
 *
 * The Phase 1 contract fixes identity, format and registration semantics;
 * the exported payload is typed as `unknown` because the portable document
 * model is a Phase 2 contract. Exporters receive already-validated domain
 * data and produce portable text; they never embed runtime objects.
 */
export interface Exporter {
  /** Globally qualified, stable identifier, e.g. `vendor.json-exporter`. */
  readonly id: string;
  /** Stable format id this exporter writes, e.g. `json`, `yaml`. */
  readonly format: string;
  /** Exporter version, semver-shaped. */
  readonly version: string;
  /** Serializes a representation into portable content. */
  exportContent(document: unknown): Result<string, ExportError>;
}

/**
 * Registry of exporters: register, query by id and format, unregister.
 * Registration never overwrites silently: duplicate ids are conflicts.
 */
export class ExporterRegistry implements DefinitionRegistry<Exporter> {
  private readonly store = new RegistryStore<Exporter>("ExporterRegistry");

  register(exporter: Exporter): Result<Exporter, RegistryError> {
    return this.store.register(exporter);
  }

  unregister(id: string): Result<Exporter, RegistryError> {
    return this.store.unregister(id);
  }

  get(id: string): Exporter | undefined {
    return this.store.get(id);
  }

  require(id: string): Result<Exporter, RegistryError> {
    return this.store.require(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  /** All exporters registered for a format, in registration order. */
  byFormat(format: string): readonly Exporter[] {
    return this.store.all().filter((exporter) => exporter.format === format);
  }

  /** Returns the exporter of a format, failing explicitly if absent. */
  requireFormat(format: string): Result<Exporter, RegistryError> {
    const found = this.byFormat(format)[0];
    if (found === undefined) {
      return err({
        kind: "not-found",
        id: format,
        message: `ExporterRegistry has no exporter for format "${format}"`,
      });
    }
    return ok(found);
  }

  /** Formats with at least one exporter, sorted alphabetically. */
  formats(): readonly string[] {
    return [...new Set(this.store.all().map((exporter) => exporter.format))].sort();
  }

  all(): readonly Exporter[] {
    return this.store.all();
  }

  get size(): number {
    return this.store.size;
  }
}
