/**
 * Minimal structural view of a JSON Schema (Draft 2020-12) document.
 *
 * JSON Schema is the reference standard for data structure constraints;
 * this interface keeps the commonly used keywords typed while preserving
 * any unknown keyword through its index signature (round-tripping must
 * not lose what this package does not understand).
 */
export interface JsonSchema {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema | readonly JsonSchema[];
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: string;
  readonly title?: string;
  readonly description?: string;
  readonly default?: unknown;
  /** Any other Draft 2020-12 keyword, preserved as-is. */
  readonly [keyword: string]: unknown;
}
