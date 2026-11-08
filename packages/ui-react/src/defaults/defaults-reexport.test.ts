import { describe, expect, it } from "vitest";

import {
  DEFAULT_PANELS,
  DEFAULT_TOOLS,
  createDefaultPanelRegistry,
  createDefaultToolRegistry,
} from "../index.js";

/**
 * The Phase 5 presets are declarative data and now live in `@nodera/ui-core`,
 * so framework-agnostic consumers (the SDK) can use them. `ui-react` keeps
 * exporting them unchanged: no host import breaks.
 */
describe("default composition re-exports", () => {
  it("still exposes the phase-5 panel presets", () => {
    expect(DEFAULT_PANELS.length).toBeGreaterThan(0);
    expect(createDefaultPanelRegistry().size).toBe(DEFAULT_PANELS.length);
  });

  it("still exposes the phase-5 tool presets", () => {
    expect(DEFAULT_TOOLS.length).toBeGreaterThan(0);
    expect(createDefaultToolRegistry().size).toBe(DEFAULT_TOOLS.length);
  });
});
