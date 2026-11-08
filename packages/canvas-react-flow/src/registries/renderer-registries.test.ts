import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_EDGE_RENDERER_ID,
  DEFAULT_NODE_RENDERER_ID,
  DEFAULT_PORT_RENDERER_ID,
  resolveNodeRenderer,
  resolvePortRenderer,
} from "./renderer-registries.js";
import {
  EdgeRendererRegistry,
  NodeRendererRegistry,
  PortRendererRegistry,
} from "./renderer-registries.js";
import type { NoderaPortRendererProps } from "../renderers/node-renderer-props.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function StubComponent(): never {
  throw new Error("not a real React component in tests");
}

/** Stub port renderer: same non-rendering body, typed for the port registry. */
const PortStub = StubComponent as unknown as ComponentType<NoderaPortRendererProps>;

/* ------------------------------------------------------------------ */
/*  NodeRendererRegistry tests                                        */
/* ------------------------------------------------------------------ */

describe("NodeRendererRegistry", () => {
  it("starts empty — listIds returns []", () => {
    const reg = new NodeRendererRegistry();
    expect(reg.listIds()).toEqual([]);
  });

  it("register + has + get returns the registered component", () => {
    const reg = new NodeRendererRegistry();
    reg.register("my-node", StubComponent as ComponentType);
    expect(reg.has("my-node")).toBe(true);
    expect(reg.get("my-node")).toBe(StubComponent);
  });

  it("listIds reflects registered ids", () => {
    const reg = new NodeRendererRegistry();
    reg.register("a", StubComponent as ComponentType);
    reg.register("b", StubComponent as ComponentType);
    expect(reg.listIds()).toEqual(["a", "b"]);
  });

  it("unregister removes the renderer and listIds updates", () => {
    const reg = new NodeRendererRegistry();
    reg.register("x", StubComponent as ComponentType);
    reg.unregister("x");
    expect(reg.has("x")).toBe(false);
    expect(reg.listIds()).toEqual([]);
  });

  it("duplicate registration throws DuplicateRegistrationError", () => {
    const reg = new NodeRendererRegistry();
    reg.register("dup", StubComponent as ComponentType);
    expect(() => reg.register("dup", StubComponent as ComponentType)).toThrowError(
      "Duplicate renderer registration for id 'dup'"
    );
  });

  it("get for unregistered id throws MissingRendererError", () => {
    const reg = new NodeRendererRegistry();
    expect(() => reg.get("ghost")).toThrowError("No node renderer registered for id 'ghost'");
  });

  it("resolveNodeRenderer falls back to sentinel when id not found", () => {
    expect(() => resolveNodeRenderer("ghost")).toThrowError(
      "No node renderer registered for id 'ghost'"
    );
  });

  it("DEFAULT_NODE_RENDERER_ID is a stable string", () => {
    expect(DEFAULT_NODE_RENDERER_ID).toBe("nodera-default-node");
  });

  it("resolve with sentinel returns sentinel's registration", () => {
    const reg = new NodeRendererRegistry();
    const sentinel = StubComponent as ComponentType;
    reg.register(DEFAULT_NODE_RENDERER_ID, sentinel);
    expect(resolveNodeRenderer("ghost", reg)).toBe(sentinel);
  });
});

/* ------------------------------------------------------------------ */
/*  EdgeRendererRegistry tests                                        */
/* ------------------------------------------------------------------ */

describe("EdgeRendererRegistry", () => {
  it("starts empty", () => {
    const reg = new EdgeRendererRegistry();
    expect(reg.listIds()).toEqual([]);
  });

  it("register + has + get cycle", () => {
    const reg = new EdgeRendererRegistry();
    reg.register("my-edge", StubComponent as ComponentType);
    expect(reg.has("my-edge")).toBe(true);
    expect(reg.get("my-edge")).toBe(StubComponent);
  });

  it("unregister clears the registry entry", () => {
    const reg = new EdgeRendererRegistry();
    reg.register("y", StubComponent as ComponentType);
    reg.unregister("y");
    expect(reg.has("y")).toBe(false);
  });

  it("duplicate throws DuplicateRegistrationError", () => {
    const reg = new EdgeRendererRegistry();
    reg.register("dup-edge", StubComponent as ComponentType);
    expect(() => reg.register("dup-edge", StubComponent as ComponentType)).toThrowError(
      "Duplicate renderer registration for id 'dup-edge'"
    );
  });

  it("get for missing id throws MissingRendererError", () => {
    const reg = new EdgeRendererRegistry();
    expect(() => reg.get("missing-edge")).toThrowError(
      "No edge renderer registered for id 'missing-edge'"
    );
  });

  it("DEFAULT_EDGE_RENDERER_ID is stable", () => {
    expect(DEFAULT_EDGE_RENDERER_ID).toBe("nodera-default-edge");
  });
});

/* ------------------------------------------------------------------ */
/*  resolveNodeRenderer integration tests                             */
/* ------------------------------------------------------------------ */

describe("resolveNodeRenderer", () => {
  it("throws when no registry provided and id not found", () => {
    expect(() => resolveNodeRenderer("missing-id")).toThrowError(
      "No node renderer registered for id 'missing-id'"
    );
  });
});

/* ------------------------------------------------------------------ */
/*  PortRendererRegistry tests (S3 component replacement, D8)          */
/* ------------------------------------------------------------------ */

describe("PortRendererRegistry", () => {
  it("starts empty", () => {
    const reg = new PortRendererRegistry();
    expect(reg.listIds()).toEqual([]);
  });

  it("register + has + get returns the registered component", () => {
    const reg = new PortRendererRegistry();
    reg.register("my-port", PortStub);
    expect(reg.has("my-port")).toBe(true);
    expect(reg.get("my-port")).toBe(StubComponent);
  });

  it("listIds reflects registered ids", () => {
    const reg = new PortRendererRegistry();
    reg.register("a-port", PortStub);
    reg.register("b-port", PortStub);
    expect(reg.listIds()).toEqual(["a-port", "b-port"]);
  });

  it("unregister removes the renderer and listIds updates", () => {
    const reg = new PortRendererRegistry();
    reg.register("x-port", PortStub);
    reg.unregister("x-port");
    expect(reg.has("x-port")).toBe(false);
    expect(reg.listIds()).toEqual([]);
  });

  it("duplicate registration throws DuplicateRegistrationError", () => {
    const reg = new PortRendererRegistry();
    reg.register("dup-port", PortStub);
    expect(() => reg.register("dup-port", PortStub)).toThrowError(
      "Duplicate renderer registration for id 'dup-port'"
    );
  });

  it("get for unregistered id throws MissingRendererError", () => {
    const reg = new PortRendererRegistry();
    expect(() => reg.get("x")).toThrowError("No port renderer registered for id 'x'");
  });

  it("DEFAULT_PORT_RENDERER_ID is a stable string", () => {
    expect(DEFAULT_PORT_RENDERER_ID).toBe("nodera-default-port");
  });
});

/* ------------------------------------------------------------------ */
/*  resolvePortRenderer (S3 component replacement, D8)                 */
/* ------------------------------------------------------------------ */

describe("resolvePortRenderer", () => {
  it("returns the registered component for a known id", () => {
    const reg = new PortRendererRegistry();
    const component = PortStub;
    reg.register("acme.port", component);
    expect(resolvePortRenderer("acme.port", reg)).toBe(component);
  });

  it("falls back to the default port renderer for an unknown id", () => {
    const reg = new PortRendererRegistry();
    const fallback = PortStub;
    reg.register(DEFAULT_PORT_RENDERER_ID, fallback);
    expect(resolvePortRenderer("ghost.port", reg)).toBe(fallback);
  });

  it("throws MissingRendererError when the id and the default are both unknown", () => {
    const reg = new PortRendererRegistry();
    expect(() => resolvePortRenderer("ghost.port", reg)).toThrowError(
      "No port renderer registered for id 'ghost.port'"
    );
  });

  it("throws when no registry is provided", () => {
    expect(() => resolvePortRenderer(DEFAULT_PORT_RENDERER_ID)).toThrowError(
      "No port renderer registered for id 'nodera-default-port'"
    );
  });
});