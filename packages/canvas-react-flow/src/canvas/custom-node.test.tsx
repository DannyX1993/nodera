import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { FC, ComponentType } from "react";

import { NoderaNodeRenderer, createNodeType, useNodeTypes } from "./custom-node.js";
import { NodeRendererRegistry } from "../registries/renderer-registries.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Minimal mock of a node data prop for the renderer. */
function mockNodeData(
  definitionId: string,
  rendererId?: string,
  label?: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    definitionId,
    label: label ?? "Test Node",
    ports: [
      { id: "in-1", direction: "input" as const, dataType: "string" },
      { id: "out-1", direction: "output" as const, dataType: "string" },
    ],
    properties: {},
  };
  if (rendererId) {
    data.rendererId = rendererId;
  }
  return data;
}

function CustomMarker(): import("react").ReactNode {
  return <span data-testid="custom-marker">CUSTOM</span>;
}

/* ------------------------------------------------------------------ */
/*  NoderaNodeRenderer tests                                           */
/* ------------------------------------------------------------------ */

describe("NoderaNodeRenderer", () => {
  describe("default rendering", () => {
    it("renders label from node data", () => {
      const data = mockNodeData("test-def");
      const registry = new NodeRendererRegistry();
      registry.register("nodera-default-node", CustomMarker as ComponentType);

      const { container } = render(
        <ReactFlowProvider>
          <NoderaNodeRenderer
            data={data as any}
            selected={false}
            nodeRendererRegistry={registry}
          />
        </ReactFlowProvider>
      );

      expect(container.textContent).toContain("Test Node");
    });

    it("renders port handles from data.ports", () => {
      const data = mockNodeData("test-def");
      const registry = new NodeRendererRegistry();
      registry.register("nodera-default-node", CustomMarker as ComponentType);

      const { container } = render(
        <ReactFlowProvider>
          <NoderaNodeRenderer
            data={data as any}
            selected={false}
            nodeRendererRegistry={registry}
          />
        </ReactFlowProvider>
      );

      // PortHandle renders [data-nodera-port-id] attributes.
      // Both the wrapper AND DefaultNodeRenderer render ports, so we get 4.
      const handles = container.querySelectorAll("[data-nodera-port-id]");
      expect(handles.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("custom renderer resolution", () => {
    it("definition with renderer id registered → custom marker rendered", () => {
      const data = mockNodeData("test-def", "my-custom-renderer");
      const registry = new NodeRendererRegistry();
      registry.register("my-custom-renderer", CustomMarker as ComponentType);

      const { container } = render(
        <ReactFlowProvider>
          <NoderaNodeRenderer
            data={data as any}
            selected={false}
            nodeRendererRegistry={registry}
          />
        </ReactFlowProvider>
      );

      expect(container.querySelector('[data-testid="custom-marker"]')).toBeTruthy();
    });

    it("unregistered renderer id → default renders (fallback)", () => {
      // Data specifies a custom renderer that is not registered.
      const data = mockNodeData("test-def", "unregistered-renderer");
      const registry = new NodeRendererRegistry();
      // Register only the default sentinel — the unregistered one should fall back.
      registry.register("nodera-default-node", CustomMarker as ComponentType);

      const { container } = render(
        <ReactFlowProvider>
          <NoderaNodeRenderer
            data={data as any}
            selected={false}
            nodeRendererRegistry={registry}
          />
        </ReactFlowProvider>
      );

      // Should render without crashing, showing the default marker.
      expect(container.textContent).toContain("Test Node");
    });
  });
});

describe("createNodeType factory", () => {
  it("creates a component that renders port handles", () => {
    const registry = new NodeRendererRegistry();
    registry.register("nodera-default-node", CustomMarker as ComponentType);

    const NodeType = createNodeType(registry);

    const { container } = render(
      <ReactFlowProvider>
        <NodeType
          data={mockNodeData("test-def") as any}
          selected={false}
        />
      </ReactFlowProvider>
    );

    // Wrapper + DefaultNodeRenderer both render ports.
    const handles = container.querySelectorAll("[data-nodera-port-id]");
    expect(handles.length).toBeGreaterThanOrEqual(2);
  });

  it("custom renderer id resolves custom component", () => {
    const registry = new NodeRendererRegistry();
    registry.register("custom-node", CustomMarker as ComponentType);

    const NodeType = createNodeType(registry);

    const { container } = render(
      <ReactFlowProvider>
        <NodeType
          data={mockNodeData("test-def", "custom-node") as any}
          selected={false}
        />
      </ReactFlowProvider>
    );

    expect(container.querySelector('[data-testid="custom-marker"]')).toBeTruthy();
  });
});