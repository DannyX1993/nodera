import {
  err,
  ok,
  RegistryStore,
  type DefinitionRegistry,
  type RegistryError,
  type Result,
} from "@nodera/contracts";

/** Structured failure of an import operation. */
export interface ImportError {
  /** Why the import failed. */
  readonly kind: "parse-failed" | "unsupported-version";
  /** Human-readable explanation. Not for programmatic decisions. */
  readonly message: string;
}

/**
 * An importer contributed by an adapter or extension.
 *
 * The Phase 1 contract fixes identity, format and registration semantics;
 * the parsed payload is typed as `unknown` because the portable document
 * model is a Phase 2 contract. Importers never receive raw data as trusted
 * input: implementations must validate at the boundary.
 */
export interface Importer {
  /** Globally qualified, stable identifier, e.g. `vendor.json-importer`. */
  readonly id: string;
  /** Stable format id this importer parses, e.g. `json`, `yaml`. */
  readonly format: string;
  /** Importer version, semver-shaped. */
  readonly version: string;
  /** Parses raw content into the target representation. */
  importContent(raw: string): Result<unknown, ImportError>;
}

/**
 * Registry of importers: register, query by id and format, unregister.
 * Registration never overwrites silently: duplicate ids are conflicts.
 */
export class ImporterRegistry implements DefinitionRegistry<Importer> {
  private readonly store = new RegistryStore<Importer>("ImporterRegistry");

  register(importer: Importer): Result<Importer, RegistryError> {
    return this.store.register(importer);
  }

  unregister(id: string): Result<Importer, RegistryError> {
    return this.store.unregister(id);
  }

  get(id: string): Importer | undefined {
    return this.store.get(id);
  }

  require(id: string): Result<Importer, RegistryError> {
    return this.store.require(id);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  /** All importers registered for a format, in registration order. */
  byFormat(format: string): readonly Importer[] {
    return this.store.all().filter((importer) => importer.format === format);
  }

  /** Returns the importer of a format, failing explicitly if absent. */
  requireFormat(format: string): Result<Importer, RegistryError> {
    const found = this.byFormat(format)[0];
    if (found === undefined) {
      return err({
        kind: "not-found",
        id: format,
        message: `ImporterRegistry has no importer for format "${format}"`,
      });
    }
    return ok(found);
  }

  /** Formats with at least one importer, sorted alphabetically. */
  formats(): readonly string[] {
    return [...new Set(this.store.all().map((importer) => importer.format))].sort();
  }

  all(): readonly Importer[] {
    return this.store.all();
  }

  get size(): number {
    return this.store.size;
  }
}
