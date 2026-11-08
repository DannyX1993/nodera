import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";

import {
  ComponentRegistry,
  DuplicateComponentError,
  MissingComponentError,
  createComponentRenderers,
} from "./component-registry.js";

interface MarkerProps {
  readonly label: string;
}

function createMarker(label: string): ComponentType<MarkerProps> {
  return function Marker() {
    return null;
  };
}

describe("ComponentRegistry", () => {
  it("registers a component and returns it by id", () => {
    const registry = new ComponentRegistry<MarkerProps>();
    const marker = createMarker("a");

    registry.register("acme.renderer.a", marker);

    expect(registry.has("acme.renderer.a")).toBe(true);
    expect(registry.get("acme.renderer.a")).toBe(marker);
    expect(registry.listIds()).toEqual(["acme.renderer.a"]);
    expect(registry.size).toBe(1);
  });

  it("returns undefined from tryGet for an unknown id", () => {
    const registry = new ComponentRegistry<MarkerProps>();
    registry.register("acme.renderer.a", createMarker("a"));

    expect(registry.tryGet("acme.renderer.b")).toBeUndefined();
    expect(registry.tryGet("acme.renderer.a")).not.toBeUndefined();
  });

  it("unregisters a component and keeps registration order for the rest", () => {
    const registry = new ComponentRegistry<MarkerProps>();
    registry.register("a", createMarker("a"));
    registry.register("b", createMarker("b"));

    registry.unregister("a");

    expect(registry.has("a")).toBe(false);
    expect(registry.listIds()).toEqual(["b"]);
    expect(registry.size).toBe(1);
  });

  it("rejects a duplicate id with the documented error", () => {
    const registry = new ComponentRegistry<MarkerProps>();
    registry.register("acme.renderer.a", createMarker("a"));

    expect(() => registry.register("acme.renderer.a", createMarker("b"))).toThrow(
      "Duplicate component registration for id 'acme.renderer.a'",
    );
    try {
      registry.register("acme.renderer.a", createMarker("b"));
    } catch (error) {
      expect(error).toBeInstanceOf(DuplicateComponentError);
      expect((error as DuplicateComponentError).name).toBe("DuplicateComponentError");
    }
    expect(registry.size).toBe(1);
  });

  it("throws the documented error when a component is missing", () => {
    const registry = new ComponentRegistry<MarkerProps>();

    expect(() => registry.get("acme.renderer.missing")).toThrow(
      "No component registered for id 'acme.renderer.missing'",
    );
    try {
      registry.get("acme.renderer.missing");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingComponentError);
      expect((error as MissingComponentError).name).toBe("MissingComponentError");
    }
  });
});

describe("createComponentRenderers", () => {
  it("creates three independent empty renderer registries", () => {
    const renderers = createComponentRenderers();

    expect(renderers.panels.size).toBe(0);
    expect(renderers.properties.size).toBe(0);
    expect(renderers.toolbars.size).toBe(0);

    const first = createComponentRenderers();
    first.panels.register("acme.panel", function Panel() {
      return null;
    });

    expect(first.panels.size).toBe(1);
    expect(renderers.panels.size).toBe(0);
  });
});
