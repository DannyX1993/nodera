/**
 * Configurable keyboard shortcuts of the editor surface (S8 "Atajos
 * configurables").
 *
 * A shortcut is presentation configuration, never document state: the host
 * rebinds it for its application and the graph model is untouched. The contract
 * lives in the framework-free core so the canvas adapter and the React layer
 * name the same actions, and it is pure data — a key, optional modifiers and a
 * translatable label — so nothing here can execute or capture a callback.
 */

/** One keyboard binding of an action. */
export type ShortcutBinding = {
  /**
   * `KeyboardEvent.key` of the binding, or the keys that all trigger it, e.g.
   * `"Delete"`, `"Escape"` or `["Delete", "Backspace"]`.
   */
  readonly key: string | readonly string[];
  /** Modifiers the binding requires, in addition to {@link ShortcutBinding.key}. */
  readonly modifiers?: readonly ("alt" | "ctrl" | "meta" | "shift")[];
  /** Accessible, translatable description of what the shortcut does. */
  readonly label: string;
};

/** Actions a surface can bind to a shortcut. */
export type ShortcutAction = "delete-selection" | "close-overlay";

/**
 * Complete binding set: every action has exactly one shortcut.
 *
 * The map is total on purpose, so a surface can read its key without a null
 * check and a host cannot configure half of the shortcuts by accident.
 */
export type ShortcutMap = Readonly<Record<ShortcutAction, ShortcutBinding>>;

/**
 * The shortcuts the framework binds when the host configures none.
 *
 * `Delete` and `Escape` are the keys the surfaces shipped with before the
 * contract existed, so a host that never sets `shortcuts` keeps the behaviour
 * it already had.
 */
export const DEFAULT_SHORTCUTS: ShortcutMap = Object.freeze({
  "delete-selection": Object.freeze({ key: ["Delete", "Backspace"], label: "Delete selected" }),
  "close-overlay": Object.freeze({ key: "Escape", label: "Close" }),
});
