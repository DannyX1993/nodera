/**
 * Translatable strings of the editor surfaces (S8 "Textos traducibles",
 * "Internacionalización").
 *
 * The contract is framework-free on purpose: a catalog is data, so the default
 * `en` messages live next to the rest of the UI contracts and the React layer
 * only *reads* them. Nothing here imports React, the DOM or a locale API, which
 * keeps `@nodera/ui-core` usable from any renderer and a future Vue/Angular
 * binding able to reuse the same catalog (AGENTS.md §4.1).
 *
 * Keys are stable, namespaced identifiers (`<surface>.<message>`) and never the
 * English text itself: `t()` resolves a key, so a host can translate the
 * catalog without touching a component and a component never renames a message
 * by editing a sentence.
 */

/** Messages of one locale, keyed by the stable identifiers of the contract. */
export type LocaleMessages = Readonly<Record<string, string>>;

/**
 * A locale: its code plus the messages it declares.
 *
 * A catalog may be partial. {@link translate} fills the gaps from the `en`
 * default, so a host translates the surfaces it cares about and keeps the rest
 * of the framework in English instead of rendering raw keys.
 */
export interface Locale {
  /** BCP 47 language tag, e.g. `"en"`, `"es"` or `"es-AR"`. */
  readonly code: string;
  readonly messages: LocaleMessages;
}

/**
 * The English catalog: exactly the strings the surfaces rendered before the
 * contract existed.
 *
 * Values are byte-identical to those historical literals, so adding i18n is not
 * a text change for any host that does not configure a locale.
 */
const EN_MESSAGES: LocaleMessages = Object.freeze({
  // Node palette (discovery).
  "palette.search": "Search nodes",
  "palette.addNode": "Add {name}",
  "palette.empty": "No node definitions",
  // Graph search panel.
  "search.placeholder": "Search graph",
  "search.clear": "Clear search",
  "search.hint": "Type to search nodes and edges",
  "search.empty": "No matching elements",
  "search.truncated": "Showing the first {limit} matches",
  // Read-only inspector.
  "inspector.empty": "Select a node or edge to inspect",
  "inspector.ports": "Ports",
  "inspector.properties": "Properties",
  // Properties panel.
  "properties.empty": "Select a node to edit its properties",
  "properties.unknownDefinition": 'Unknown node definition "{definitionId}"',
  "properties.noProperties": "This node definition declares no properties",
  "properties.edgeLabel": "Edge label",
  // Graph metadata panel.
  "metadata.title": "Graph metadata",
  "metadata.name": "Graph name",
  "metadata.description": "Graph description",
  "metadata.tags": "Tags",
  // Validation report.
  "validation.validate": "Validate graph",
  "validation.action": "Validate",
  "validation.pending": "Not validated yet",
  "validation.empty": "No validation issues",
  "validation.severity.error": "Errors",
  "validation.severity.warning": "Warnings",
  "validation.severity.info": "Information",
  "validation.count": "{count} {severity} issues",
  "validation.selectElement": "Select {elementId}",
  // Editing history.
  "history.undo": "Undo",
  "history.redo": "Redo",
  "history.undoable": "Undoable",
  "history.redoable": "Redoable",
  "history.empty": "Empty history",
  // Panel chrome.
  "panel.hide": "Hide {title}",
  // Actions.
  "actions.addNode": "Add node",
  // Canvas affordances.
  "canvas.insertNode": "Insert node",
  "canvas.waypoint":
    "Waypoint {index}: drag to move, double-click to remove, arrow keys to nudge, Delete to remove",
  // Engine metadata.
  "adapter.reactFlow": "React Flow",
});

/** The locale every surface renders when the host configures none. */
export const DEFAULT_LOCALE: Locale = Object.freeze({
  code: "en",
  messages: EN_MESSAGES,
});

/** `{name}` placeholder of a catalog message. */
const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * Resolves one message of `locale` and interpolates its `{name}` placeholders.
 *
 * Resolution order is the locale the caller renders, then the `en` default, then
 * the key itself, so a partial or empty catalog never renders nothing and a
 * missing key still identifies itself in the UI. A placeholder without a
 * parameter is left verbatim: a missing value must be visible, not silently
 * blank.
 */
export function translate(
  locale: Locale,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string {
  const template = locale.messages[key] ?? DEFAULT_LOCALE.messages[key] ?? key;
  if (params === undefined) {
    return template;
  }
  return template.replace(PLACEHOLDER, (placeholder: string, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}
