import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIALOG_DEFAULTS,
  resolveDialogDefaults,
  type DialogDefinition,
} from "./dialog-definition.js";
import { DialogRegistry } from "./dialog-registry.js";
import {
  CREATE_NODE_DIALOG,
  DEFAULT_DIALOGS,
  NODERA_CREATE_NODE_DIALOG_ID,
} from "./defaults/default-dialogs.js";

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

/**
 * Registry without the built-in dialogs.
 *
 * The mechanical tests below are about registration rules, so they start from an
 * explicitly empty list instead of depending on what the framework ships.
 */
function emptyRegistry(): DialogRegistry {
  return new DialogRegistry({ dialogs: [] });
}

describe("DialogRegistry", () => {
  it("registers dialog definitions and enumerates them in registration order", () => {
    const registry = emptyRegistry();

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
    const registry = emptyRegistry();
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
    const registry = emptyRegistry();
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
    const registry = emptyRegistry();
    registry.register(createNode);

    const removed = registry.unregister("acme.dialog.create-node");

    expect(removed.ok).toBe(true);
    expect(registry.has("acme.dialog.create-node")).toBe(false);
    expect(registry.all()).toEqual([]);
    expect(registry.size).toBe(0);
  });

  it("keeps no default selection: a dialog is only resolved by id", () => {
    const registry = emptyRegistry();

    // No dialog is ever opened implicitly (S14: a dialog is opened by id), so
    // the registry exposes no default selection to fall back to.
    expect("getDefault" in registry).toBe(false);
    expect("defaultDialogId" in registry).toBe(false);
    expect(registry.require("nodera.dialog.default").ok).toBe(false);
  });
});

describe("Built-in dialogs", () => {
  it("ships the create-node dialog as data with a qualified id", () => {
    expect(NODERA_CREATE_NODE_DIALOG_ID).toBe("nodera.dialog.create-node");
    expect(CREATE_NODE_DIALOG.id).toBe(NODERA_CREATE_NODE_DIALOG_ID);
    expect(CREATE_NODE_DIALOG.title).toBe("Create node");
    expect(typeof CREATE_NODE_DIALOG.description).toBe("string");
    expect(CREATE_NODE_DIALOG.size).toBe("lg");
    expect(CREATE_NODE_DIALOG.dismissible).toBe(true);
  });

  it("lists the create-node dialog in the default set", () => {
    expect(DEFAULT_DIALOGS.map((dialog) => dialog.id)).toEqual([NODERA_CREATE_NODE_DIALOG_ID]);
    expect(DEFAULT_DIALOGS).toContain(CREATE_NODE_DIALOG);
  });

  it("seeds the built-in dialogs when the host declares none", () => {
    const registry = new DialogRegistry();

    expect(registry.all()).toEqual([...DEFAULT_DIALOGS]);
    expect(registry.has(NODERA_CREATE_NODE_DIALOG_ID)).toBe(true);
    expect(registry.require(NODERA_CREATE_NODE_DIALOG_ID).ok).toBe(true);
  });

  it("replaces the built-in list when the host passes its own", () => {
    const registry = new DialogRegistry({ dialogs: [confirmDelete] });

    expect(registry.all()).toEqual([confirmDelete]);
    expect(registry.has(NODERA_CREATE_NODE_DIALOG_ID)).toBe(false);
    expect(registry.require(NODERA_CREATE_NODE_DIALOG_ID).ok).toBe(false);
  });

  it("removes every built-in dialog for an explicitly empty list", () => {
    const registry = new DialogRegistry({ dialogs: [] });

    expect(registry.all()).toEqual([]);
    expect(registry.size).toBe(0);
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
