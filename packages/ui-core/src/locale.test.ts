import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, translate, type Locale } from "./locale.js";

/**
 * The English catalog is the default every surface renders when the host
 * supplies no locale. Each key is asserted individually so a rename or a
 * translation slipping into the default catalog fails loudly instead of hiding
 * behind an aggregate snapshot.
 */
const EXPECTED_EN: Readonly<Record<string, string>> = Object.freeze({
  "palette.search": "Search nodes",
  "palette.addNode": "Add {name}",
  "palette.empty": "No node definitions",
  "search.placeholder": "Search graph",
  "search.clear": "Clear search",
  "search.hint": "Type to search nodes and edges",
  "search.empty": "No matching elements",
  "search.truncated": "Showing the first {limit} matches",
  "inspector.empty": "Select a node or edge to inspect",
  "inspector.ports": "Ports",
  "inspector.properties": "Properties",
  "properties.empty": "Select a node to edit its properties",
  "properties.unknownDefinition": 'Unknown node definition "{definitionId}"',
  "properties.noProperties": "This node definition declares no properties",
  "properties.edgeLabel": "Edge label",
  "metadata.title": "Graph metadata",
  "metadata.name": "Graph name",
  "metadata.description": "Graph description",
  "metadata.tags": "Tags",
  "validation.validate": "Validate graph",
  "validation.action": "Validate",
  "validation.pending": "Not validated yet",
  "validation.empty": "No validation issues",
  "validation.severity.error": "Errors",
  "validation.severity.warning": "Warnings",
  "validation.severity.info": "Information",
  "validation.count": "{count} {severity} issues",
  "validation.selectElement": "Select {elementId}",
  "history.undo": "Undo",
  "history.redo": "Redo",
  "history.undoable": "Undoable",
  "history.redoable": "Redoable",
  "history.empty": "Empty history",
  "panel.hide": "Hide {title}",
  "actions.addNode": "Add node",
  "canvas.insertNode": "Insert node",
  "canvas.waypoint":
    "Waypoint {index}: drag to move, double-click to remove, arrow keys to nudge, Delete to remove",
  "adapter.reactFlow": "React Flow",
});

describe("DEFAULT_LOCALE", () => {
  it('declares the "en" locale code', () => {
    expect(DEFAULT_LOCALE.code).toBe("en");
  });

  it("holds the exact English string of every extracted message", () => {
    const actual = Object.entries(DEFAULT_LOCALE.messages);
    const expected = Object.entries(EXPECTED_EN);
    expect(actual).toEqual(expected);
  });

  it("names its keys with stable, namespaced identifiers", () => {
    const malformed = Object.keys(DEFAULT_LOCALE.messages).filter(
      (key) => !/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/.test(key),
    );
    expect(malformed).toEqual([]);
  });

  it("is shared, immutable data", () => {
    expect(Object.isFrozen(DEFAULT_LOCALE)).toBe(true);
    expect(Object.isFrozen(DEFAULT_LOCALE.messages)).toBe(true);
  });
});

describe("translate", () => {
  it("returns the catalog string of a key", () => {
    expect(translate(DEFAULT_LOCALE, "history.undo")).toBe("Undo");
  });

  it("interpolates a named string parameter", () => {
    expect(translate(DEFAULT_LOCALE, "palette.addNode", { name: "Datasource" })).toBe(
      "Add Datasource",
    );
  });

  it("interpolates a numeric parameter", () => {
    expect(translate(DEFAULT_LOCALE, "search.truncated", { limit: 20 })).toBe(
      "Showing the first 20 matches",
    );
  });

  it("interpolates every placeholder of a message", () => {
    expect(translate(DEFAULT_LOCALE, "validation.count", { count: 3, severity: "error" })).toBe(
      "3 error issues",
    );
    expect(translate(DEFAULT_LOCALE, "canvas.waypoint", { index: 2 })).toBe(
      "Waypoint 2: drag to move, double-click to remove, arrow keys to nudge, Delete to remove",
    );
  });

  it("leaves a placeholder without a parameter intact", () => {
    expect(translate(DEFAULT_LOCALE, "panel.hide")).toBe("Hide {title}");
    expect(translate(DEFAULT_LOCALE, "panel.hide", { other: "x" })).toBe("Hide {title}");
  });

  it("prefers the message of the locale it is given", () => {
    const spanish: Locale = {
      code: "es",
      messages: { "history.undo": "Deshacer" },
    };

    expect(translate(spanish, "history.undo")).toBe("Deshacer");
  });

  it("falls back to the en message when the locale omits the key", () => {
    const spanish: Locale = {
      code: "es",
      messages: { "history.undo": "Deshacer" },
    };

    expect(translate(spanish, "history.redo")).toBe("Redo");
  });

  it("falls back to the key itself when no catalog declares it", () => {
    expect(translate(DEFAULT_LOCALE, "surface.unknownKey")).toBe("surface.unknownKey");
    expect(translate({ code: "es", messages: {} }, "surface.unknownKey")).toBe(
      "surface.unknownKey",
    );
  });

  it("interpolates parameters on a fallback message", () => {
    expect(translate({ code: "es", messages: {} }, "palette.addNode", { name: "Sink" })).toBe(
      "Add Sink",
    );
  });
});
