import type { RegistryEntry } from "@nodera/contracts";

/**
 * Width class of a dialog.
 *
 * A size is a *token*, not a pixel value: the renderer maps it to its own width
 * so a host can restyle dialogs without editing the definition (AGENTS.md §5.2,
 * keep the schema separate from its visual representation).
 */
export type DialogSize = "sm" | "md" | "lg";

/**
 * Declarative dialog definition.
 *
 * A dialog is data, never a component: it says what a dialog is (a title, an
 * optional description and its dismissal policy) and the presentation adapter
 * decides how that becomes an accessible surface. The same definition can be
 * rendered by any framework adapter, and a plugin can contribute one without
 * importing React (AGENTS.md §4.5, §9).
 */
export interface DialogDefinition extends RegistryEntry {
  /** Globally qualified, stable id, e.g. `acme.dialog.create-node`. */
  readonly id: string;
  /** Human-readable title, used as the accessible name of the dialog. */
  readonly title: string;
  /** Optional supporting text, wired as the accessible description. */
  readonly description?: string;
  /** Width class the renderer applies. Defaults to `"md"`. */
  readonly size?: DialogSize;
  /**
   * Whether the user may dismiss the dialog (`Escape`, backdrop click).
   * Defaults to `true`; a definition that requires an explicit choice sets it to
   * `false`.
   */
  readonly dismissible?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Dialog values with every default resolved. */
export interface DialogDefaults {
  readonly size: DialogSize;
  readonly dismissible: boolean;
}

/** Documented defaults of a dialog definition that declares none. */
export const DEFAULT_DIALOG_DEFAULTS: DialogDefaults = Object.freeze({
  size: "md",
  dismissible: true,
});

/** Resolves the defaults of a dialog definition without mutating it. */
export function resolveDialogDefaults(dialog: DialogDefinition): DialogDefaults {
  return {
    size: dialog.size ?? DEFAULT_DIALOG_DEFAULTS.size,
    dismissible: dialog.dismissible ?? DEFAULT_DIALOG_DEFAULTS.dismissible,
  };
}
