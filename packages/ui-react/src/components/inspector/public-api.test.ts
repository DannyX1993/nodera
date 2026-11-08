import { describe, expect, it } from "vitest";

import { PROPERTY_TYPES } from "@nodera/property-system";

import * as uiReact from "../../index.js";

describe("@nodera/ui-react inspector public surface", () => {
  it("exports the inspector panels from the package entry point", () => {
    expect(typeof uiReact.PropertiesPanel).toBe("function");
    expect(typeof uiReact.InspectorPanel).toBe("function");
    expect(typeof uiReact.MetadataPanel).toBe("function");
  });

  it("exports the property renderer fallbacks from the package entry point", () => {
    expect(typeof uiReact.defaultPropertyRenderer).toBe("function");
    expect(typeof uiReact.createDefaultPropertyRenderers).toBe("function");
    expect(uiReact.createDefaultPropertyRenderers().listIds()).toEqual([...PROPERTY_TYPES]);
  });

  it("exports the property grouping helper from the package entry point", () => {
    expect(typeof uiReact.groupPropertiesForDisplay).toBe("function");
    expect(uiReact.UNGROUPED_PROPERTY_SECTION_TITLE).toBe("General");
  });
});
