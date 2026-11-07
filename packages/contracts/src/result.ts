/**
 * Minimal result type for operations that can fail with a typed error.
 *
 * Domain operations prefer explicit results over thrown exceptions so callers
 * (and later application-layer use cases) receive structured, understandable
 * outcomes instead of control-flow exceptions.
 */

/** Successful outcome carrying a value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed outcome carrying a typed error. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Explicit result of an operation that may fail. */
export type Result<T, E> = Ok<T> | Err<E>;

/** Builds a successful result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Builds a failed result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
