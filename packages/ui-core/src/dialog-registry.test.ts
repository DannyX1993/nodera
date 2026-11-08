import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIALOG_DEFAULTS,
  resolveDialogDefaults,
  type DialogDefinition,
} from "./dialog-definition.js";
import { DialogRegistry } from "./dialog-registry.js";

const createNode: DialogDefinition = {
  id: "acme.dialog.create-node",
  title: "Create node",
  description: "Pick the node definition to add.",
  size: "lg",
};

const confirmDelete: DialogDefinition = {
  id: "acme.dialog.confirm-delete",
  title: "Delete selection?",
  dismissible: false,
};

describe("DialogRegistry", () => {
  it("registers dialog definitions and enumerates them in registration order", () => {
    const registry = new DialogRegistry();

    expect(registry.register(createNode).ok).toBe(true);
    expect(registry.register(confirmDelete).ok).toBe(true);

    expect(registry.size).toBe(2);
    expect(registry.all().map((dialog) => dialog.id)).toEqual([
      "acme.dialog.create-node",
      "acme.dialog.confirm-delete",
    ]);
    expect(registry.has("acme.dialog.create-node")).toBe(true);
  });

  it("rejects a duplicate dialog id instead of overwriting it", () => {
    const registry = new DialogRegistry();
    registry.register(createNode);

    const result = registry.register({ ...createNode, title: "Another create node" });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("duplicate-id");
    expect(!result.ok && result.error.message).toBe(
      'dialog-registry already contains a definition with id "acme.dialog.create-node"',
    );
    expect(registry.get("acme.dialog.create-node")?.title).toBe("Create node");
  });

  it("reports an unknown dialog id as not-found", () => {
    const registry = new DialogRegistry();
    registry.register(createNode);

    expect(registry.get("acme.dialog.confirm-delete")).toBeUndefined();
    const required = registry.require("acme.dialog.confirm-delete");
    expect(required.ok).toBe(false);
    expect(!required.ok && required.error.kind).toBe("not-found");
    expect(!required.ok && required.error.message).toBe(
      'dialog-registry has no definition with id "acme.dialog.confirm-delete"',
    );
    expect(registry.unregister("acme.dialog.confirm-delete").ok).toBe(false);
  });

  it("stops listing a dialog after unregister", () => {
    const registry = new DialogRegistry();
    registry.register(createNode);

    const removed = registry.unregister("acme.dialog.create-node");

    expect(removed.ok).toBe(true);
    expect(registry.has("acme.dialog.create-node")).toBe(false);
    expect(registry.all()).toEqual([]);
    expect(registry.size).toBe(0);
  });

  it("keeps no default dialog: an empty registry resolves nothing", () => {
    const registry = new DialogRegistry();

    // No dialog is ever opened implicitly (S14: a dialog is opened by id), so
    // the registry exposes no default selection to fall back to.
    expect("getDefault" in registry).toBe(false);
    expect("defaultDialogId" in registry).toBe(false);
    expect(registry.require("nodera.dialog.default").ok).toBe(false);
  });
});

describe("resolveDialogDefaults", () => {
  it("fills documented defaults for a dialog that declares only its title", () => {
    expect(resolveDialogDefaults(confirmDelete)).toEqual({
      size: DEFAULT_DIALOG_DEFAULTS.size,
      dismissible: false,
    });
    expect(resolveDialogDefaults(createNode)).toEqual({ size: "lg", dismissible: true });
    expect(DEFAULT_DIALOG_DEFAULTS).toEqual({ size: "md", dismissible: true });
  });

  it("keeps an explicit size and dismissible flag", () => {
    const resolved = resolveDialogDefaults({ ...createNode, size: "sm", dismissible: false });

    expect(resolved).toEqual({ size: "sm", dismissible: false });
    expect(createNode.size).toBe("lg");
  });
});
