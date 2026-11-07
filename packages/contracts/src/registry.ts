import { err, ok, type Result } from "./result.js";

/**
 * Minimal shape every registry entry must expose. Concrete definition types
 * extend this with their own declarative fields.
 */
export interface RegistryEntry {
  /** Globally qualified, stable identifier, e.g. `vendor.feature-name`. */
  readonly id: string;
}

/** Reason a registry operation was rejected. */
export type RegistryErrorKind = "duplicate-id" | "not-found";

/**
 * Structured, representation-independent registry error.
 */
export interface RegistryError {
  readonly kind: RegistryErrorKind;
  /** Identifier the failed operation referred to. */
  readonly id: string;
  /** Human-readable explanation. Not for programmatic decisions. */
  readonly message: string;
}

/**
 * Contract shared by all definition registries.
 *
 * Registries never silently overwrite: registering an already-used id is an
 * explicit duplicate conflict, and removing an unknown id is an explicit
 * not-found error. Implementations must detect duplicate identifiers and
 * manage conflicts instead of mutating state quietly.
 */
export interface DefinitionRegistry<TEntry extends RegistryEntry> {
  /**
   * Registers a definition. Fails with a `duplicate-id` error when the id is
   * already present.
   */
  register(entry: TEntry): Result<TEntry, RegistryError>;

  /**
   * Removes a definition. Fails with a `not-found` error when the id is not
   * registered.
   */
  unregister(id: string): Result<TEntry, RegistryError>;

  /** Returns the definition with the given id, if present. */
  get(id: string): TEntry | undefined;

  /** Returns the definition with the given id or a `not-found` error. */
  require(id: string): Result<TEntry, RegistryError>;

  /** Checks whether a definition with the given id is registered. */
  has(id: string): boolean;

  /** All registered definitions, in registration order. */
  all(): readonly TEntry[];

  /** Number of registered definitions. */
  readonly size: number;
}

/** Builds the standard `duplicate-id` error. */
export function duplicateIdError(id: string, registryName: string): RegistryError {
  return {
    kind: "duplicate-id",
    id,
    message: `${registryName} already contains a definition with id "${id}"`,
  };
}

/** Builds the standard `not-found` error. */
export function notFoundError(id: string, registryName: string): RegistryError {
  return {
    kind: "not-found",
    id,
    message: `${registryName} has no definition with id "${id}"`,
  };
}

/**
 * Reusable registration state for concrete registries.
 *
 * Concrete registries delegate storage and conflict detection to this helper
 * so every registry behaves identically without duplicating rules.
 */
export class RegistryStore<TEntry extends RegistryEntry>
  implements DefinitionRegistry<TEntry>
{
  private readonly byId = new Map<string, TEntry>();
  private readonly byOrder: TEntry[] = [];

  constructor(private readonly registryName: string) {}

  register(entry: TEntry): Result<TEntry, RegistryError> {
    if (this.byId.has(entry.id)) {
      return err(duplicateIdError(entry.id, this.registryName));
    }
    this.byId.set(entry.id, entry);
    this.byOrder.push(entry);
    return ok(entry);
  }

  unregister(id: string): Result<TEntry, RegistryError> {
    const existing = this.byId.get(id);
    if (existing === undefined) {
      return err(notFoundError(id, this.registryName));
    }
    this.byId.delete(id);
    const orderIndex = this.byOrder.findIndex((entry) => entry.id === id);
    if (orderIndex >= 0) {
      this.byOrder.splice(orderIndex, 1);
    }
    return ok(existing);
  }

  get(id: string): TEntry | undefined {
    return this.byId.get(id);
  }

  require(id: string): Result<TEntry, RegistryError> {
    const existing = this.byId.get(id);
    return existing === undefined
      ? err(notFoundError(id, this.registryName))
      : ok(existing);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  all(): readonly TEntry[] {
    return [...this.byOrder];
  }

  get size(): number {
    return this.byId.size;
  }
}
